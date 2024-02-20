/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
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

// Card = Partner + Card Holder
type CardDetails = {
  partner: string;
  cardHolder: Address;
};

// Withdrawal request for an amount of an asset, where the round indicates the earliest it can be made
type WithdrawalRequest = {
  nonce: uint64;
  round: uint64;
  amount: uint64;
};

// Cost of storing Card data in a box
// const box_mbr = (2500) + (400 * ((32 + 8 + 32) + 32));
const box_mbr = 44_100;

// Cost of creating a new partner contract
// 100_000 + 4*25_000 + 3*3_500 + 25_000
const partner_sc_mbr = 235_500;

class Card extends Contract {
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

class Partner extends Contract.extend(Ownable) {
  // ========== Storage ==========
  // Cards
  cards = BoxMap<CardDetails, Address>({});

  active_cards = GlobalStateKey<uint64>({ key: 'c' });

  // Asset
  asset = GlobalStateKey<Asset>({ key: 'a' });

  // Rounds to wait
  withdrawal_wait_time = GlobalStateKey<uint64>({ key: 'w' });

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
    asset: Asset;
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
    asset: Asset;
    /** Amount being refunded */
    amount: uint64;
  }>();

  /**
   * Settlement event
   */
  Settlement = new EventLogger<{
    /** Asset being settled */
    asset: Asset;
    /** Amount being settled */
    amount: uint64;
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

  // ========== External Methods ==========
  /**
   * Deploy a Partner, setting the owner as provided
   */
  @allow.create('NoOp')
  deploy(owner: Address, asset: Asset): Address {
    this._transferOwnership(owner);

    // Set the asset
    this.asset.value = asset;

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
   * Opt in to the asset
   */
  assetOptIn(): void {
    sendAssetTransfer({
      sender: this.app.address,
      assetReceiver: this.app.address,
      xferAsset: this.asset.value,
      assetAmount: 0,
    });
  }

  /**
   * Create account. This generates a brand new account and funds the minimum balance requirement
   * @param cardHolder Address to have control over asset withdrawals
   * @returns Newly generated account used by their card
   */
  cardCreate(mbr: PayTxn, partner: string, cardHolder: Address): Address {
    this.onlyOwner();

    verifyPayTxn(mbr, {
      receiver: this.app.address,
      amount: globals.minBalance + globals.assetOptInMinBalance + box_mbr,
    });

    // Create a new account
    const card_addr = sendMethodCall<[], Address>({
      name: 'new',
      onCompletion: OnCompletion.DeleteApplication,
      approvalProgram: Card.approvalProgram(),
      clearStateProgram: Card.clearProgram(),
    });

    // Fund the account with a minimum balance for opting into the asset
    sendPayment({
      receiver: card_addr,
      amount: globals.minBalance + globals.assetOptInMinBalance,
    });

    // Opt-in to the asset
    sendAssetTransfer({
      sender: card_addr,
      assetReceiver: card_addr,
      xferAsset: this.asset.value,
      assetAmount: 0,
    });

    // Store new card along with Card Holder
    this.cards({ partner: partner, cardHolder: cardHolder } as CardDetails).value = card_addr;

    // Increment active cards
    this.active_cards.value = this.active_cards.value + 1;

    // Return the new account address
    return card_addr;
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

    sendPayment({
      receiver: this.txn.sender,
      amount: box_mbr,
    });

    // Delete the card from the box
    this.cards({ partner: partner, cardHolder: cardHolder } as CardDetails).delete();

    // Decrement active cards
    this.active_cards.value = this.active_cards.value - 1;
  }

  /**
   * Debits the specified amount of the given asset from the card account.
   * Only the owner of the contract can perform this operation.
   *
   * @param card The card account from which the asset will be debited.
   * @param amount The amount of the asset to be debited.
   */
  cardDebit(card: Address, amount: uint64): void {
    this.onlyOwner();

    sendAssetTransfer({
      sender: card,
      assetReceiver: this.app.address,
      xferAsset: this.asset.value,
      assetAmount: amount,
    });

    this.Debit.log({
      card: card,
      asset: this.asset.value,
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
  cardRefund(card: Address, amount: uint64): void {
    this.onlyOwner();

    sendAssetTransfer({
      sender: this.app.address,
      assetReceiver: card,
      xferAsset: this.asset.value,
      assetAmount: amount,
    });

    this.Refund.log({
      card: card,
      asset: this.asset.value,
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
  settle(recipient: Address, amount: uint64): void {
    this.onlyOwner();

    sendAssetTransfer({
      sender: this.app.address,
      assetReceiver: recipient,
      xferAsset: this.asset.value,
      assetAmount: amount,
    });

    this.Settlement.log({
      asset: this.asset.value,
      amount: amount,
    });
  }

  /**
   * Allows the Card Holder to send an amount of assets from the account
   * @param partner Funding Channel name
   * @param card Address to withdraw from
   * @param amount Amount to withdraw
   * @returns Withdrawal hash used for completing or cancelling the withdrawal
   */
  @allow.call('NoOp')
  @allow.call('OptIn')
  cardWithdrawalRequest(partner: string, card: Address, amount: uint64): bytes32 {
    assert(this.isCardHolder(partner, card));

    const withdrawal: WithdrawalRequest = {
      nonce: this.withdrawal_nonce(this.txn.sender).value,
      round: globals.round + this.withdrawal_wait_time.value,
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
   * @param recipient Receiver of the assets being withdrawn
   * @param withdrawal_hash Hash of the withdrawal request
   */
  @allow.call('NoOp')
  @allow.call('CloseOut')
  cardWithdraw(partner: string, card: Address, recipient: Address, withdrawal_hash: bytes32): void {
    assert(this.isCardHolder(partner, card));

    const withdrawal = this.withdrawals(this.txn.sender, withdrawal_hash).value;

    assert(globals.round >= withdrawal.round);

    sendAssetTransfer({
      sender: card,
      assetReceiver: recipient,
      xferAsset: this.asset.value,
      assetAmount: withdrawal.amount,
    });

    this.withdrawals(this.txn.sender, withdrawal_hash).delete();
  }
}
