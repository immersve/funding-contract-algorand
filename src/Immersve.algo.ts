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
import { Contract } from '@algorandfoundation/tealscript';
import { Ownable } from './roles/Ownable.algo';

// FundingSource = FundingChannel + Depositor
type FundingSource = {
    fundingChannel: string,
    depositor: Address
};

// Withdrawal request for an amount of an asset, where the round indicates the earliest it can be made
type WithdrawalRequest = {
    nonce: uint64,
    round: uint64,
    asset: Asset,
    amount: uint64
};

// Cost of storing FundingSource's associated account in a box
//const box_mbr = (2500) + (400 * (64 + 32));
const box_mbr = 40900;

class Card extends Contract {
    /**
     * Create a new account, rekeying it to the caller application address
     * @returns New account address
     */
    @allow.create("DeleteApplication")
    new(): Address {
        sendPayment({
            receiver: this.app.address,
            amount: 0,
            rekeyTo: globals.callerApplicationAddress,
        });

        return this.app.address;
    }
}

class Immersve extends Contract.extend(Ownable) {

	// ========== Storage ==========
    // Depositor and Card
    cards = BoxMap<FundingSource, Address>({});
    active_cards = GlobalStateKey<uint64>({ key: 'c' });

    // Rounds to wait
    withdrawal_wait_time = GlobalStateKey<uint64>({ key: 'w' });

