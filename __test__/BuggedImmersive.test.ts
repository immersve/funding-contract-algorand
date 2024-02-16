import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import algosdk from 'algosdk';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import { sendTransaction, getLocalNetDispenserAccount, getOrCreateKmdWalletAccount } from '@algorandfoundation/algokit-utils';
import {BuggedPartnerFactoryCallFactory, BuggedPartnerFactoryClient} from '../client/BuggedPartnerFactory.client';
import { BuggedPartnerClient } from '../client/BuggedPartner.client';

const fixture = algorandFixture();

let factoryAppClient: BuggedPartnerFactoryClient;
let appClient: BuggedPartnerClient;

describe('Bugged Immersve', () => {
  beforeEach(fixture.beforeEach);

  let admin: algosdk.Account;
  let depositor: algosdk.Account;
  let circle: algosdk.Account;

  let fakeUSDC: number;
  let newCardAddress: string;
  let withdrawalRequest: Uint8Array;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algod, kmd, indexer, generateAccount } = fixture.context;

    const localDispenser = await getLocalNetDispenserAccount(algod, kmd)
    const testAccount = await getOrCreateKmdWalletAccount({
        name: 'fixedTestAccount',
    }, algod, kmd);
    await sendTransaction({
        transaction: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: localDispenser.addr,
            to: testAccount.addr,
            amount: 100_000_000,
            suggestedParams: await algod.getTransactionParams().do(),
        }),
        from: localDispenser
    }, algod);

    const newAccounts = await Promise.all([
      generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
      generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
    ]);
    admin = testAccount;
    [depositor, circle] = newAccounts;

    factoryAppClient = new BuggedPartnerFactoryClient(
      {
        sender: admin,
        resolveBy: 'creatorAndName',
        creatorAddress: admin.addr,
        name: 'BuggedPartnerFactory',
        findExistingUsing: indexer
      },
      algod
    );

    // Crete FakeUSDC
    fakeUSDC = (
      await sendTransaction(
        {
          transaction: algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
            from: admin.addr,
            assetName: 'FakeUSDC',
            unitName: 'FUSDC',
            total: BigInt(2) ** BigInt(64) - BigInt(1),
            decimals: 6,
            defaultFrozen: false,
            manager: admin.addr,
            reserve: admin.addr,
            freeze: admin.addr,
            suggestedParams: await algod.getTransactionParams().do(),
          }),
          from: admin,
        },
        algod
      )
    ).confirmation!.assetIndex as number;

    // OptIn and Send FUSDC
    await Promise.all([
      sendTransaction(
        {
          transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: depositor.addr,
            to: depositor.addr,
            assetIndex: fakeUSDC,
            amount: 0,
            suggestedParams: await algod.getTransactionParams().do(),
          }),
          from: depositor,
        },
        algod
      ),
      sendTransaction(
        {
          transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: circle.addr,
            to: circle.addr,
            assetIndex: fakeUSDC,
            amount: 0,
            suggestedParams: await algod.getTransactionParams().do(),
          }),
          from: circle,
        },
        algod
      ),
    ]);
    await sendTransaction(
      {
        transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          from: admin.addr,
          to: depositor.addr,
          assetIndex: fakeUSDC,
          amount: 100_000_000,
          suggestedParams: await algod.getTransactionParams().do(),
        }),
        from: admin,
      },
      algod
    );

    // Deploy
    await factoryAppClient.deploy({
        onUpdate: 'update',
        createCall: (cf) => cf.deploy({ owner: admin.addr }),
        updateCall: (cf) => cf.update({}),
    });

    // Fund Factory Address
    await factoryAppClient.appClient.fundAppAccount({
      sender: admin,
      amount: AlgoAmount.MicroAlgos(100_000),
    });
  });

  test('Create new Partner contract', async () => {
    const { algod, indexer } = fixture.context;
    const { appAddress: factoryAddress } = await factoryAppClient.appClient.getAppReference();

    appClient = new BuggedPartnerClient(
      {
        sender: admin,
        resolveBy: 'creatorAndName',
        creatorAddress: factoryAddress,
        findExistingUsing: indexer,
      },
      algod
    );

    // Deploy
    await appClient.deploy({
        onUpdate: 'update',
        // createCall: (cf) => factoryAppClient.newPartner({
        //     owner: admin.addr,
        //     asset: fakeUSDC,
        //     mbr
        // }),
        updateCall: (cf) => cf.update({}),
    });

    console.debug(appClient);
  });

  test('Set withdrawal rounds', async () => {
    const result = await appClient.setWithdrawalRounds({ rounds: 1000 });

    expect(result.confirmation!.poolError).toBe('');
  });

  test('Create new card', async () => {
    const { algod } = fixture.context;
    const { appAddress: partnerAddress } = await appClient.appClient.getAppReference();

    const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: admin.addr,
      to: partnerAddress,
      amount: 200_000 + 44_100,
      suggestedParams: await algod.getTransactionParams().do(),
    });
    const result = await appClient.cardCreate(
      {
        cardHolder: depositor.addr,
        partner: 'Pera',
        mbr,
      },
      {
        sendParams: {
          fee: AlgoAmount.MicroAlgos(5_000),
          populateAppCallResources: true,
        },
      }
    );
    expect(result.return).toBeDefined();

    newCardAddress = result.return!;
  });

  test('Deposit FakeUSDC to card', async () => {
    const { algod } = fixture.context;

    const result = await sendTransaction(
      {
        transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          from: depositor.addr,
          to: newCardAddress,
          assetIndex: fakeUSDC,
          amount: 10_000_000,
          suggestedParams: await algod.getTransactionParams().do(),
        }),
        from: depositor,
      },
      algod
    );

    expect(result.confirmation!.poolError).toBeDefined();
  });

  test('Depositor creates withdrawal request', async () => {
    const result = await appClient.optIn.cardWithdrawalRequest(
      {
        amount: 5_000_000,
        card: newCardAddress,
        partner: 'Pera',
      },
      {
        sender: depositor,
        sendParams: {
          populateAppCallResources: true,
        },
      }
    );

    expect(result.return).toBeDefined();

    withdrawalRequest = result.return!;
  });

  test('(Negative) Complete withdrawal request before it should be allowed', async () => {
    await expect(
      appClient.closeOut.cardWithdraw(
        {
          card: newCardAddress,
          partner: 'Pera',
          recipient: depositor.addr,
          withdrawal_hash: withdrawalRequest,
        },
        {
          sender: depositor,
          sendParams: {
            fee: AlgoAmount.MicroAlgos(2_000),
            populateAppCallResources: true,
          },
        }
      )
    ).rejects.toThrow();
  });
});
