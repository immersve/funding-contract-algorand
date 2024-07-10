/*
 * Copyright (c) 2024 Immersve. All rights reserved.
 */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
import { Contract } from '@algorandfoundation/tealscript';
import { Ownable } from './roles/Ownable.algo';
import { Pausable } from './roles/Pausable.algo';
import { ControlledAddress } from './ControlledAddress.algo';

// In Progress Card Fund
type CardFundSetup = {
    partnerChannel: Address;
    reference: string;
};

// In Progress Partner Channel
type PartnerChannelSetup = {
    partnerChannelName: string;
};

// Active Card Fund
type CardFundData = {
    partnerChannel: Address;
    owner: Address;
    address: Address;
    paymentNonce: uint64;
    withdrawalNonce: uint64;
    reference: string;
};

// Active Partner Channel
type PartnerChannelData = {
    partnerChannelName: string;
    owner: Address;
    address: Address;
};

// Active Partner Channel + Card Fund Owner
type PartnerCardFundData = {
    partnerChannel: Address;
    cardFundOwner: Address;
};

type PartnerChannelCloseEventData = {
  partnerChannel: Address;
  partnerChannelName: string;
}

type CardFundCloseEventData = {
  cardFundOwner: Address;
  cardFund: Address;
  partnerChannel: Address;
  reference: string;
}

