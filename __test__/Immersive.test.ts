import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import algosdk from 'algosdk';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import { sendTransaction } from '@algorandfoundation/algokit-utils'
import { ImmersveClient } from '../client/Immersve.client';

const fixture = algorandFixture();

let appClient: ImmersveClient;

describe('Immersve', () => {
  beforeEach(fixture.beforeEach);

  let admin: algosdk.Account, depositor: algosdk.Account, circle: algosdk.Account;
  let fakeUSDC_ID: number;
  let newCardAddress: string;
  let withdrawalRequest: Uint8Array;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algod, testAccount, generateAccount } = fixture.context;

    appClient = new ImmersveClient(
      {
        sender: testAccount,
        resolveBy: 'id',
        id: 0,
      },
      algod,
    );

    const newAccounts = await Promise.all([
        generateAccount({initialFunds: AlgoAmount.Algos(10)}),
        generateAccount({initialFunds: AlgoAmount.Algos(10)}),
    ]);
    admin = testAccount;
    depositor = newAccounts[0];
    circle = newAccounts[1];

    // Crete FakeUSDC
    fakeUSDC_ID = (await sendTransaction({
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
    }, algod)).confirmation!.assetIndex as number;

    // OptIn and Send FUSDC
    await Promise.all([
        sendTransaction({
          transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: depositor.addr,
            to: depositor.addr,
            assetIndex: fakeUSDC_ID,
            amount: 0,
            suggestedParams: await algod.getTransactionParams().do(),
          }),
          from: depositor,
        }, algod),
        sendTransaction({
          transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: circle.addr,
            to: circle.addr,
            assetIndex: fakeUSDC_ID,
            amount: 0,
            suggestedParams: await algod.getTransactionParams().do(),
          }),
          from: circle,
        }, algod),
    ]);
    await sendTransaction({
      transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: admin.addr,
        to: depositor.addr,
        assetIndex: fakeUSDC_ID,
        amount: 100_000_000,
        suggestedParams: await algod.getTransactionParams().do(),
      }),
      from: admin,
    }, algod);

    // Deploy
    await appClient.create.deploy({});

    // Fund Application Address
    await appClient.appClient.fundAppAccount({
      sender: admin,
      amount: AlgoAmount.MicroAlgos(100_000),
    });
  });

  test('Set withdrawal rounds', async () => {
    const result = await appClient.setWithdrawalRounds({ rounds: 1 });

    expect(result.confirmation!.poolError).toBe('');
  });

  test('Create new card', async () => {
    const { algod } = fixture.context;
    const appReference = await appClient.appClient.getAppReference();

    const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: admin.addr,
      to: appReference.appAddress,
      amount: 140_900,
      suggestedParams: await algod.getTransactionParams().do(),
    });
    const result = await appClient.cardCreate({
      depositor: depositor.addr,
      fundingChannel: 'Pera',
      mbr,
    }, {
      sendParams: {
        fee: AlgoAmount.MicroAlgos(4_000),
        populateAppCallResources: true,
      }
    });
    expect(result.return).toBeDefined();

    newCardAddress = result.return!;
  });

  test('Allow FakeUSDC to be used', async () => {
    const { algod } = fixture.context;
    const appReference = await appClient.appClient.getAppReference();

    const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: admin.addr,
      to: appReference.appAddress,
      amount: 100_000,
      suggestedParams: await algod.getTransactionParams().do(),
    });
    const result = await appClient.allowAsset({
      asset: fakeUSDC_ID,
      mbr,
    }, {
      sendParams: {
        fee: AlgoAmount.MicroAlgos(2_000),
      }
    });

    expect(result.confirmation!.poolError).toBe('');
  });

  test('Add FakeUSDC to card', async () => {
    const { algod } = fixture.context;
    const appReference = await appClient.appClient.getAppReference();

    const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: depositor.addr,
      to: appReference.appAddress,
      amount: 100_000,
      suggestedParams: await algod.getTransactionParams().do(),
    });
    const result = await appClient.cardAddAsset({
      asset: fakeUSDC_ID,
      card: newCardAddress,
      fundingChannel: 'Pera',
      mbr,
    }, {
      sender: depositor,
      sendParams: {
        fee: AlgoAmount.MicroAlgos(3_000),
        populateAppCallResources: true,
      }
    });

    expect(result.confirmation!.poolError).toBe('');
  });

  test('Deposit FakeUSDC to card', async () => {
    const { algod } = fixture.context;

    const result = await sendTransaction({
      transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: depositor.addr,
        to: newCardAddress,
        assetIndex: fakeUSDC_ID,
        amount: 10_000_000,
        suggestedParams: await algod.getTransactionParams().do(),
      }),
      from: depositor,
    }, algod);

    expect(result.confirmation!.poolError).toBeDefined();
  });

  test('Depositor spends, owner debits', async () => {
    const result = await appClient.cardDebit({
      amount: 5_000_000,
      asset: fakeUSDC_ID,
      card: newCardAddress,
    }, {
      sendParams: {
        fee: AlgoAmount.MicroAlgos(3_000),
        populateAppCallResources: true,
      }
    });

    expect(result.confirmation!.poolError).toBeDefined();
  });

  test('Depositor creates withdrawal request', async () => {
    const result = await appClient.optIn.cardWithdrawalRequest({
      amount: 5_000_000,
      asset: fakeUSDC_ID,
      card: newCardAddress,
      fundingChannel: 'Pera',
    }, {
      sender: depositor,
      sendParams: {
        populateAppCallResources: true,
      }
    });

    expect(result.return).toBeDefined();

    withdrawalRequest = result.return!
  });

  test('Settle debits', async () => {
    const result = await appClient.settle({
      amount: 5_000_000,
      asset: fakeUSDC_ID,
      recipient: circle.addr,
    }, {
      sendParams: {
        fee: AlgoAmount.MicroAlgos(2_000),
        populateAppCallResources: true,
      }
    });

    expect(result.confirmation!.poolError).toBe('');
  });

  test('Complete withdrawal request', async () => {
    const result = await appClient.cardWithdraw({
      asset: fakeUSDC_ID,
      card: newCardAddress,
      fundingChannel: 'Pera',
      recipient: depositor.addr,
      withdrawal_hash: withdrawalRequest,
    }, {
      sender: depositor,
      sendParams: {
        fee: AlgoAmount.MicroAlgos(2_000),
        populateAppCallResources: true,
      }
    })
  });
});
