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

// CardFundDetails = partnerChannel + cardFundOwner
type CardFundDetails = {
    partnerChannel: string;
    cardFundOwner: Address;
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

export class Master extends Contract.extend(Ownable) {
    // ========== Storage ==========
    // Card Funds
    card_funds = BoxMap<CardFundDetails, Address>({ prefix: 'cf' });

    card_funds_active_count = GlobalStateKey<uint64>({ key: 'cfac' });

    // Partner Channels
    partner_channels = BoxMap<string, Address>({ prefix: 'pc' });

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
    settlement_address = GlobalStateKey<Address>({ key: 'sa' });

    // ========== Events ==========
    /**
     * Partner Channel Created event
     */
    PartnerChannelCreated = new EventLogger<{
        /** Partner Channel */
        partnerChannel: string;
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
        partnerChannel: string;
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
     * Check if the current transaction sender is the Card Holder of the card account
     * @param card Address to check
     * @returns True if the sender is the Card Holder of the card
     */
    private isCardFundOwner(partnerChannel: string, card: Address): boolean {
        return (
            this.card_funds({ partnerChannel: partnerChannel, cardFundOwner: this.txn.sender } as CardFundDetails)
                .value === card
        );
    }

    /**
     * Opt-in a Card Fund into an asset. Minimum balance requirement must be met prior to calling this function.
     * @param cardFund Card Fund address
     * @param asset Asset to opt-in to
     */
    private cardFundAssetOptIn(cardFund: Address, asset: AssetID): void {
        // Only proceed if the master allowlist accepts it
        assert(this.app.address.isOptedInToAsset(asset));

        sendAssetTransfer({
            sender: cardFund,
            assetReceiver: cardFund,
            xferAsset: asset,
            assetAmount: 0,
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
            amount: globals.assetOptInMinBalance,
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

    // ========== External Methods ==========
    /**
     * Deploy a partner channel, setting the owner as provided
     */
    @allow.create('NoOp')
    deploy(owner: Address): Address {
        this._transferOwnership(owner);

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
        assert(!this.card_funds_active_count.value);
        // There must not be any active partner channels
        assert(!this.partner_channels_active_count.value);

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
     * Creates a partner channel account and associates it with the provided partner channel name.
     * Only the owner of the contract can call this function.
     *
     * @param mbr - The PayTxn object representing the payment transaction.
     * @param partnerChannel - The name of the partner channel.
     * @returns The address of the newly created partner channel account.
     */
    partnerChannelCreate(mbr: PayTxn, partnerChannel: string): Address {
        assert(!this.partner_channels(partnerChannel).exists);

        const boxCost = 2500 + 400 * (3 + len(partnerChannel) + 32);

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.minBalance + globals.assetOptInMinBalance + boxCost,
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

        this.partner_channels(partnerChannel).value = partnerChannelAddr;

        // Increment active partner channels
        this.partner_channels_active_count.value = this.partner_channels_active_count.value + 1;

        this.PartnerChannelCreated.log({
            partnerChannel: partnerChannel,
        });

        return partnerChannelAddr;
    }

    partnerChannelClose(partnerChannel: string): void {
        this.onlyOwner();

        sendPayment({
            sender: this.partner_channels(partnerChannel).value,
            receiver: this.partner_channels(partnerChannel).value,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const boxCost = 2500 + 400 * (3 + len(partnerChannel) + 32);

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
     * Create account. This generates a brand new account and funds the minimum balance requirement
     * @param mbr Payment transaction of minimum balance requirement
     * @param partnerChannel Funding Channel name
     * @param asset Asset to opt-in to. 0 = No asset opt-in
     * @returns Newly generated account used by their card
     */
    cardFundCreate(mbr: PayTxn, partnerChannel: string, asset: AssetID): Address {
        assert(this.partner_channels(partnerChannel).exists);

        const cardFunds: CardFundDetails = { partnerChannel: partnerChannel, cardFundOwner: this.txn.sender };
        const boxCost = 2500 + 400 * (3 + len(cardFunds) + 32);
        const assetMbr = asset ? globals.assetOptInMinBalance : 0;

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.minBalance + assetMbr + boxCost,
        });

        // Create a new account
        const cardAddr = sendMethodCall<typeof ControlledAddress.prototype.new>({
            onCompletion: OnCompletion.DeleteApplication,
            approvalProgram: ControlledAddress.approvalProgram(),
            clearStateProgram: ControlledAddress.clearProgram(),
        });

        // Fund the account with a minimum balance
        sendPayment({
            receiver: cardAddr,
            amount: globals.minBalance + assetMbr,
        });

        // Opt-in to the asset if provided
        if (asset) {
            this.cardFundAssetOptIn(cardAddr, asset);
        }

        // Store new card along with Card Holder
        this.card_funds(cardFunds).value = cardAddr;

        // Increment active card funds
        this.card_funds_active_count.value = this.card_funds_active_count.value + 1;

        this.CardFundCreated.log({
            cardFundOwner: this.txn.sender,
            cardFund: cardAddr,
            partnerChannel: partnerChannel,
        });

        // Return the new account address
        return cardAddr;
    }

    /**
     * Close account. This permanently removes the rekey and deletes the account from the ledger
     * @param partnerChannel Funding Channel name
     * @param cardFundOwner Address which has control over asset withdrawals
     * @param card Address to close
     */
    cardFundClose(partnerChannel: string, cardFundOwner: Address, card: Address): void {
        assert(this.isOwner() || this.isCardFundOwner(partnerChannel, card));

        sendPayment({
            sender: card,
            receiver: card,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const cardFunds: CardFundDetails = { partnerChannel: partnerChannel, cardFundOwner: cardFundOwner };
        const boxCost = 2500 + 400 * (1 + len(cardFunds) + 32);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the card from the box
        this.card_funds(cardFunds).delete();

        // Decrement active card funds
        this.card_funds_active_count.value = this.card_funds_active_count.value - 1;
    }

    /**
     * Recovers funds from an old card and transfers them to a new card.
     * Only the owner of the contract can perform this operation.
     *
     * @param partnerChannel - The partner channel associated with the card funds
     * @param oldCardHolder - The address of the old card holder.
     * @param newCardHolder - The address of the new card holder.
     */
    cardFundRecover(partnerChannel: string, oldCardHolder: Address, newCardHolder: Address): void {
        this.onlyOwner();

        const oldCardFunds: CardFundDetails = { partnerChannel: partnerChannel, cardFundOwner: oldCardHolder };
        const newCardFunds: CardFundDetails = { partnerChannel: partnerChannel, cardFundOwner: newCardHolder };
        this.card_funds(newCardFunds).value = this.card_funds(oldCardFunds).value;

        this.card_funds(oldCardFunds).delete();
    }

    /**
     * Allows the master contract to flag intent of accepting an asset.
     * This can be considered the whitelists whitelist.
     *
     * @param mbr - Payment transaction of minimum balance requirement
     * @param asset - The AssetID of the asset being transferred.
     */
    assetAllowlistAdd(mbr: PayTxn, asset: AssetID): void {
        this.onlyOwner();

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.assetOptInMinBalance,
        });

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.app.address,
            xferAsset: asset,
            assetAmount: 0,
        });
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

        sendPayment({
            receiver: this.txn.sender,
            amount: globals.assetOptInMinBalance,
        });
    }

    /**
     * Debits the specified amount of the given asset from the card account.
     * Only the owner of the contract can perform this operation.
     *
     * @param card The card account from which the asset will be debited.
     * @param amount The amount of the asset to be debited.
     */
    cardFundDebit(card: Address, asset: AssetID, amount: uint64): void {
        this.onlyOwner();

        sendAssetTransfer({
            sender: card,
            assetReceiver: this.app.address,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Debit.log({
            card: card,
            asset: asset,
            amount: amount,
        });
    }

    /**
     * Refunds a specified amount of an asset to a card account.
     * Only the owner of the contract can perform this operation.
     *
     * @param card - The card account to refund the asset to.
     * @param amount - The amount of the asset to refund.
     */
    cardFundRefund(partnerChannel: string, card: Address, asset: AssetID, amount: uint64): void {
        this.onlyOwner();

        sendAssetTransfer({
            sender: this.partner_channels(partnerChannel).value,
            assetReceiver: card,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Refund.log({
            card: card,
            asset: asset,
            amount: amount,
        });
    }

    @abi.readonly
    getNextSettlementNonce(): uint64 {
        return this.settlement_nonce.value;
    }

    /**
     * Sets the settlement address to a new value.
     *
     * @param newSettlementAddress - The new settlement address to set.
     */
    setSettlementAddress(newSettlementAddress: Address): void {
        this.onlyOwner();

        const oldSettlementAddress = this.settlement_address.exists
            ? this.settlement_address.value
            : globals.zeroAddress;
        this.settlement_address.value = newSettlementAddress;

        this.SettlementAddressChanged.log({
            oldSettlementAddress: oldSettlementAddress,
            newSettlementAddress: newSettlementAddress,
        });
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
        this.onlyOwner();

        // Ensure the nonce is correct
        assert(this.settlement_nonce.value === nonce);

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.settlement_address.value,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Settlement.log({
            recipient: this.settlement_address.value,
            asset: asset,
            amount: amount,
            nonce: nonce,
        });

        // Increment the settlement nonce
        this.settlement_nonce.value = this.settlement_nonce.value + 1;
    }

    // ===== Card Holder Methods =====
    /**
     * Allows the depositor (or owner) to OptIn to an asset, increasing the minimum balance requirement of the account
     *
     * @param partnerChannel Funding Channel name
     * @param cardFund Address to add asset to
     * @param asset Asset to add
     */
    cardFundEnableAsset(mbr: PayTxn, partnerChannel: string, cardFund: Address, asset: AssetID): void {
        assert(this.isOwner() || this.isCardFundOwner(partnerChannel, cardFund));

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.assetOptInMinBalance,
        });

        sendPayment({
            receiver: cardFund,
            amount: globals.assetOptInMinBalance,
        });

        this.cardFundAssetOptIn(cardFund, asset);
    }

    /**
     * Allows the depositor (or owner) to CloseOut of an asset, reducing the minimum balance requirement of the account
     *
     * @param partnerChannel - The funding channel associated with the card.
     * @param cardFund - The address of the card.
     * @param asset - The ID of the asset to be removed.
     */
    cardFundDisableAsset(partnerChannel: string, cardFund: Address, asset: AssetID): void {
        assert(this.isOwner() || this.isCardFundOwner(partnerChannel, cardFund));

        this.cardFundAssetCloseOut(cardFund, asset);
    }

    /**
     * Allows the Card Holder (or contract owner) to send an amount of assets from the account
     * @param partnerChannel Funding Channel name
     * @param card Address to withdraw from
     * @param asset Asset to withdraw
     * @param amount Amount to withdraw
     * @returns Withdrawal hash used for completing or cancelling the withdrawal
     */
    @allow.call('NoOp')
    @allow.call('OptIn')
    cardFundWithdrawalRequest(
        partnerChannel: string,
        card: Address,
        recipient: Address,
        asset: AssetID,
        amount: uint64
    ): bytes32 {
        assert(this.isOwner() || this.isCardFundOwner(partnerChannel, card));

        const withdrawal: WithdrawalRequest = {
            cardFund: card,
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
     * @param partnerChannel Funding Channel name
     * @param card Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    cardFundWithdrawalCancel(partnerChannel: string, card: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isCardFundOwner(partnerChannel, card));

        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Allows the Card Holder to send an amount of assets from the account
     * @param partnerChannel Funding Channel name
     * @param card Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    cardFundWithdraw(partnerChannel: string, card: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isCardFundOwner(partnerChannel, card));

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        assert(globals.latestTimestamp >= withdrawal.timestamp || this.isOwner());

        // Issue the withdrawal
        this.withdrawFunds(withdrawal);

        // Delete the withdrawal request
        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Withdraws funds before the withdrawal timestamp has lapsed, by using the early withdrawal signature provided by Immersve.
     * @param partnerChannel - The partner channel associated with the card.
     * @param card - The address of the card.
     * @param withdrawal_hash - The hash of the withdrawal.
     * @param early_withdrawal_sig - The signature for early withdrawal.
     */
    cardFundWithdrawEarly(
        partnerChannel: string,
        card: Address,
        withdrawal_hash: bytes32,
        early_withdrawal_sig: bytes32
    ): void {
        assert(this.isCardFundOwner(partnerChannel, card));

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        // If the withdrawal timestamp has lapsed, there's no need to use the early withdrawal signature
        if (globals.latestTimestamp < withdrawal.timestamp) {
            // Need at least 2000 Opcode budget
            // TODO: Optimise?
            while (globals.opcodeBudget < 2500) {
                increaseOpcodeBudget();
            }

            assert(ed25519VerifyBare(withdrawal_hash, early_withdrawal_sig, this.early_withdrawal_pubkey.value));
        }

        // Issue the withdrawal
        this.withdrawFunds(withdrawal);

        // Delete the withdrawal request
        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }
}
