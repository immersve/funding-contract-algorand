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

// Card = Partner + Card Holder
type CardDetails = {
    partner: string;
    cardHolder: Address;
};

// Withdrawal request for an amount of an asset, where the round indicates the earliest it can be made
type WithdrawalRequest = {
    nonce: uint64;
    round: uint64;
    card: Address;
    recipient: Address;
    asset: AssetID;
    amount: uint64;
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
    // Cards
    cards = BoxMap<CardDetails, Address>({ prefix: 'c' });

    active_cards = GlobalStateKey<uint64>({ key: 'c' });

    // Partners
    partners = BoxMap<string, Address>({ prefix: 'p' });

    active_partners = GlobalStateKey<uint64>({ key: 'p' });

    // Rounds to wait
    withdrawal_wait_time = GlobalStateKey<uint64>({ key: 'w' });

    // Early withdrawal public key
    early_withdrawal_pubkey = GlobalStateKey<bytes32>({ key: 'k' });

    // Withdrawal requests
    withdrawals = LocalStateMap<bytes32, WithdrawalRequest>({ maxKeys: 15 });

    withdrawal_nonce = LocalStateKey<uint64>({ key: 'n' });

    // ========== Events ==========
    CardCreated = new EventLogger<{
        // TODO
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

    /**
     * Settlement event
     */
    Settlement = new EventLogger<{
        /** Asset being settled */
        asset: AssetID;
        /** Amount being settled */
        amount: uint64;
    }>();

    /**
     * Withdrawal event
     */
    Withdrawal = new EventLogger<{
        /** Funding Source withdrawn from */
        card: Address;
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
    private isCardHolder(partner: string, card: Address): boolean {
        return this.cards({ partner: partner, cardHolder: this.txn.sender } as CardDetails).value === card;
    }

    private withdrawFunds(withdrawal: WithdrawalRequest): void {
        sendAssetTransfer({
            sender: withdrawal.card,
            assetReceiver: withdrawal.recipient,
            xferAsset: withdrawal.asset,
            assetAmount: withdrawal.amount,
        });

        // Emit withdrawal event
        this.Withdrawal.log({
            card: withdrawal.card,
            recipient: withdrawal.recipient,
            asset: withdrawal.asset,
            amount: withdrawal.amount,
            nonce: withdrawal.nonce,
        });
    }

    // ========== External Methods ==========
    /**
     * Deploy a Partner, setting the owner as provided
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
     * Destroy the smart contract, sending all Algo to the owner account. This can only be done if there are no active cards
     */
    @allow.call('DeleteApplication')
    destroy(): void {
        this.onlyOwner();

        // There must not be any active cards
        assert(!this.active_cards.value);
        // There must not be any active partners
        assert(!this.active_partners.value);

        sendPayment({
            receiver: this.app.address,
            amount: 0,
            closeRemainderTo: this.owner(),
        });
    }

    // ===== Owner Methods =====
    /**
     * Set the number of rounds a withdrawal request must wait until being withdrawn
     * @param rounds New number of rounds to wait
     */
    setWithdrawalRounds(rounds: uint64): void {
        this.onlyOwner();

        this.withdrawal_wait_time.value = rounds;
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
     * Creates a partner account and associates it with the provided partner name.
     * Only the owner of the contract can call this function.
     *
     * @param mbr - The PayTxn object representing the payment transaction.
     * @param partner - The name of the partner.
     * @returns The address of the newly created partner account.
     */
    partnerCreate(mbr: PayTxn, partner: string): Address {
        this.onlyOwner();

        assert(!this.partners(partner).exists);

        const boxCost = 2500 + 400 * (3 + len(partner) + 32);

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.minBalance + globals.assetOptInMinBalance + boxCost,
        });

        // Create a new account
        const partnerAddr = sendMethodCall<typeof ControlledAddress.prototype.new>({
            onCompletion: OnCompletion.DeleteApplication,
            approvalProgram: ControlledAddress.approvalProgram(),
            clearStateProgram: ControlledAddress.clearProgram(),
        });

        // Fund the account with a minimum balance
        sendPayment({
            receiver: partnerAddr,
            amount: globals.minBalance,
        });

        this.partners(partner).value = partnerAddr;

        // Increment active partners
        this.active_partners.value = this.active_partners.value + 1;

        return partnerAddr;
    }

    partnerClose(partner: string): void {
        this.onlyOwner();

        sendPayment({
            sender: this.partners(partner).value,
            receiver: this.partners(partner).value,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const boxCost = 2500 + 400 * (3 + len(partner) + 32);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the partner from the box
        this.partners(partner).delete();

        // Decrement active partners
        this.active_partners.value = this.active_partners.value - 1;
    }

    /**
     * Create account. This generates a brand new account and funds the minimum balance requirement
     * @param cardHolder Address to have control over asset withdrawals
     * @returns Newly generated account used by their card
     */
    cardCreate(mbr: PayTxn, partner: string, cardHolder: Address): Address {
        this.onlyOwner();

        assert(this.partners(partner).exists);

        const cardFunds: CardDetails = { partner: partner, cardHolder: cardHolder };
        const boxCost = 2500 + 400 * (1 + len(cardFunds) + 32);

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.minBalance + boxCost,
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
            amount: globals.minBalance,
        });

        // Store new card along with Card Holder
        this.cards(cardFunds).value = cardAddr;

        // Increment active cards
        this.active_cards.value = this.active_cards.value + 1;

        // Return the new account address
        return cardAddr;
    }

    /**
     * Close account. This permanently removes the rekey and deletes the account from the ledger
     * @param partner Funding Channel name
     * @param cardHolder Address which has control over asset withdrawals
     * @param card Address to close
     */
    cardClose(partner: string, cardHolder: Address, card: Address): void {
        this.onlyOwner();

        sendPayment({
            sender: card,
            receiver: card,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const cardFunds: CardDetails = { partner: partner, cardHolder: cardHolder };
        const boxCost = 2500 + 400 * (1 + len(cardFunds) + 32);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the card from the box
        this.cards(cardFunds).delete();

        // Decrement active cards
        this.active_cards.value = this.active_cards.value - 1;
    }

    /**
     * Recovers funds from an old card and transfers them to a new card.
     * Only the owner of the contract can perform this operation.
     *
     * @param partner - The partner associated with the cards.
     * @param oldCardHolder - The address of the old card holder.
     * @param newCardHolder - The address of the new card holder.
     */
    cardRecover(partner: string, oldCardHolder: Address, newCardHolder: Address): void {
        this.onlyOwner();

        const oldCardFunds: CardDetails = { partner: partner, cardHolder: oldCardHolder };
        const newCardFunds: CardDetails = { partner: partner, cardHolder: newCardHolder };
        this.cards(newCardFunds).value = this.cards(oldCardFunds).value;

        this.cards(oldCardFunds).delete();
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
     * Allows the specified asset to be transferred for users of this partner.
     *
     * @param mbr - The PayTxn object representing the transaction.
     * @param asset - The ID of the asset to be allowed.
     */
    partnerAcceptAsset(mbr: PayTxn, partner: string, asset: AssetID): void {
        this.onlyOwner();

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.assetOptInMinBalance,
        });

        sendPayment({
            sender: this.app.address,
            receiver: this.partners(partner).value,
            amount: globals.assetOptInMinBalance,
        });

        sendAssetTransfer({
            sender: this.partners(partner).value,
            assetReceiver: this.partners(partner).value,
            xferAsset: asset,
            assetAmount: 0,
        });
    }

    /**
     * Revokes an asset by closing out its balance and transferring the minimum balance to the sender.
     *
     * @param asset The ID of the asset to revoke.
     */
    partnerRejectAsset(partner: string, asset: AssetID): void {
        this.onlyOwner();

        // Asset balance must be zero to close out of it. Consider settling the asset balance before revoking it.
        sendAssetTransfer({
            sender: this.partners(partner).value,
            assetReceiver: this.partners(partner).value,
            assetCloseTo: this.partners(partner).value,
            xferAsset: asset,
            assetAmount: 0,
        });

        sendPayment({
            sender: this.partners(partner).value,
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
    cardDebit(partner: string, card: Address, asset: AssetID, amount: uint64): void {
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
    cardRefund(partner: string, card: Address, asset: AssetID, amount: uint64): void {
        this.onlyOwner();

        sendAssetTransfer({
            sender: this.partners(partner).value,
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

    /**
     * Settles a payment by transferring an asset to the specified recipient.
     * Only the owner of the contract can call this function.
     *
     * @param recipient The address of the recipient.
     * @param amount The amount of the asset to be transferred.
     */
    settle(recipient: Address, asset: AssetID, amount: uint64): void {
        this.onlyOwner();

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: recipient,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Settlement.log({
            asset: asset,
            amount: amount,
        });
    }

    // ===== Card Holder Methods =====
    /**
     * Allows the depositor (or owner) to OptIn to an asset, increasing the minimum balance requirement of the account
     *
     * @param partner Funding Channel name
     * @param card Address to add asset to
     * @param asset Asset to add
     */
    cardEnableAsset(mbr: PayTxn, partner: string, card: Address, asset: AssetID): void {
        assert(this.isOwner() || this.isCardHolder(partner, card));

        // FIX: frame_dig -1 error when uncommented
        // This same logic should be on masterAcceptAsset and cardDebit
        // assert(this.partners(partner).value.isOptedInToAsset(asset));

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.assetOptInMinBalance,
        });

        sendPayment({
            receiver: card,
            amount: globals.assetOptInMinBalance,
        });

        sendAssetTransfer({
            sender: card,
            assetReceiver: card,
            xferAsset: asset,
            assetAmount: 0,
        });
    }

    /**
     * Allows the depositor (or owner) to CloseOut of an asset, reducing the minimum balance requirement of the account
     *
     * @param partner - The funding channel associated with the card.
     * @param card - The address of the card.
     * @param asset - The ID of the asset to be removed.
     */
    cardDisableAsset(partner: string, card: Address, asset: AssetID): void {
        assert(this.isOwner() || this.isCardHolder(partner, card));

        sendAssetTransfer({
            sender: card,
            assetReceiver: card,
            assetCloseTo: card,
            xferAsset: asset,
            assetAmount: 0,
        });

        sendPayment({
            sender: card,
            receiver: this.txn.sender,
            amount: globals.assetOptInMinBalance,
        });
    }

    /**
     * Allows the Card Holder (or contract owner) to send an amount of assets from the account
     * @param partner Funding Channel name
     * @param card Address to withdraw from
     * @param asset Asset to withdraw
     * @param amount Amount to withdraw
     * @returns Withdrawal hash used for completing or cancelling the withdrawal
     */
    @allow.call('NoOp')
    @allow.call('OptIn')
    cardWithdrawalRequest(partner: string, card: Address, recipient: Address, asset: AssetID, amount: uint64): bytes32 {
        assert(this.isOwner() || this.isCardHolder(partner, card));

        const withdrawal: WithdrawalRequest = {
            nonce: this.withdrawal_nonce(this.txn.sender).value,
            round: globals.round + this.withdrawal_wait_time.value,
            card: card,
            recipient: recipient,
            asset: asset,
            amount: amount,
        };
        this.withdrawal_nonce(this.txn.sender).value = this.withdrawal_nonce(this.txn.sender).value + 1;
        const withdrawal_hash = sha256(rawBytes(withdrawal));

        this.withdrawals(this.txn.sender, withdrawal_hash).value = withdrawal;

        return withdrawal_hash;
    }

    /**
     * Allows the Card Holder (or contract owner) to cancel a withdrawal request
     * @param partner Funding Channel name
     * @param card Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    cardWithdrawalCancel(partner: string, card: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isCardHolder(partner, card));

        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Allows the Card Holder to send an amount of assets from the account
     * @param partner Funding Channel name
     * @param card Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     * @param early_withdrawal_sig Signature of withdrawal_hash from the early_withdrawal_pubkey
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    cardWithdraw(partner: string, card: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isCardHolder(partner, card));

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        assert(globals.round >= withdrawal.round || this.isOwner());

        // Issue the withdrawal
        this.withdrawFunds(withdrawal);

        // Delete the withdrawal request
        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Withdraws funds before the withdrawal round has lapsed, by using the early withdrawal signature provided by Immersve.
     * @param partner - The partner associated with the card.
     * @param card - The address of the card.
     * @param withdrawal_hash - The hash of the withdrawal.
     * @param early_withdrawal_sig - The signature for early withdrawal.
     */
    cardWithdrawEarly(partner: string, card: Address, withdrawal_hash: bytes32, early_withdrawal_sig: bytes32): void {
        assert(this.isCardHolder(partner, card));

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        // If the withdrawal round has lapsed, there's no need to use the early withdrawal signature
        if (globals.round < withdrawal.round) {
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