    // Withdrawal requests
    withdrawals = LocalStateMap<bytes32, WithdrawalRequest>({ maxKeys: 15});
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
        fundingSource: Address,
        /** Asset being debited */
        asset: Asset,
        /** Amount being debited */
        amount: uint64,
    }>();

    /**
     * Refund event
     */
    Refund = new EventLogger<{
        /** Funding Source being refunded to */
        fundingSource: Address,
        /** Asset being refunded */
        asset: Asset,
        /** Amount being refunded */
        amount: uint64,
    }>();

    /**
     * Settlement event
     */
    Settlement = new EventLogger<{
        /** Asset being settled */
        asset: Asset,
        /** Amount being settled */
        amount: uint64,
    }>();


	// ========== Internal Utils ==========
    /**
     * Check if the current transaction sender is the depositor of the card account
     * @param card Address to check
     * @returns True if the sender is the depositor of the card
     */
    private isDepositor(fundingChannel: string, card: Address): boolean {
        return this.cards({fundingChannel: fundingChannel, depositor: this.txn.sender} as FundingSource).value === card;
    }


	// ========== External Methods ==========
    /**
     * Deploy the smart contract, setting the transaction sender as the owner
     */
    @allow.create("NoOp")
    deploy(): void {
        this._transferOwnership(this.txn.sender);
    }

    /**
     * Allows the owner to update the smart contract
     */
    @allow.call("UpdateApplication")
    update(): void {
        this.onlyOwner();
    }

    /**
     * Destroy the smart contract, sending all Algo to the owner account. This can only be done if there are no active cards
     */
    @allow.call("DeleteApplication")
    destroy(): void {
        this.onlyOwner();

        // There must not be any active cards
        assert(!this.active_cards.value);

        sendPayment({
            receiver: this.app.address,
            amount: 0,
            closeRemainderTo: this.owner(),
        });
    }

    /**
     * Set the number of rounds a withdrawal request must wait until being withdrawn
     * @param rounds New number of rounds to wait
     */
    setWithdrawalRounds(rounds: uint64): void {
        this.onlyOwner();

        this.withdrawal_wait_time.value = rounds;
    }

    /**
     * Create account. This generates a brand new account and funds the minimum balance requirement
     * @param depositor Address to have control over asset withdrawals
     * @returns Newly generated account used by their card
     */
    cardCreate(mbr: PayTxn, fundingChannel: string, depositor: Address): Address {
        this.onlyOwner();

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.minBalance + box_mbr,
        });

        // Create a new account
        const card_addr = sendMethodCall<[], Address>({
            name: "new",
            onCompletion: OnCompletion.DeleteApplication,
            approvalProgram: Card.approvalProgram(),
            clearStateProgram: Card.clearProgram(),
        });

        // Fund the account with a minimum balance
        sendPayment({
            receiver: card_addr,
            amount: globals.minBalance,
        });

        // Store new card along with depositor
        this.cards({fundingChannel: fundingChannel, depositor: depositor} as FundingSource).value = card_addr;

        // Increment active cards
        this.active_cards.value = this.active_cards.value + 1;

        // Return the new account address
        return card_addr;
    }

    /**
     * Close account. This permanently removes the rekey and deletes the account from the ledger
     * @param fundingChannel Funding Channel name
     * @param depositor Address which has control over asset withdrawals
     * @param card Address to close
     */
    cardClose(fundingChannel: string, depositor: Address, card: Address): void {
        this.onlyOwner();

        sendPayment({
            sender: card,
            receiver: card,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        sendPayment({
            receiver: this.txn.sender,
            amount: box_mbr,
        })

        // Delete the card from the box
        this.cards({fundingChannel: fundingChannel, depositor: depositor} as FundingSource).delete();

        // Decrement active cards
        this.active_cards.value = this.active_cards.value - 1;
    }

    allowAsset(mbr: PayTxn, asset: Asset): void {
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

    revokeAsset(asset: Asset): void {
        this.onlyOwner();

        // Asset balance must be zero to close out of it
        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.app.address,
            assetCloseTo: this.app.address,
            xferAsset: asset,
            assetAmount: 0,
        });

        sendPayment({
            sender: this.app.address,
            receiver: this.txn.sender,
            amount: globals.assetOptInMinBalance,
        });
    }

    /**
     * Allows the depositor (or owner) to OptIn to an asset, increasing the minimum balance requirement of the account
     * @param fundingChannel Funding Channel name
     * @param card Address to add asset to
     * @param asset Asset to add
     */
    cardAddAsset(mbr: PayTxn, fundingChannel: string, card: Address, asset: Asset): void {
        assert(this.isOwner() || this.isDepositor(fundingChannel, card));

        assert(this.app.address.isOptedInToAsset(asset));

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
     * @param fundingChannel Funding Channel name
     * @param card Address to remove asset from
     * @param asset Asset to remove
     */
    cardRemoveAsset(fundingChannel: string, card: Address, asset: Asset): void {
        assert(this.isOwner() || this.isDepositor(fundingChannel, card));

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
     * Debits the specified amount of the given asset from the card account.
     * Only the owner of the contract can perform this operation.
     * 
     * @param card The card account from which the asset will be debited.
     * @param asset The asset to be debited.
     * @param amount The amount of the asset to be debited.
     */
    cardDebit(card: Address, asset: Asset, amount: uint64): void {
        this.onlyOwner();

        sendAssetTransfer({
            sender: card,
            assetReceiver: this.app.address,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Debit.log({
            fundingSource: card,
            asset: asset,
            amount: amount,
        });
    }

    /**
     * Refunds a specified amount of an asset to a card account.
     * Only the owner of the contract can perform this operation.
     * 
     * @param card - The card account to refund the asset to.
     * @param asset - The asset to refund.
     * @param amount - The amount of the asset to refund.
     */
    cardRefund(card: Address, asset: Asset, amount: uint64): void {
        this.onlyOwner();

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: card,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Refund.log({
            fundingSource: card,
            asset: asset,
            amount: amount,
        });
    }

    /**
     * Settles a payment by transferring an asset to the specified recipient.
     * Only the owner of the contract can call this function.
     * 
     * @param recipient The address of the recipient.
     * @param asset The asset to be transferred.
     * @param amount The amount of the asset to be transferred.
     */
    settle(recipient: Address, asset: Asset, amount: uint64): void {
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

    /**
     * Allows the depositor to send an amount of assets from the account
     * @param fundingChannel Funding Channel name
     * @param card Address to withdraw from
     * @param asset Asset being withdrawn
     * @param amount Amount to withdraw
     * @returns Withdrawal hash used for completing or cancelling the withdrawal
     */
    @allow.call("NoOp")
    @allow.call("OptIn")
    cardWithdrawalRequest(fundingChannel: string, card: Address, asset: Asset, amount: uint64): bytes32 {
        assert(this.isDepositor(fundingChannel, card));

        const withdrawal: WithdrawalRequest = {
            nonce: this.withdrawal_nonce(this.txn.sender).value,
            round: globals.round + this.withdrawal_wait_time.value,
            asset: asset,
            amount: amount,
        };
        this.withdrawal_nonce(this.txn.sender).value = this.withdrawal_nonce(this.txn.sender).value + 1;
        const withdrawal_hash = sha256(rawBytes(withdrawal));

        this.withdrawals(
            this.txn.sender,
            withdrawal_hash,
        ).value = withdrawal;

        return withdrawal_hash;
    }

    /**
     * Allows the depositor (or owner) to cancel a withdrawal request
     * @param fundingChannel Funding Channel name
     * @param card Address to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    cardWithdrawalCancel(fundingChannel: string, card: Address, withdrawal_hash: bytes32): void {
        assert(this.isOwner() || this.isDepositor(fundingChannel, card));

        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Allows the depositor to send an amount of assets from the account
     * @param fundingChannel Funding Channel name
     * @param card Address to withdraw from
     * @param recipient Receiver of the assets being withdrawn
     * @param asset Asset being withdrawn
     * @param withdrawal_hash Hash of the withdrawal request
     */
    @allow.call("NoOp")
    @allow.call("CloseOut")
    cardWithdraw(fundingChannel: string, card: Address, recipient: Address, asset: Asset, withdrawal_hash: bytes32): void {
        assert(this.isDepositor(fundingChannel, card));

        const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

        assert(globals.round >= withdrawal.round);

        sendAssetTransfer({
            sender: card,
            assetReceiver: recipient,
            xferAsset: withdrawal.asset,
            assetAmount: withdrawal.amount,
        });

        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }
}
