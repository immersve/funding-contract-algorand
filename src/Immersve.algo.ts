import { Contract } from '@algorandfoundation/tealscript';

// Key to use per partner and depositor
type PartnerAndDepositor = {
    partner: string,
    depositor: Address
};

// Withdrawal request for an amount of an asset, where the round indicates the earliest it can be made
type WithdrawalRequest = {
    nonce: uint64,
    round: uint64,
    asset: Asset,
    amount: uint64
};

// Cost of storing (partner + depositor) + card in a box
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

class Immersve extends Contract {

	// ========== Storage ==========
    // Admin
    admin = GlobalStateKey<Address>({ key: 'a' });

    // Depositor and Card
    cards = BoxMap<PartnerAndDepositor, Address>({});
    active_cards = GlobalStateKey<uint64>({ key: 'c' });

    // Rounds to wait
    withdrawal_wait_time = GlobalStateKey<uint64>({ key: 'w' });

    // Withdrawal requests
    withdrawals = LocalStateMap<bytes32, WithdrawalRequest>({ maxKeys: 15});
    withdrawal_nonce = LocalStateKey<uint64>({ key: 'n' });


	// ========== Events ==========
	// TODO


	// ========== Internal Utils ==========
    /**
     * Check if the current transaction sender is the admin
     * @returns True if the sender is the admin
     */
    private isAdmin(): boolean {
        return this.txn.sender === this.admin.value;
    }

    /**
     * Check if the current transaction sender is the depositor of the card account
     * @param card Address to check
     * @returns True if the sender is the depositor of the card
     */
    private isOwner(partner: string, card: Address): boolean {
        return this.cards({partner: partner, depositor: this.txn.sender} as PartnerAndDepositor).value === card;
    }


	// ========== External Methods ==========
    /**
     * Deploy the smart contract, setting the transaction sender as the admin
     */
    @allow.create("NoOp")
    deploy(): void {
        this.admin.value = this.txn.sender;
    }

    /**
     * Allows the admin to update the smart contract
     */
    @allow.call("UpdateApplication")
    update(): void {
        assert(this.isAdmin());
    }

    /**
     * Destroy the smart contract, sending all Algo to the admin account. This can only be done if there are no active cards
     */
    @allow.call("DeleteApplication")
    destroy(): void {
        assert(this.isAdmin());

        // There must not be any active cards
        assert(!this.active_cards.value);

        sendPayment({
            receiver: this.app.address,
            amount: 0,
            closeRemainderTo: this.admin.value,
        });
    }

    /**
     * Allows the current admin to set a new admin
     * @param admin Address to be made admin
     */
    setAdmin(admin: Address): void {
        assert(this.isAdmin());

        this.admin.value = admin;
    }

    /**
     * Set the number of rounds a withdrawal request must wait until being withdrawn
     * @param rounds New number of rounds to wait
     */
    setWithdrawalRounds(rounds: uint64): void {
        assert(this.isAdmin());

        this.withdrawal_wait_time.value = rounds;
    }

    /**
     * Create account. This generates a brand new account and funds the minimum balance requirement
     * @param depositor Address to have control over asset withdrawals
     * @returns Newly generated account used by their card
     */
    cardCreate(mbr: PayTxn, partner: string, depositor: Address): Address {
        assert(this.isAdmin());

        assert(mbr.amount === globals.minBalance + box_mbr);
        assert(mbr.receiver === this.app.address);

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
        this.cards({ partner: partner, depositor: depositor} as PartnerAndDepositor).value = card_addr;

        // Increment active cards
        this.active_cards.value = this.active_cards.value + 1;

        // Return the new account address
        return card_addr;
    }

    /**
     * Close account. This permanently removes the rekey and deletes the account from the ledger
     * @param partner Partner name
     * @param depositor Address which has control over asset withdrawals
     * @param card Account to close
     */
    cardClose(partner: string, depositor: Address, card: Account): void {
        assert(this.isAdmin());

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
        this.cards({partner: partner, depositor: depositor} as PartnerAndDepositor).delete();

        // Decrement active cards
        this.active_cards.value = this.active_cards.value - 1;
    }

    /**
     * Allows the depositor (or admin) to OptIn to an asset, increasing the minimum balance requirement of the account
     * @param partner Partner name
     * @param card Account to add asset to
     * @param asset Asset to add
     */
    cardAddAsset(mbr: PayTxn, partner: string, card: Account, asset: Asset): void {
        assert(this.isAdmin() || this.isOwner(partner, card));

        assert(mbr.amount === globals.assetOptInMinBalance);
        assert(mbr.receiver === this.app.address);

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
     * Allows the depositor (or admin) to CloseOut of an asset, reducing the minimum balance requirement of the account
     * @param partner Partner name
     * @param card Account to remove asset from
     * @param asset Asset to remove
     */
    cardRemoveAsset(partner: string, card: Account, asset: Asset): void {
        assert(this.isAdmin() || this.isOwner(partner, card));

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
     * Allows the admin to send an amount of assets from the account
     * @param card Account to debit from
     * @param recipient Receiver of the assets being debited
     * @param asset Asset being debited
     * @param amount Amount to debit
     */
    cardDebit(card: Account, recipient: Account, asset: Asset, amount: uint64): void {
        assert(this.isAdmin());

        sendAssetTransfer({
            sender: card,
            assetReceiver: recipient,
            xferAsset: asset,
            assetAmount: amount,
        });
    }

    /**
     * Allows the depositor to send an amount of assets from the account
     * @param partner Partner name
     * @param card Account to withdraw from
     * @param asset Asset being withdrawn
     * @param amount Amount to withdraw
     * @returns Withdrawal hash used for completing or cancelling the withdrawal
     */
    @allow.call("NoOp")
    @allow.call("OptIn")
    cardWithdrawalRequest(partner: string, card: Account, asset: Asset, amount: uint64): bytes32 {
        assert(this.isOwner(partner, card));

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
     * Allows the depositor (or admin) to cancel a withdrawal request
     * @param partner Partner name
     * @param card Account to withdraw from
     * @param withdrawal_hash Hash of the withdrawal request
     */
    cardWithdrawalCancel(partner: string, card: Account, withdrawal_hash: bytes32): void {
        assert(this.isAdmin() || this.isOwner(partner, card));

        this.withdrawals(this.txn.sender, withdrawal_hash).delete();
    }

    /**
     * Allows the depositor to send an amount of assets from the account
     * @param partner Partner name
     * @param card Account to withdraw from
     * @param recipient Receiver of the assets being withdrawn
     * @param asset Asset being withdrawn
     * @param withdrawal_hash Hash of the withdrawal request
     */
    @allow.call("NoOp")
    @allow.call("CloseOut")
    cardWithdraw(partner: string, card: Account, recipient: Account, asset: Asset, withdrawal_hash: bytes32): void {
        assert(this.isOwner(partner, card));

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
