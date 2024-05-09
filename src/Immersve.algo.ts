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

// CardFundData
type CardFundData = {
    partnerChannel: Address;
    owner: Address;
    address: Address;
    nonce: uint64;
};

// Withdrawal request for an amount of an asset, where the timestamp indicates the earliest it can be made
type WithdrawalRequest = {
    cardFund: Address;
    recipient: Address;
    asset: AssetID;
    amount: uint64;
    timestamp: uint64;
    nonce: uint64;
};

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

export class Master extends Contract.extend(Ownable, Pausable) {
    // ========== Storage ==========
    // Card Funds
    card_funds = BoxMap<Address, CardFundData>({ prefix: 'cf' });

    card_funds_active_count = GlobalStateKey<uint64>({ key: 'cfac' });

    // Partner Channels
    partner_channels = BoxMap<Address, string>({ prefix: 'pc' });

    partner_channels_active_count = GlobalStateKey<uint64>({ key: 'pcac' });

    // Seconds to wait
    withdrawal_wait_time = GlobalStateKey<uint64>({ key: 'wwt' });

    // Early withdrawal public key
    early_withdrawal_pubkey = GlobalStateKey<bytes32>({ key: 'ewpk' });

    // Withdrawal requests
    withdrawals = LocalStateMap<bytes32, WithdrawalRequest>({ maxKeys: 15 });

    // Withdrawal nonce
    withdrawal_nonce = LocalStateKey<uint64>({ key: 'wn' });

    // Settlement nonce
    settlement_nonce = GlobalStateKey<uint64>({ key: 'sn' });

    // Settlement address
    settlement_address = BoxMap<AssetID, Address>({ prefix: 'sa' });

    // Refund address
    refund_address = GlobalStateKey<Address>({ key: 'ra' });

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
        /** Timestamp that must be reached before withdrawal can be completed */
        timestamp: uint64;
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
        /** Withdrawal nonce */
        nonce: uint64;
    }>();

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

    private withdrawFunds(withdrawal: WithdrawalRequest): void {
        sendAssetTransfer({
            sender: withdrawal.cardFund,
            assetReceiver: withdrawal.recipient,
            xferAsset: withdrawal.asset,
            assetAmount: withdrawal.amount,
        });

        // Emit withdrawal event
        this.Withdrawal.log({
            cardFund: withdrawal.cardFund,
            recipient: withdrawal.recipient,
            asset: withdrawal.asset,
            amount: withdrawal.amount,
            nonce: withdrawal.nonce,
        });
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
     * Sets the early withdrawal public key.
     * @param pubkey - The public key to set.
     */
    setEarlyWithdrawalPubkey(pubkey: bytes32): void {
        this.onlyOwner();

        this.early_withdrawal_pubkey.value = pubkey;
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
        // Box Cost: 2500 + 400 * (Prefix + Address + (partnerChannel + owner + address + nonce))
        const boxCost = 2500 + 400 * (3 + 32 + (32 + 32 + 32 + 8));
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

        const cardFundData: CardFundData = {
            partnerChannel: partnerChannel,
            owner: this.txn.sender,
            address: globals.zeroAddress,
            nonce: 0,
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

        sendPayment({
            sender: cardFund,
            receiver: cardFund,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const cardFundSize = this.card_funds(cardFund).size;
        const boxCost = 2500 + 400 * (1 + 32 + cardFundSize);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the card from the box
        this.card_funds(cardFund).delete();

        // Decrement active card funds
        this.card_funds_active_count.value = this.card_funds_active_count.value - 1;
    }

    /**
     * Recovers funds from an old card and transfers them to a new card.
     * Only the owner of the contract can perform this operation.
     *
     * @param cardFund - The card fund to recover.
     * @param newCardFundHolder - The address of the new card holder.
     */
    cardFundRecover(cardFund: Address, newCardFundHolder: Address): void {
        this.onlyOwner();

        // eslint-disable-next-line no-unused-vars
        const oldCardFundHolder = this.card_funds(cardFund).value.owner;
        this.card_funds(cardFund).value.owner = newCardFundHolder;

        // TODO: Emit CardFundRecovered
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
        this.onlyOwner();

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
     * Retrieves the refund address.
     *
     * @returns The refund address.
     */
    @abi.readonly
    getRefundAddress(): Address {
        return this.refund_address.value;
    }

    /**
     * Sets the refund address.
     * Only the owner of the contract can call this method.
     *
     * @param newRefundAddress The new refund address to be set.
     */
    setRefundAddress(newRefundAddress: Address): void {
        this.onlyOwner();

        this.refund_address.value = newRefundAddress;
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

        assert(this.txn.sender === this.refund_address.value, 'SENDER_NOT_ALLOWED');

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
        this.onlyOwner();

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
     * @returns Withdrawal hash used for completing or cancelling the withdrawal
     */
    @allow.call('NoOp')
    @allow.call('OptIn')
    cardFundWithdrawalRequest(cardFund: Address, recipient: Address, asset: AssetID, amount: uint64): bytes32 {
        assert(this.isOwner() || this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');

        const withdrawal: WithdrawalRequest = {
            cardFund: cardFund,
            recipient: recipient,
            asset: asset,
            amount: amount,
            timestamp: globals.latestTimestamp + this.withdrawal_wait_time.value,
            nonce: this.withdrawal_nonce(this.txn.sender).value,
        };
        this.withdrawal_nonce(this.txn.sender).value = this.withdrawal_nonce(this.txn.sender).value + 1;
        const withdrawal_hash = sha256(rawBytes(withdrawal));

        this.withdrawals(this.txn.sender, withdrawal_hash).value = withdrawal;

        this.WithdrawalRequest.log({
            cardFund: withdrawal.cardFund,
            recipient: withdrawal.recipient,
            asset: withdrawal.asset,
            amount: withdrawal.amount,
            timestamp: withdrawal.timestamp,
            nonce: withdrawal.nonce,
        });

        return withdrawal_hash;
    }

    /**
     * Allows the Card Holder (or contract owner) to cancel a withdrawal request
     * @param cardFund Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    cardFundWithdrawalCancel(cardFund: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');

        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Allows the Card Holder to send an amount of assets from the account
     * @param cardFund Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    cardFundWithdraw(cardFund: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        assert(globals.latestTimestamp >= withdrawal.timestamp || this.isOwner(), 'WITHDRAWAL_TIME_INVALID');

        // Issue the withdrawal
        this.withdrawFunds(withdrawal);

        // Delete the withdrawal request
        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Withdraws funds before the withdrawal timestamp has lapsed, by using the early withdrawal signature provided by Immersve.
     * @param cardFund - The address of the card.
     * @param withdrawal_hash - The hash of the withdrawal.
     * @param early_withdrawal_sig - The signature for early withdrawal.
     */
    cardFundWithdrawEarly(cardFund: Address, withdrawal_hash: bytes32, early_withdrawal_sig: bytes64): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        // If the withdrawal timestamp has lapsed, there's no need to use the early withdrawal signature
        if (globals.latestTimestamp < withdrawal.timestamp) {
            // Need at least 2000 Opcode budget
            // TODO: Optimise?
            while (globals.opcodeBudget < 2500) {
                increaseOpcodeBudget();
            }

            assert(
                ed25519VerifyBare(withdrawal_hash, early_withdrawal_sig, this.early_withdrawal_pubkey.value),
                'SIGNATURE_INVALID'
            );
        }

        // Issue the withdrawal
        this.withdrawFunds(withdrawal);

        // Delete the withdrawal request
        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }
}
