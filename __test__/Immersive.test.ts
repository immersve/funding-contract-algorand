import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import algosdk from 'algosdk';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import { sendTransaction } from '@algorandfoundation/algokit-utils';
import { PartnerFactoryClient } from '../client/PartnerFactory.client';
import { PartnerClient } from '../client/Partner.client';

const fixture = algorandFixture();

let factoryAppClient: PartnerFactoryClient;
let appClient: PartnerClient;

describe('Immersve', () => {
  beforeEach(fixture.beforeEach);

  let admin: algosdk.Account;
  let depositor: algosdk.Account;
  let circle: algosdk.Account;

  let fakeUSDC: number;
  let newCardAddress: string;
  let withdrawalRequest: Uint8Array;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algod, testAccount, generateAccount } = fixture.context;

    const newAccounts = await Promise.all([
      generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
      generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
    ]);
    admin = testAccount;
    [depositor, circle] = newAccounts;

    factoryAppClient = new PartnerFactoryClient(
      {
        sender: admin,
        resolveBy: 'id',
        id: 0,
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
    await factoryAppClient.create.deploy({ owner: admin.addr });

    // Fund Factory Address
    await factoryAppClient.appClient.fundAppAccount({
      sender: admin,
      amount: AlgoAmount.MicroAlgos(100_000),
    });
  });

  test('Create new Partner contract', async () => {
    const { algod } = fixture.context;
    const { appAddress: factoryAddress } = await factoryAppClient.appClient.getAppReference();

    const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: admin.addr,
      to: factoryAddress,
      amount: 200_000 + 235_500,
      suggestedParams: await algod.getTransactionParams().do(),
    });
    const result = await factoryAppClient.newPartner(
      {
        owner: admin.addr,
        asset: fakeUSDC,
        mbr,
      },
      {
        sendParams: {
          fee: AlgoAmount.MicroAlgos(5_000),
        },
      }
    );

    expect(result.return).toBeDefined();

    appClient = new PartnerClient(
      {
        sender: admin,
        resolveBy: 'id',
        id: result.return!,
      },
      algod
    );
  });

  test('Set withdrawal rounds', async () => {
    const result = await appClient.setWithdrawalRounds({ rounds: 1 });

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

  test('Depositor spends, owner debits', async () => {
    const result = await appClient.cardDebit(
      {
        amount: 5_000_000,
        card: newCardAddress,
      },
      {
        sendParams: {
          fee: AlgoAmount.MicroAlgos(3_000),
          populateAppCallResources: true,
        },
      }
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

  test('Settle debits', async () => {
    const result = await appClient.settle(
      {
        amount: 5_000_000,
        recipient: circle.addr,
      },
      {
        sendParams: {
          fee: AlgoAmount.MicroAlgos(2_000),
          populateAppCallResources: true,
        },
      }
    );

    expect(result.confirmation!.poolError).toBe('');
  });

  test('Complete withdrawal request', async () => {
    const result = await appClient.closeOut.cardWithdraw(
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
    );

    expect(result.confirmation!.poolError).toBe('');
  });
});
