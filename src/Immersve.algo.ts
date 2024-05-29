/*
 * MIT License
 *
 * Copyright (c) 2024 Algorand Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
import { Contract } from '@algorandfoundation/tealscript';
import { Ownable } from './roles/Ownable.algo';
import { Pausable } from './roles/Pausable.algo';
import { Recoverable } from './roles/Recoverable.algo';

// CardFundData
type CardFundData = {
    partnerChannel: Address;
    owner: Address;
    address: Address;
    nonce: uint64;
    withdrawalNonce: uint64;
};

type PartnerCardFundData = {
  partnerChannel: Address;
  cardFundOwner: Address;
}

// Withdrawal request for an amount of an asset, where the timestamp indicates the earliest it can be made
type PermissionlessWithdrawalRequest = {
    cardFund: Address;
    recipient: Address;
    asset: AssetID;
    amount: uint64;
    createdAt: uint64;
    nonce: uint64;
};

type ApprovedWithdrawalRequest = {
  cardFund: Address;
  recipient: Address;
  asset: AssetID;
  amount: uint64;
  expiresAt: uint64;
  nonce: uint64;
  genesisHash: bytes32;
};

const WithdrawalTypeApproved = 'approved';
const WithdrawalTypePermissionLess = 'permissionless';

// eslint-disable-next-line no-unused-vars
class Placeholder extends Contract.extend(Ownable, Pausable) {
    // Updatable and destroyable placeholder contract
    @allow.create('NoOp')
    deploy(): void {
        this._transferOwnership(this.txn.sender);
        this._pauser.value = this.txn.sender;
    }

    @allow.call('UpdateApplication')
    update(): void {
        assert(this.txn.sender === this.app.creator, 'SENDER_NOT_ALLOWED');
    }

    @allow.call('DeleteApplication')
    destroy(): void {
        assert(this.txn.sender === this.app.creator, 'SENDER_NOT_ALLOWED');
    }
}

class ControlledAddress extends Contract {
    /**
     * Create a new account, rekeying it to the caller application address
     * @returns New account address
     */
    @allow.create('DeleteApplication')
    new(): Address {
        sendPayment({
            receiver: this.app.address,
            amount: 0,
            rekeyTo: globals.callerApplicationAddress,
        });

        return this.app.address;
    }
}

export class Master extends Contract.extend(Ownable, Pausable, Recoverable) {
    // ========== Storage ==========
    // Card Funds
    card_funds = BoxMap<Address, CardFundData>({ prefix: 'cf' });

    card_funds_active_count = GlobalStateKey<uint64>({ key: 'cfac' });

    // Partner Channels
    partner_channels = BoxMap<Address, string>({ prefix: 'pc' });

    // A map where the key is the partner channel address + the card fund owner address, hashed
    // The value is the address of the cardFund the account owns
    partner_card_fund_owner = BoxMap<bytes32, Address>({ prefix: 'co' });

    partner_channels_active_count = GlobalStateKey<uint64>({ key: 'pcac' });

    // Seconds to wait
    withdrawal_wait_time = GlobalStateKey<uint64>({ key: 'wwt' });

    // Withdrawal requests
    // Only one allowed at any given point
    withdrawals = LocalStateKey<PermissionlessWithdrawalRequest>({ key: 'wr' });

    // Settlement nonce
    settlement_nonce = GlobalStateKey<uint64>({ key: 'sn' });

    // Settlement address
    settlement_address = BoxMap<AssetID, Address>({ prefix: 'sa' });

    // Settler role address
    settler_role_address = GlobalStateKey<Address>({ key: 'ra' });

    // ========== Events ==========
    /**
     * Partner Channel Created event
     */
    PartnerChannelCreated = new EventLogger<{
        /** Partner Channel */
        partnerChannel: Address;
        /** Partner Channel Name */
        partnerChannelName: string;
    }>();

    /**
     * Card Created event
     */
    CardFundCreated = new EventLogger<{
        /** Card Fund Owner */
        cardFundOwner: Address;
        /** Card Fund */
        cardFund: Address;
        /** Partner Channel */
        partnerChannel: Address;
    }>();