// Withdrawal request for an amount of an asset, where the timestamp indicates the earliest it can be made
type PermissionlessWithdrawalRequest = {
    cardFund: Address;
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

const MaxPartnerChannelNameLength = 32;
// maximum size of local state key value pair is 128 bytes
const MaxCardFundReferenceLength = 62;
const WithdrawalTypeApproved = 'approved';
const WithdrawalTypePermissionLess = 'permissionless';

export class Master extends Contract.extend(Ownable, Pausable) {
    // ========== Storage ==========
    // Card Funds
    cardFundsSetup = LocalStateMap<Address, CardFundSetup>({ maxKeys: 1 });

    cardFunds = BoxMap<Address, CardFundData>({ prefix: 'cf' });

    cardFundsActiveCount = GlobalStateKey<uint64>({ key: 'cfac' });

    // Partner Channels
    partnerChannelsSetup = LocalStateMap<Address, PartnerChannelSetup>({ prefix: 'pcs', maxKeys: 1 });

    partnerChannels = BoxMap<Address, PartnerChannelData>({ prefix: 'pc' });

    // A map where the key is the partner channel address + the card fund owner address, hashed
    // The value is the address of the cardFund the account owns
    partnerCardFundOwner = BoxMap<bytes32, Address>({ prefix: 'co' });

    partnerChannelsActiveCount = GlobalStateKey<uint64>({ key: 'pcac' });

    // Seconds to wait
    withdrawalWaitTime = GlobalStateKey<uint64>({ key: 'wwt' });

    // Withdrawal requests
    // Only 8 allowed at any given point
    withdrawals = LocalStateMap<Address, PermissionlessWithdrawalRequest>({
      prefix: 'wr',
      maxKeys: 8
    });

    // Settlement nonce
    settlementNonce = GlobalStateKey<uint64>({ key: 'sn' });

    // Settlement address
    settlementAddress = BoxMap<AssetID, Address>({ prefix: 'sa' });

    // Settler role address
    settlerRoleAddress = GlobalStateKey<Address>({ key: 'ra' });

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
     * Partner Channel Closed event
     */
    PartnerChannelClosed = new EventLogger<{
      /** Partner Channel */
      partnerChannel: Address;
      /** Partner Channel Name */
      partnerChannelName: string;
    }>();

    /**
     * CardFund Created event
     */
    CardFundCreated = new EventLogger<{
        /** Card Fund Owner */
        cardFundOwner: Address;
        /** Card Fund */
        cardFund: Address;
        /** Partner Channel */
        partnerChannel: Address;
        /** External ref */
        reference: string;
    }>();

    /**
     * CardFund Closed event
     */
    CardFundClosed = new EventLogger<{
      /** Card Fund Owner */
      cardFundOwner: Address;
      /** Card Fund */
      cardFund: Address;
      /** Partner Channel */
      partnerChannel: Address;
      /** External ref */
      reference: string;
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
        /** Transaction reference */
        reference: string;
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
        type: string;
    }>();

    protected onlySettler(): void {
        assert(this.txn.sender === this.settlerRoleAddress.value, 'SENDER_NOT_ALLOWED');
    }

	/**
	 * Find an active card fund address by partner channel and card fund owner.
	 * This will not return card funds that have not completed the deployment
	 * process, which can be identified by looking at the local state of an
	 * account and decoding the `CardFundSetup` values.
	 */
    public getCardFundByPartner(partnerChannel: Address, cardFundOwner: Address): Address {
        const partnerCardFundOwnerKeyData: PartnerCardFundData = {
            partnerChannel: partnerChannel,
            cardFundOwner: cardFundOwner,
        };
        const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));
        assert(this.partnerCardFundOwner(partnerCardFundOwnerKey).exists, 'CARD_FUND_NOT_FOUND');
        return this.partnerCardFundOwner(partnerCardFundOwnerKey).value;
    }

    // ========== Internal Utils ==========
    /**
     * Check if the current transaction sender is the Card Fund holder/owner
     * @param cardFund Card Fund address
     * @returns True if the sender is the Card Holder of the card
     */
    private isCardFundOwner(cardFund: Address): boolean {
        assert(this.cardFunds(cardFund).exists, 'CARD_FUND_NOT_FOUND');
        return this.cardFunds(cardFund).value.owner === this.txn.sender;
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

    private withdrawFunds(
        cardFund: Address,
        asset: AssetID,
        amount: uint64,
        timestamp: uint64,
        nonce: uint64,
        withdrawalType: string
    ): void {
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

        const nonceValue = this.cardFunds(cardFund).value
        nonceValue.withdrawalNonce = nonce;
    }

    private updateSettlementAddress(asset: AssetID, newSettlementAddress: Address): void {
        const oldSettlementAddress = this.settlementAddress(asset).exists
            ? this.settlementAddress(asset).value
            : globals.zeroAddress;
        this.settlementAddress(asset).value = newSettlementAddress;

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
        assert(!this.cardFundsActiveCount.value, 'CARDFUNDS_STILL_ACTIVE');
        // There must not be any active partner channels
        assert(!this.partnerChannelsActiveCount.value, 'PARTNERCHANNELS_STILL_ACTIVE');

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

        this.withdrawalWaitTime.value = seconds;
    }

    /**
     * Retrieves the minimum balance requirement for creating a partner channel account.
     * @param partnerChannelName - The name of the partner channel.
     * @returns The minimum balance requirement for creating a partner channel account.
     */
    getPartnerChannelBoxMbr(partnerChannelName: string): uint64 {
        // Partner Channel Data Box Cost:
        // 2500 + 400 * ((Prefix + Address) + (ABIHead + Address + Address + (ABI encoded partnerChannelName)))
        return 2500 + 400 * ((2 + 32) + (2 + 32 + 32 +(2 + partnerChannelName.length)));
    }

    /**
     * Deploys a new partner channel account and associates it with the provided partner channel name.
     * This account is not yet active and requires the partner channel owner to complete the setup.
     * Caller must be opted-in to the application for this call.
     *
     * @param mbr - The minimum balance requirement for creating an account. Currency 0.1 Algo, but may change with Algorand consensus.
     * @param partnerChannelName - The name of the partner channel. Max length is 32 characters.
     * @returns The address of the newly created partner channel account.
     */
    @allow.call('NoOp')
    @allow.call('OptIn')
    partnerChannelDeployInit(mbr: PayTxn, partnerChannelName: string): Address {
        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: globals.minBalance,
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

        // Check the partner channel name length
        assert(partnerChannelName.length <= MaxPartnerChannelNameLength, 'PARTNER_CHANNEL_NAME_TOO_LONG')

        // Store the partner channel setup data in the callers local state
        const partnerChannelData: PartnerChannelSetup = {
            partnerChannelName: partnerChannelName,
        };
        this.partnerChannelsSetup(this.txn.sender, partnerChannelAddr).value = partnerChannelData;

        return partnerChannelAddr;
    }

    /**
     * Completes the creation of a partner channel account.
     * Only the initiator of the partner channel account can complete this process.
     * Caller may close out during this call.
     *
     * @param mbr - The minimum balance requirement for storing the partner channel data. Use `getPartnerChannelMbr()`.
     * @param partnerChannelAddr - The address of the partner channel account, created with `partnerChannelInit`.
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    partnerChannelDeployComplete(mbr: PayTxn, partnerChannelAddr: Address): Address {
        assert(this.partnerChannelsSetup(this.txn.sender, partnerChannelAddr).exists, 'PARTNER_CHANNEL_NOT_FOUND');

        // Retrieve the partner channel setup data from callers local state
        const partnerChannelSetup = this.partnerChannelsSetup(this.txn.sender, partnerChannelAddr).value;

        verifyPayTxn(mbr, {
            receiver: this.app.address,
            amount: this.getPartnerChannelBoxMbr(partnerChannelSetup.partnerChannelName),
        });

        // Sanity check. Make sure the partner channel address is still controlled by the current application.
        assert(partnerChannelAddr.authAddr === globals.currentApplicationAddress, 'INVALID_PARTNER_ADDRESS')

        // Store the partner channel data in the box
        const partnerChannelData: PartnerChannelData = {
            partnerChannelName: partnerChannelSetup.partnerChannelName,
            owner: this.txn.sender,
            address: partnerChannelAddr,
        };
        this.partnerChannels(partnerChannelAddr).value = partnerChannelData;

        // Delete the partner channel data from the callers local state
        this.partnerChannelsSetup(this.txn.sender, partnerChannelAddr).delete();

        // Increment active partner channels
        this.partnerChannelsActiveCount.value = this.partnerChannelsActiveCount.value + 1;

        this.PartnerChannelCreated.log({
            partnerChannel: partnerChannelAddr,
            partnerChannelName: partnerChannelData.partnerChannelName,
        });

        return partnerChannelAddr;
    }

    /**
     * Close partner channel account. This permanently removes the rekey and deletes the account from the ledger
     *
     * @param partnerChannel Address to close
     */
    partnerChannelClose(partnerChannel: Address): void {
        assert(this.partnerChannels(partnerChannel).exists, 'PARTNER_CHANNEL_NOT_FOUND');
        const partnerChannelData = this.partnerChannels(partnerChannel).value;
        const partnerChannelName = partnerChannelData.partnerChannelName;
        const eventData: PartnerChannelCloseEventData = {
          partnerChannel: partnerChannel,
          partnerChannelName: partnerChannelName
        };
        // only partner channel owner can close it
        assert(partnerChannelData.owner === this.txn.sender, 'SENDER_NOT_ALLOWED');

        sendPayment({
            sender: partnerChannel,
            receiver: partnerChannel,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const boxCost = this.getPartnerChannelBoxMbr(partnerChannelData.partnerChannelName);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the partner channel from the box
        this.partnerChannels(partnerChannel).delete();

        // Decrement active partner channels
        this.partnerChannelsActiveCount.value = this.partnerChannelsActiveCount.value - 1;

        this.PartnerChannelClosed.log(eventData);
    }

    /**
     * Retrieves the minimum balance requirement for creating a card fund account.
     * @param reference client reference to store on the Card Fund.
     * @returns Minimum balance requirement for creating a card fund account
     */
    getCardFundBoxMbr(reference: string): uint64 {
        // Card Fund Data Box Cost:
        // 2500 + 400 * ((Prefix + Address) + ((partnerChannel + owner + address + nonce + withdrawalNonce + (ABIHead + (ABI encoded reference)))))
        const cardFundDataBoxCost = 2500 + 400 * ((2 + 32) + ((32 + 32 + 32 + 8 + 8 + (2 + (2 + reference.length)))));
        // Partner Card Fund Owner Box Cost:
        // 2500 + 400 * ((Prefix + hashed key(32 bytes)) + (cardFundAddress))
        const partnerCardFundOwnerBoxCost = 2500 + 400 * (2 + 32 + 32);

        return cardFundDataBoxCost + partnerCardFundOwnerBoxCost;
    }

    /**
     * Deploys a new card fund account and associates it with the provided partner channel.
     * This account is not yet active and requires the card fund owner to complete the setup.
     * Caller must be opted-in to the application for this call.
     *
     * @param accountMbr - The minimum balance requirement for creating an account. Currently 0.1 Algo, with an additional 0.1 Algo to optin to an ASA.
     * @param partnerChannel - The address of the partner channel.
     * @param asset - Asset to opt-in to. 0 = No asset opt-in
     * @param reference - Client reference to store on the Card Fund
     * @returns Newly generated account used by the card fund
     */
    @allow.call('NoOp')
    @allow.call('OptIn')
    cardFundDeployInit(accountMbr: PayTxn, partnerChannel: Address, asset: AssetID, reference: string): Address {
        assert(this.partnerChannels(partnerChannel).exists, 'PARTNER_CHANNEL_NOT_FOUND');

        // Check the card fund reference length
        assert(reference.length <= MaxCardFundReferenceLength, 'CARD_FUND_REFERENCE_TOO_LONG');

        // Only a single partner channel card fund is allowed per account
        const partnerCardFundOwnerKeyData: PartnerCardFundData = {
            partnerChannel: partnerChannel,
            cardFundOwner: this.txn.sender,
        };
        const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));
        assert(!this.partnerCardFundOwner(partnerCardFundOwnerKey).exists, 'CARD_FUND_ALREADY_EXISTS');

        const assetMbr = asset ? globals.assetOptInMinBalance : 0;
        verifyPayTxn(accountMbr, {
            receiver: this.app.address,
            amount: globals.minBalance + assetMbr,
        });

        // Create a new account
        const cardFundAddr = sendMethodCall<typeof ControlledAddress.prototype.new>({
            onCompletion: OnCompletion.DeleteApplication,
            approvalProgram: ControlledAddress.approvalProgram(),
            clearStateProgram: ControlledAddress.clearProgram(),
        });

        // Fund the account with a minimum balance
        sendPayment({
            receiver: cardFundAddr,
            amount: globals.minBalance + assetMbr,
        });

        // Opt-in to the asset if provided
        if (asset) {
            this.cardFundAssetOptIn(cardFundAddr, asset);
        }

        // Store the card fund setup data in the callers local state
        const cardFundSetupData: CardFundSetup = {
            partnerChannel: partnerChannel,
            reference: reference,
        };
        this.cardFundsSetup(this.txn.sender, cardFundAddr).value = cardFundSetupData;

        return cardFundAddr;
    }

    /**
     * Completes the creation of a card fund account.
     * Only the initiator of the card fund account can complete this process.
     * Caller may close out during this call.
     *
     * @param boxMbr - The minimum balance requirement for storing the card fund data. Use `getCardFundMbr()`.
     * @param cardFundAddr - The address of the card fund account.
     * @returns Card fund address
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    cardFundDeployComplete(boxMbr: PayTxn, cardFundAddr: Address): Address {
        assert(this.cardFundsSetup(this.txn.sender, cardFundAddr).exists, 'CARD_FUND_NOT_FOUND');

        // Retrieve the card fund setup data from callers local state
        const cardFundSetup = this.cardFundsSetup(this.txn.sender, cardFundAddr).value;

        // Only a single partner channel card fund is allowed per user
        const partnerCardFundOwnerKeyData: PartnerCardFundData = {
            partnerChannel: cardFundSetup.partnerChannel,
            cardFundOwner: this.txn.sender,
        };
        const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));
        assert(!this.partnerCardFundOwner(partnerCardFundOwnerKey).exists, 'CARD_FUND_ALREADY_EXISTS');

        verifyPayTxn(boxMbr, {
            receiver: this.app.address,
            amount: this.getCardFundBoxMbr(cardFundSetup.reference),
        });

        // Sanity check. Make sure the partner channel address is still controlled by the current application.
        assert(cardFundAddr.authAddr === globals.currentApplicationAddress, 'INVALID_CARD_ADDRESS')

        const cardFundData: CardFundData = {
            partnerChannel: cardFundSetup.partnerChannel,
            reference: cardFundSetup.reference,
            owner: this.txn.sender,
            address: cardFundAddr,
            paymentNonce: 0,
            withdrawalNonce: 0,
        };

        // Store new card along with Card Holder
        this.cardFunds(cardFundAddr).value = cardFundData;

        // Increment active card funds
        this.cardFundsActiveCount.value = this.cardFundsActiveCount.value + 1;

        // Add the card fund to the partnerCardFundOwner index map
        this.partnerCardFundOwner(partnerCardFundOwnerKey).value = cardFundAddr;

        this.CardFundCreated.log({
            cardFundOwner: this.txn.sender,
            cardFund: cardFundAddr,
            partnerChannel: cardFundSetup.partnerChannel,
            reference: cardFundSetup.reference,
        });

        // Delete the card fund setup data from the callers local state
        this.cardFundsSetup(this.txn.sender, cardFundAddr).delete();

        // Return the new account address
        return cardFundAddr;
    }

    /**
     * Close card fund account. This permanently removes the rekey and deletes the account from the ledger
     *
     * @param cardFund Address to close
     */
    cardFundClose(cardFund: Address): void {
        // only card fund owner can close it
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        const cardFundData = this.cardFunds(cardFund).value;
        const eventData: CardFundCloseEventData = {
          cardFundOwner: cardFundData.owner,
          cardFund: cardFund,
          partnerChannel: cardFundData.partnerChannel,
          reference: cardFundData.reference
        };
        const partnerCardFundOwnerKeyData: PartnerCardFundData = {
            partnerChannel: cardFundData.partnerChannel,
            cardFundOwner: cardFundData.owner,
        };
        const partnerCardFundOwnerKey = sha256(rawBytes(partnerCardFundOwnerKeyData));

        sendPayment({
            sender: cardFund,
            receiver: cardFund,
            amount: 0,
            closeRemainderTo: this.txn.sender,
        });

        const boxCost = this.getCardFundBoxMbr(cardFundData.reference);

        sendPayment({
            receiver: this.txn.sender,
            amount: boxCost,
        });

        // Delete the card from the box
        this.cardFunds(cardFund).delete();

        // Decrement active card funds
        this.cardFundsActiveCount.value = this.cardFundsActiveCount.value - 1;

        // Remove the card fund from the partnerCardFundOwner index map
        this.partnerCardFundOwner(partnerCardFundOwnerKey).delete();

        this.CardFundClosed.log(eventData);
    }

    /**
     * Retrieves the minimum balance requirement for adding an asset to the allowlist.
     * @returns Minimum balance requirement for adding an asset to the allowlist
     */
    getAssetAllowlistMbr(): uint64 {
        // Box Cost: 2500 + 400 * (Prefix + AssetID + Address)
        const assetSettlementAddressCost = 2500 + 400 * (2 + 8 + 32);
        return globals.assetOptInMinBalance + assetSettlementAddressCost;
    }

    /**
     * Allows the master contract to flag intent of accepting an asset.
     *
     * @param mbr Payment transaction of minimum balance requirement.
     * @param asset The AssetID of the asset being transferred.
     */
    assetAllowlistAdd(mbr: PayTxn, asset: AssetID, settlementAddress: Address): void {
        this.onlyOwner();
        assert(!this.app.address.isOptedInToAsset(asset), 'ASSET_ALREADY_OPTED_IN');

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

        assert(this.app.address.isOptedInToAsset(asset), 'ASSET_NOT_OPTED_IN');

        // Asset balance must be zero to close out of it. Consider settling the asset balance before revoking it.
        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: this.app.address,
            assetCloseTo: this.app.address,
            xferAsset: asset,
            assetAmount: 0,
        });

        // Delete the settlement address, freeing up MBR
        this.settlementAddress(asset).delete();

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
        const expectedPaymentNonce = this.cardFunds(cardFund).value.paymentNonce + 1;
        assert(expectedPaymentNonce === nonce, 'NONCE_INVALID');

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
        this.cardFunds(cardFund).value.paymentNonce = expectedPaymentNonce;
    }

    /**
     * Retrieves the settler role address.
     *
     * @returns The settler role address.
     */
    @abi.readonly
    getSettlerRole(): Address {
        return this.settlerRoleAddress.value;
    }

    /**
     * Sets the settler role address.
     * Only the owner of the contract can call this method.
     *
     * @param newSettlerAddress The new settler role address to be set.
     */
    setSettlerRole(newSettlerAddress: Address): void {
        this.onlyOwner();

        this.settlerRoleAddress.value = newSettlerAddress;
    }

    /**
     * Refunds a specified amount of an asset to a card account.
     * Only the owner of the contract can perform this operation.
     *
     * @param cardFund - The card account to refund the asset to.
     * @param asset - The asset to refund.
     * @param amount - The amount of the asset to refund.
     */
    cardFundRefund(cardFund: Address, asset: AssetID, amount: uint64, nonce: uint64, ref: string): void {
        this.whenNotPaused();
        this.onlySettler();

        // Ensure the nonce is correct
        const expectedPaymentNonce = this.cardFunds(cardFund).value.paymentNonce + 1;
        assert(expectedPaymentNonce === nonce, 'NONCE_INVALID');

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: cardFund,
            xferAsset: asset,
            assetAmount: amount,
            note: ref
        });

        this.Refund.log({
            card: cardFund,
            asset: asset,
            amount: amount,
            nonce: nonce,
            reference: ref,
        });

        // Increment the nonce
        this.cardFunds(cardFund).value.paymentNonce = expectedPaymentNonce;
    }

    /**
     * Retrieves the current available nonce for settlements.
     *
     * @returns The settlement nonce.
     */
    @abi.readonly
    getSettlementNonce(): uint64 {
        return this.settlementNonce.value;
    }

    /**
     * Retrieves the current available nonce for the card fund.
     *
     * @param cardFund The card fund address.
     * @returns The nonce for the card fund.
     */
    @abi.readonly
    getCardFundPaymentNonce(cardFund: Address): uint64 {
        return this.cardFunds(cardFund).value.paymentNonce;
    }

    /**
     * Retrieves the next available nonce for the card fund.
     *
     * @param cardFund The card fund address.
     * @returns The nonce for the card fund.
     */
    @abi.readonly
    getCardFundWithdrawalNonce(cardFund: Address): uint64 {
        return this.cardFunds(cardFund).value.withdrawalNonce;
    }

    /**
     * Retrieves the card fund data for a given card fund address.
     *
     * @param cardFund The address of the card fund.
     * @returns The card fund data.
     */
    @abi.readonly
    getCardFundData(cardFund: Address): CardFundData {
        return this.cardFunds(cardFund).value;
    }

    /**
     * Retrieves the settlement address for the specified asset.
     *
     * @param asset The ID of the asset.
     * @returns The settlement address for the asset.
     */
    @abi.readonly
    getSettlementAddress(asset: AssetID): Address {
        assert(this.settlementAddress(asset).exists, 'SETTLEMENT_ADDRESS_NOT_FOUND');
        return this.settlementAddress(asset).value;
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

        const expectedSettlementNonce = this.settlementNonce.value + 1;
        // Ensure the nonce is correct
        assert(expectedSettlementNonce === nonce, 'NONCE_INVALID');
        const assetReceiver = this.getSettlementAddress(asset);

        sendAssetTransfer({
            sender: this.app.address,
            assetReceiver: assetReceiver,
            xferAsset: asset,
            assetAmount: amount,
        });

        this.Settlement.log({
            recipient: assetReceiver,
            asset: asset,
            amount: amount,
            nonce: nonce,
        });

        // Increment the settlement nonce
        this.settlementNonce.value = expectedSettlementNonce;
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
    cardFundInitPermissionlessWithdrawal(
        cardFund: Address,
        asset: AssetID,
        amount: uint64
    ): PermissionlessWithdrawalRequest {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        const cardFundData = this.cardFunds(cardFund).value;
        assert(amount <= cardFund.assetBalance(asset), 'INSUFFICIENT_BALANCE');

        const withdrawal: PermissionlessWithdrawalRequest = {
            cardFund: cardFund,
            asset: asset,
            amount: amount,
            createdAt: globals.latestTimestamp,
            nonce: cardFundData.withdrawalNonce + 1,
        };
        this.withdrawals(this.txn.sender, cardFund).value = withdrawal;

        this.WithdrawalRequest.log({
          cardFund: cardFund,
          recipient: this.txn.sender,
          asset: asset,
          amount: amount,
          createdAt: globals.latestTimestamp,
          nonce: cardFundData.withdrawalNonce + 1,
        });

        return withdrawal;
    }

    /**
     * Allows the Card Holder (or contract owner) to cancel a withdrawal request
     * @param cardFund Address to withdraw from
     */
    cardFundWithdrawalCancel(cardFund: Address): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        assert(this.withdrawals(this.txn.sender, cardFund).exists, 'WITHDRAWAL_REQUEST_NOT_FOUND');
        const withdrawalRequest = this.withdrawals(this.txn.sender, cardFund).value;
        this.withdrawals(this.txn.sender, cardFund).delete();
        this.WithdrawalRequestCancelled.log({
          cardFund: withdrawalRequest.cardFund,
          recipient: this.txn.sender,
          asset: withdrawalRequest.asset,
          amount: withdrawalRequest.amount,
          createdAt: withdrawalRequest.createdAt,
          nonce: withdrawalRequest.nonce,
        });
    }


    /**
     * Allows the Card Holder to send an amount of assets from the account
     * @param cardFund Address to withdraw from
     */
    @allow.call('NoOp')
    @allow.call('CloseOut')
    cardFundExecutePermissionlessWithdrawal(cardFund: Address, amount: uint64): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        assert(this.withdrawals(this.txn.sender, cardFund).exists, 'WITHDRAWAL_REQUEST_NOT_FOUND');
        const cardFundData = this.cardFunds(cardFund).value;
        const withdrawal = this.withdrawals(this.txn.sender, cardFund).value;
        assert(amount <= withdrawal.amount, 'AMOUNT_INVALID');
        assert(cardFundData.withdrawalNonce + 1 == withdrawal.nonce, 'NONCE_INVALID');

        const releaseTime = withdrawal.createdAt + this.withdrawalWaitTime.value;
        assert(globals.latestTimestamp >= releaseTime, 'WITHDRAWAL_TIME_INVALID');

        // Issue the withdrawal
        this.withdrawFunds(
            cardFund,
            withdrawal.asset,
            amount,
            withdrawal.createdAt,
            withdrawal.nonce,
            WithdrawalTypePermissionLess
        );
        this.withdrawals(this.txn.sender, cardFund).delete();
    }

    /**
     * Withdraws funds before the withdrawal timestamp has lapsed, by using the early withdrawal signature provided by Immersve.
     * @param cardFund - The address of the card.
     * @param asset - The ID of the asset to be withdrawn.
     * @param amount - The amount of the withdrawal.
     * @param expiresAt - The expiry of the withdrawal signature.
     * @param signature - The signature for early withdrawal.
     */
    cardFundExecuteApprovedWithdrawal(
        cardFund: Address,
        asset: AssetID,
        amount: uint64,
        expiresAt: uint64,
        nonce: uint64,
        signature: bytes64
    ): void {
        assert(this.isCardFundOwner(cardFund), 'SENDER_NOT_ALLOWED');
        const cardFundData = this.cardFunds(cardFund).value;

        assert(globals.latestTimestamp < expiresAt, 'WITHDRAWAL_TIME_INVALID');
        const expectedWithdrawalNonce = cardFundData.withdrawalNonce + 1;
        assert(expectedWithdrawalNonce == nonce, 'NONCE_INVALID');

        const withdrawal: ApprovedWithdrawalRequest = {
          cardFund: cardFund,
          recipient: this.txn.sender,
          asset: asset,
          amount: amount,
          expiresAt: expiresAt,
          nonce: nonce,
          genesisHash: globals.genesisHash as bytes32,
        };

        const withdrawalHash = sha256(rawBytes(withdrawal));

        // Need at least 2000 Opcode budget
        while (globals.opcodeBudget < 2500) {
            increaseOpcodeBudget();
        }

        assert(ed25519VerifyBare(withdrawalHash, signature, this.settlerRoleAddress.value), 'SIGNATURE_INVALID');

        // Issue the withdrawal
        this.withdrawFunds(cardFund, asset, amount, expiresAt, nonce, WithdrawalTypeApproved);
    }
}