    /**
     * Card Fund Asset Enabled event
     */
    CardFundAssetEnabled = new EventLogger<{
        /** Card Fund */
        cardFund: Address;
        /** Asset */
        asset: AssetID;
    }>();

    /**
     * Card Fund Asset Disabled event
     */
    CardFundAssetDisabled = new EventLogger<{
        /** Card Fund */
        cardFund: Address;
        /** Asset */
        asset: AssetID;
    }>();

    /**
     * Asset Allowlist Added event
     */
    AssetAllowlistAdded = new EventLogger<{
        /** Asset added to allowlist */
        asset: AssetID;
    }>();

    /**
     * Asset Allowlist Removed event
     */
    AssetAllowlistRemoved = new EventLogger<{
        /** Asset removed from allowlist */
        asset: AssetID;
    }>();

    /**
     * Debit event
     */
    Debit = new EventLogger<{
        /** Funding Source being debited from */
        card: Address;
        /** Asset being debited */
        asset: AssetID;
        /** Amount being debited */
        amount: uint64;
        /** Nonce used */
        nonce: uint64;
        /** Transaction reference */
        reference: string;
    }>();

    /**
     * Refund event
     */
    Refund = new EventLogger<{
        /** Funding Source being refunded to */
        card: Address;
        /** Asset being refunded */
        asset: AssetID;
        /** Amount being refunded */
        amount: uint64;
        /** Nonce used */
        nonce: uint64;
    }>();

    SettlementAddressChanged = new EventLogger<{
        /** Old settlement address  */
        oldSettlementAddress: Address;
        /** New settlement address */
        newSettlementAddress: Address;
    }>();

    /**
     * Settlement event
     */
    Settlement = new EventLogger<{
        /** Settlement destination address */
        recipient: Address;
        /** Asset being settled */
        asset: AssetID;
        /** Amount being settled */
        amount: uint64;
        /** Settlement nonce to prevent duplicate settlements */
        nonce: uint64;
    }>();

    /**
     * Withdrawal Request event
     */
    WithdrawalRequest = new EventLogger<{
        /** Funding Source to withdraw from */
        cardFund: Address;
        /** Recipient address to withdraw to */
        recipient: Address;
        /** Asset to withdraw */
        asset: AssetID;
        /** Amount to withdraw */
        amount: uint64;
        /** Withdrawal Creation Timestamp */
        createdAt: uint64;
        /** Withdrawal nonce */
        nonce: uint64;
    }>();

    /**
     * Withdrawal Request Cancelled event
     */
    WithdrawalRequestCancelled = new EventLogger<{
      /** Funding Source to withdraw from */
      cardFund: Address;
      /** Recipient address to withdraw to */
      recipient: Address;
      /** Asset to withdraw */
      asset: AssetID;
      /** Amount to withdraw */
      amount: uint64;
      /** Withdrawal Creation Timestamp */
      createdAt: uint64;
      /** Withdrawal nonce */
      nonce: uint64;
  }>();

    /**
     * Withdrawal event
     */
    Withdrawal = new EventLogger<{
        /** Funding Source withdrawn from */
        cardFund: Address;
        /** Recipient address withdrawn to */
        recipient: Address;
        /** Asset withdrawn */
        asset: AssetID;
        /** Amount withdrawn */
        amount: uint64;
        /** Permissionless withdrawal creation time */
        createdAt: uint64;
        /** Approved withdrawal expiration time */
        expiresAt: uint64;
        /** Withdrawal nonce */
        nonce: uint64;
        /** Withdrawal type */
        type: string
    }>();

    protected onlySettler(): void {
      assert(this.txn.sender === this.settler_role_address.value, 'SENDER_NOT_ALLOWED');
    }

    public getCardFundByPartner(partnerChannel: Address, cardFundOwner: Address): Address {
      const partnerCardFundOwnerKeyData: PartnerCardFundData = {
        partnerChannel: partnerChannel,
        cardFundOwner: cardFundOwner
      }
      const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));
      assert(this.partner_card_fund_owner(partnerCardFundOwnerKey).exists, 'CARD_FUND_NOT_FOUND');
      return this.partner_card_fund_owner(partnerCardFundOwnerKey).value;
    }
    // ========== Internal Utils ==========
    /**
     * Check if the current transaction sender is the Card Fund holder/owner
     * @param cardFund Card Fund address
     * @returns True if the sender is the Card Holder of the card
     */
    private isCardFundOwner(cardFund: Address): boolean {
        assert(this.card_funds(cardFund).exists, 'CARD_FUND_NOT_FOUND');
        return this.card_funds(cardFund).value.owner === this.txn.sender;
    }

    /**
     * Opt-in a Card Fund into an asset. Minimum balance requirement must be met prior to calling this function.
     * @param cardFund Card Fund address
     * @param asset Asset to opt-in to
     */
    private cardFundAssetOptIn(cardFund: Address, asset: AssetID): void {
        // Only proceed if the master allowlist accepts it
        assert(this.app.address.isOptedInToAsset(asset), 'ASSET_NOT_OPTED_IN');

        sendAssetTransfer({
            sender: cardFund,
            assetReceiver: cardFund,
            xferAsset: asset,
            assetAmount: 0,
        });

        this.CardFundAssetEnabled.log({
            cardFund: cardFund,
            asset: asset,
        });
    }

    private cardFundAssetCloseOut(cardFund: Address, asset: AssetID): void {
        sendAssetTransfer({
            sender: cardFund,
            assetReceiver: cardFund,
            assetCloseTo: cardFund,
            xferAsset: asset,
            assetAmount: 0,
        });

        sendPayment({
            sender: cardFund,
            receiver: this.txn.sender,
            amount: this.getCardFundAssetMbr(),
        });

        this.CardFundAssetDisabled.log({
            cardFund: cardFund,
            asset: asset,
        });
    }

    private withdrawFunds(cardFund: Address, asset: AssetID, amount: uint64, timestamp: uint64, nonce: uint64, withdrawalType: string): void {
        // if amount is zero, we skip the asset transfer
        if (amount > 0) {
          sendAssetTransfer({
              sender: cardFund,
              assetReceiver: this.txn.sender,
              xferAsset: asset,
              assetAmount: amount,
          });
        }

        // Emit withdrawal event
        this.Withdrawal.log({
            cardFund: cardFund,
            recipient: this.txn.sender,
            asset: asset,
            amount: amount,
            createdAt: withdrawalType == WithdrawalTypePermissionLess ? timestamp : 0,
            expiresAt: withdrawalType == WithdrawalTypeApproved ? timestamp : 0,
            nonce: nonce,
            type: withdrawalType,
        });

        this.card_funds(cardFund).value.withdrawalNonce = nonce + 1;
    }

    private updateSettlementAddress(asset: AssetID, newSettlementAddress: Address): void {
        const oldSettlementAddress = this.settlement_address(asset).exists
            ? this.settlement_address(asset).value
            : globals.zeroAddress;
        this.settlement_address(asset).value = newSettlementAddress;

        this.SettlementAddressChanged.log({
            oldSettlementAddress: oldSettlementAddress,
            newSettlementAddress: newSettlementAddress,
        });
    }

    // ========== External Methods ==========
    /**
     * Deploy a partner channel, setting the owner as provided
     */
    @allow.create('NoOp')
    deploy(owner: Address): Address {
        this._transferOwnership(owner);
        this._pauser.value = this.txn.sender;

        return this.app.address;
    }

    /**
     * Allows the owner to update the smart contract
     */
    @allow.call('UpdateApplication')
    update(): void {
        this.onlyOwner();
    }

    /**
     * Destroy the smart contract, sending all Algo to the owner account. This can only be done if there are no active card funds
     */
    @allow.call('DeleteApplication')
    destroy(): void {
        this.onlyOwner();

        // There must not be any active card fund
        assert(!this.card_funds_active_count.value, 'CARD_FUNDS_STILL_ACTIVE');
        // There must not be any active partner channels
        assert(!this.partner_channels_active_count.value, 'PARTNER_CHANNELS_STILL_ACTIVE');

        sendPayment({
            receiver: this.app.address,
            amount: 0,
            closeRemainderTo: this.owner(),
        });
    }

    // ===== Owner Methods =====
    /**
     * Set the number of seconds a withdrawal request must wait until being withdrawn
     * @param seconds New number of seconds to wait
     */
    setWithdrawalTimeout(seconds: uint64): void {
        this.onlyOwner();

        this.withdrawal_wait_time.value = seconds;
    }

    /**
     * Retrieves the minimum balance requirement for creating a partner channel account.
     * @param partnerChannelName - The name of the partner channel.
     * @returns The minimum balance requirement for creating a partner channel account.
     */
    getPartnerChannelMbr(partnerChannelName: string): uint64 {
        const boxCost = 2500 + 400 * (3 + 32 + len(partnerChannelName));
        return globals.minBalance + globals.minBalance + boxCost;
    }

    /**
     * Creates a partner channel account and associates it with the provided partner channel name.
     * Only the owner of the contract can call this function.
     *
     * @param mbr - The PayTxn object representing the payment transaction.
     * @param partnerChannelName - The name of the partner channel.
     * @returns The address of the newly created partner channel account.
     */
    partnerChannelCreate(mbr: PayTxn, partnerChannelName: string): Address {
        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: this.getPartnerChannelMbr(partnerChannelName),
        });

        // Create a new account
        const partnerChannelAddr = sendMethodCall<typeof ControlledAddress.prototype.new>({
            onCompletion: OnCompletion.DeleteApplication,
            approvalProgram: ControlledAddress.approvalProgram(),
            clearStateProgram: ControlledAddress.clearProgram(),
        });

        // Fund the account with a minimum balance
        sendPayment({
            receiver: partnerChannelAddr,
            amount: globals.minBalance,
        });

        this.partner_channels(partnerChannelAddr).value = partnerChannelName;

        // Increment active partner channels
        this.partner_channels_active_count.value = this.partner_channels_active_count.value + 1;

        this.PartnerChannelCreated.log({
            partnerChannel: partnerChannelAddr,
            partnerChannelName: partnerChannelName,
        });

        return partnerChannelAddr;
    }

    partnerChannelClose(partnerChannel: Address): void {
        this.onlyOwner();

        sendPayment({
            sender: partnerChannel,
            receiver: partnerChannel,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const partnerChannelSize = this.partner_channels(partnerChannel).size;
        const boxCost = 2500 + 400 * (3 + 32 + partnerChannelSize);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the partner channel from the box
        this.partner_channels(partnerChannel).delete();

        // Decrement active partner channels
        this.partner_channels_active_count.value = this.partner_channels_active_count.value - 1;
    }

    /**
     * Retrieves the minimum balance requirement for creating a card fund account.
     * @param asset Asset to opt-in to. 0 = No asset opt-in
     * @returns Minimum balance requirement for creating a card fund account
     */
    getCardFundMbr(asset: AssetID): uint64 {
        // TODO: Double check size requirement is accurate. The prefix doesn't seem right.
        // Card Fund Data Box Cost: 2500 + 400 * (Prefix + Address + (partnerChannel + owner + address + nonce + withdrawalNonce))
        const cardFundDataBoxCost = 2500 + 400 * (3 + 32 + (32 + 32 + 32 + 8 + 8));
        // Partner Card Fund Owner Box Cost: 2500 + 400 * (Prefix + hashed key(32 bytes) + cardFundAddress)
        const partnerCardFundOwnerBoxCost = 2500 + 400 * (2 + 32 + 32);

        const boxCost = cardFundDataBoxCost + partnerCardFundOwnerBoxCost;
        const assetMbr = asset ? globals.assetOptInMinBalance : 0;
        return globals.minBalance + assetMbr + boxCost;
    }

    /**
     * Create account. This generates a brand new account and funds the minimum balance requirement
     * @param mbr Payment transaction of minimum balance requirement
     * @param partnerChannel Funding Channel name
     * @param asset Asset to opt-in to. 0 = No asset opt-in
     * @returns Newly generated account used by their card
     */
    cardFundCreate(mbr: PayTxn, partnerChannel: Address, asset: AssetID): Address {
        assert(this.partner_channels(partnerChannel).exists, 'PARTNER_CHANNEL_NOT_FOUND');
        const partnerCardFundOwnerKeyData: PartnerCardFundData = {
          partnerChannel: partnerChannel,
          cardFundOwner: this.txn.sender
        }
        const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));
        assert(!this.partner_card_fund_owner(partnerCardFundOwnerKey).exists, 'CARD_FUND_ALREADY_EXISTS');

        const cardFundData: CardFundData = {
            partnerChannel: partnerChannel,
            owner: this.txn.sender,
            address: globals.zeroAddress,
            nonce: 0,
            withdrawalNonce: 0,
        };

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: this.getCardFundMbr(asset),
        });

        // Create a new account
        const cardFundAddr = sendMethodCall<typeof ControlledAddress.prototype.new>({
            onCompletion: OnCompletion.DeleteApplication,
            approvalProgram: ControlledAddress.approvalProgram(),
            clearStateProgram: ControlledAddress.clearProgram(),
        });

        // Update the card fund data with the newly generated address
        cardFundData.address = cardFundAddr;

        // Fund the account with a minimum balance
        const assetMbr = asset ? globals.assetOptInMinBalance : 0;
        sendPayment({
            receiver: cardFundAddr,
            amount: globals.minBalance + assetMbr,
        });

        // Opt-in to the asset if provided
        if (asset) {
            this.cardFundAssetOptIn(cardFundAddr, asset);
        }

        // Store new card along with Card Holder
        this.card_funds(cardFundAddr).value = cardFundData;

        // Increment active card funds
        this.card_funds_active_count.value = this.card_funds_active_count.value + 1;

        // Add the card fund to the partner_card_fund_owner index map
        this.partner_card_fund_owner(partnerCardFundOwnerKey).value = cardFundAddr;

        this.CardFundCreated.log({
            cardFundOwner: this.txn.sender,
            cardFund: cardFundAddr,
            partnerChannel: partnerChannel,
        });

        // Return the new account address
        return cardFundAddr;
    }

    /**
     * Close account. This permanently removes the rekey and deletes the account from the ledger
     * @param cardFund Address to close
     */
    cardFundClose(cardFund: Address): void {
        assert(this.isOwner() || this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        const cardFundData = this.card_funds(cardFund).value;
        const partnerCardFundOwnerKeyData: PartnerCardFundData = {
          partnerChannel: cardFundData.partnerChannel,
          cardFundOwner: cardFundData.owner
        }
        const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));

        sendPayment({
            sender: cardFund,
            receiver: cardFund,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const cardFundSize = this.card_funds(cardFund).size;
        const partnerCardFundOwnerSize = this.partner_card_fund_owner(partnerCardFundOwnerKey).size;
        const card_funds_boxCost = 2500 + 400 * (1 + 32 + cardFundSize);
        const partner_card_fund_owner_boxCost = 2500 + 400 * (1 + 32 + partnerCardFundOwnerSize);
        const boxCost = card_funds_boxCost + partner_card_fund_owner_boxCost;

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the card from the box
        this.card_funds(cardFund).delete();

        // Decrement active card funds
        this.card_funds_active_count.value = this.card_funds_active_count.value - 1;

        // Remove the card fund from the partner_card_fund_owner index map
        this.partner_card_fund_owner(partnerCardFundOwnerKey).delete();
    }

    /**
     * Retrieves the minimum balance requirement for adding an asset to the allowlist.
     * @returns Minimum balance requirement for adding an asset to the allowlist
     */
    getAssetAllowlistMbr(): uint64 {
        // Box Cost: 2500 + 400 * (Prefix + AssetID + Address)
        const ASSET_SETTLEMENT_ADDRESS_COST = 2500 + 400 * (2 + 8 + 32);
        return globals.assetOptInMinBalance + ASSET_SETTLEMENT_ADDRESS_COST;
    }

    /**
     * Allows the master contract to flag intent of accepting an asset.
     *
     * @param mbr Payment transaction of minimum balance requirement.
     * @param asset The AssetID of the asset being transferred.
     */
    assetAllowlistAdd(mbr: PayTxn, asset: AssetID, settlementAddress: Address): void {
        this.onlyOwner();

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: this.getAssetAllowlistMbr(),
        });

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.app.address,
            xferAsset: asset,
            assetAmount: 0,
        });

        this.AssetAllowlistAdded.log({ asset: asset });

        this.updateSettlementAddress(asset, settlementAddress);
    }

    /**
     * Allows the master contract to reject accepting an asset.
     *
     * @param asset - The AssetID of the asset being transferred.
     */
    assetAllowlistRemove(asset: AssetID): void {
        this.onlyOwner();

        // Asset balance must be zero to close out of it. Consider settling the asset balance before revoking it.
        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.app.address,
            assetCloseTo: this.app.address,
            xferAsset: asset,
            assetAmount: 0,
        });

        // Delete the settlement address, freeing up MBR
        this.settlement_address(asset).delete();

        sendPayment({
            receiver: this.txn.sender,
            amount: this.getAssetAllowlistMbr(),
        });

        this.AssetAllowlistRemoved.log({ asset: asset });
    }

    /**
     * Debits the specified amount of the given asset from the card account.
     * Only the owner of the contract can perform this operation.
     *
     * @param cardFund The card fund from which the asset will be debited.
     * @param asset The asset to be debited.
     * @param amount The amount of the asset to be debited.
     */
    cardFundDebit(cardFund: Address, asset: AssetID, amount: uint64, nonce: uint64, ref: string): void {
        this.whenNotPaused();
        this.onlySettler();

        // Ensure the nonce is correct
        const nextNonce = this.card_funds(cardFund).value.nonce;
        assert(nextNonce === nonce, 'NONCE_INVALID');

        sendAssetTransfer({
            sender: cardFund,
            assetReceiver: this.app.address,
            xferAsset: asset,
            assetAmount: amount,
            note: ref,
        });

        this.Debit.log({
            card: cardFund,
            asset: asset,
            amount: amount,
            nonce: nonce,
            reference: ref,
        });

        // Increment the nonce
        this.card_funds(cardFund).value.nonce = nextNonce + 1;
    }

    /**
     * Retrieves the settler role address.
     *
     * @returns The settler role address.
     */
    @abi.readonly
    getSettlerRole(): Address {
        return this.settler_role_address.value;
    }

    /**
     * Sets the settler role address.
     * Only the owner of the contract can call this method.
     *
     * @param newSettlerAddress The new settler role address to be set.
     */
    setSettlerRole(newSettlerAddress: Address): void {
        this.onlyOwner();

        this.settler_role_address.value = newSettlerAddress;
    }

    /**
     * Refunds a specified amount of an asset to a card account.
     * Only the owner of the contract can perform this operation.
     *
     * @param cardFund - The card account to refund the asset to.
     * @param asset - The asset to refund.
     * @param amount - The amount of the asset to refund.
     */
    cardFundRefund(cardFund: Address, asset: AssetID, amount: uint64, nonce: uint64): void {
        this.whenNotPaused();
        this.onlySettler();

        // Ensure the nonce is correct
        const nextNonce = this.card_funds(cardFund).value.nonce;
        assert(nextNonce === nonce, 'NONCE_INVALID');

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: cardFund,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Refund.log({
            card: cardFund,
            asset: asset,
            amount: amount,
            nonce: nonce,
        });

        // Increment the nonce
        this.card_funds(cardFund).value.nonce = nextNonce + 1;
    }

    /**
     * Retrieves the next available nonce for settlements.
     *
     * @returns The settlement nonce.
     */
    @abi.readonly
    getNextSettlementNonce(): uint64 {
        return this.settlement_nonce.value;
    }

    /**
     * Retrieves the next available nonce for the card fund.
     *
     * @param cardFund The card fund address.
     * @returns The nonce for the card fund.
     */
    @abi.readonly
    getNextCardFundNonce(cardFund: Address): uint64 {
        return this.card_funds(cardFund).value.nonce;
    }

    /**
     * Retrieves the next available nonce for the card fund.
     *
     * @param cardFund The card fund address.
     * @returns The nonce for the card fund.
     */
    @abi.readonly
    getCardFundWithdrawalNonce(cardFund: Address): uint64 {
        return this.card_funds(cardFund).value.withdrawalNonce;
    }

    /**
     * Retrieves the card fund data for a given card fund address.
     *
     * @param cardFund The address of the card fund.
     * @returns The card fund data.
     */
    @abi.readonly
    getCardFundData(cardFund: Address): CardFundData {
        return this.card_funds(cardFund).value;
    }

    /**
     * Retrieves the settlement address for the specified asset.
     *
     * @param asset The ID of the asset.
     * @returns The settlement address for the asset.
     */
    @abi.readonly
    getSettlementAddress(asset: AssetID): Address {
        return this.settlement_address(asset).value;
    }

    /**
     * Sets the settlement address for a given settlement asset.
     * Only the owner of the contract can call this method.
     *
     * @param settlementAsset The ID of the settlement asset.
     * @param newSettlementAddress The new settlement address to be set.
     */
    setSettlementAddress(settlementAsset: AssetID, newSettlementAddress: Address): void {
        this.onlyOwner();

        this.updateSettlementAddress(settlementAsset, newSettlementAddress);
    }

    /**
     * Settles a payment by transferring an asset to the specified recipient.
     * Only the owner of the contract can call this function.
     *
     * @param asset The asset to be transferred.
     * @param amount The amount of the asset to be transferred.
     * @param nonce The nonce to prevent duplicate settlements.
     */
    settle(asset: AssetID, amount: uint64, nonce: uint64): void {
        this.whenNotPaused();
        this.onlySettler();

        // Ensure the nonce is correct
        assert(this.settlement_nonce.value === nonce, 'NONCE_INVALID');

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.settlement_address(asset).value,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Settlement.log({
            recipient: this.settlement_address(asset).value,
            asset: asset,
            amount: amount,
            nonce: nonce,
        });

        // Increment the settlement nonce
        this.settlement_nonce.value = this.settlement_nonce.value + 1;
    }

    /**
     * Retrieves the minimum balance requirement for adding an asset to the card fund.
     * @returns The minimum balance requirement for adding an asset to the card fund.
     */
    getCardFundAssetMbr(): uint64 {
        return globals.assetOptInMinBalance;
    }

    // ===== Card Holder Methods =====
    /**
     * Allows the depositor (or owner) to OptIn to an asset, increasing the minimum balance requirement of the account
     *
     * @param cardFund Address to add asset to
     * @param asset Asset to add
     */
    cardFundEnableAsset(mbr: PayTxn, cardFund: Address, asset: AssetID): void {
        assert(this.isOwner() || this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: this.getCardFundAssetMbr(),
        });

        sendPayment({
            receiver: cardFund,
            amount: this.getCardFundAssetMbr(),
        });

        this.cardFundAssetOptIn(cardFund, asset);
    }

    /**
     * Allows the depositor (or owner) to CloseOut of an asset, reducing the minimum balance requirement of the account
     *
     * @param cardFund - The address of the card.
     * @param asset - The ID of the asset to be removed.
     */
    cardFundDisableAsset(cardFund: Address, asset: AssetID): void {
        assert(this.isOwner() || this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');

        this.cardFundAssetCloseOut(cardFund, asset);
    }

    /**
     * Allows the Card Holder (or contract owner) to send an amount of assets from the account
     * @param cardFund Address to withdraw from
     * @param asset Asset to withdraw
     * @param amount Amount to withdraw
     */
    @allow.call('NoOp')
    @allow.call('OptIn')
    cardFundInitPermissionlessWithdrawal(cardFund: Address, asset: AssetID, amount: uint64): PermissionlessWithdrawalRequest {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        const cardFundData = this.card_funds(cardFund).value;
        assert(amount <= cardFund.assetBalance(asset), 'INSUFFICIENT_BALANCE');

        const withdrawal: PermissionlessWithdrawalRequest = {
            cardFund: cardFund,
            recipient: this.txn.sender,
            asset: asset,
            amount: amount,
            createdAt: globals.latestTimestamp,
            nonce: cardFundData.withdrawalNonce,
        };

        this.withdrawals(this.txn.sender).value = withdrawal;

        this.WithdrawalRequest.log(withdrawal);

        return withdrawal;
    }

    /**
     * Allows the Card Holder (or contract owner) to cancel a withdrawal request
     * @param cardFund Address to withdraw from
     */
    cardFundWithdrawalCancel(cardFund: Address): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        assert(this.withdrawals(this.txn.sender).exists, 'WITHDRAWAL_REQUEST_NOT_FOUND')
        const withdrawal = this.withdrawals(this.txn.sender).value;
        this.withdrawals(this.txn.sender).delete();
        this.WithdrawalRequestCancelled.log(withdrawal);
    }


    /**
     * Allows the Card Holder to send an amount of assets from the account
     * @param cardFund Address to withdraw from
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    cardFundExecutePermissionlessWithdrawal(cardFund: Address, amount: uint64): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        assert(this.withdrawals(this.txn.sender).exists, 'WITHDRAWAL_REQUEST_NOT_FOUND');
        const cardFundData = this.card_funds(cardFund).value;
        const withdrawal = this.withdrawals(this.txn.sender).value;
        assert(amount <= withdrawal.amount, 'AMOUNT_INVALID');
        assert(cardFundData.withdrawalNonce == withdrawal.nonce, 'NONCE_INVALID');

        const releaseTime = withdrawal.createdAt + this.withdrawal_wait_time.value;
        assert(globals.latestTimestamp >= releaseTime, 'WITHDRAWAL_TIME_INVALID');

        // Issue the withdrawal
        this.withdrawFunds(cardFund, withdrawal.asset, amount, withdrawal.createdAt, withdrawal.nonce, WithdrawalTypePermissionLess);
        this.withdrawals(this.txn.sender).delete();
    }

    /**
     * Withdraws funds before the withdrawal timestamp has lapsed, by using the early withdrawal signature provided by Immersve.
     * @param cardFund - The address of the card.
     * @param asset - The ID of the asset to be withdrawn.
     * @param amount - The amount of the withdrawal.
     * @param expiresAt - The expiry of the withdrawal signature.
     * @param signature - The signature for early withdrawal.
     */
    cardFundExecuteApprovedWithdrawal(cardFund: Address, asset: AssetID, amount: uint64, expiresAt: uint64, nonce: uint64, signature: bytes64): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        const cardFundData = this.card_funds(cardFund).value;

        assert(globals.latestTimestamp < expiresAt, 'WITHDRAWAL_TIME_INVALID');
        assert(cardFundData.withdrawalNonce == nonce, 'NONCE_INVALID');

        const withdrawal: ApprovedWithdrawalRequest = {
          cardFund: cardFund,
          recipient: this.txn.sender,
          asset: asset,
          amount: amount,
          expiresAt: expiresAt,
          nonce: nonce,
          genesisHash: globals.genesisHash as bytes32
        };

        const withdrawal_hash = sha256(rawBytes(withdrawal));

        // Need at least 2000 Opcode budget
        // TODO: Optimise?
        while (globals.opcodeBudget < 2500) {
            increaseOpcodeBudget();
        }

        assert(
            ed25519VerifyBare(withdrawal_hash, signature, this.settler_role_address.value),
            'SIGNATURE_INVALID'
        );

        // Issue the withdrawal
        this.withdrawFunds(cardFund, asset, amount, expiresAt, cardFundData.withdrawalNonce, WithdrawalTypeApproved);
    }
}
