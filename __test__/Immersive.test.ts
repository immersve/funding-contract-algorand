/* eslint-disable import/no-extraneous-dependencies */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import algosdk from 'algosdk';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import { sendTransaction, microAlgos } from '@algorandfoundation/algokit-utils';
import { MasterClient } from '../client/MasterClient';

const fixture = algorandFixture();

let appClient: MasterClient;

describe('Immersve', () => {
    beforeEach(fixture.beforeEach);

    let circle: algosdk.Account;
    let immersve: algosdk.Account;
    let user: algosdk.Account;

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
        immersve = testAccount;
        [user, circle] = newAccounts;

        // Crete FakeUSDC
        fakeUSDC = (
            await sendTransaction(
                {
                    transaction: algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
                        from: circle.addr,
                        assetName: 'FakeUSDC',
                        unitName: 'FUSDC',
                        total: BigInt(2) ** BigInt(64) - BigInt(1),
                        decimals: 6,
                        defaultFrozen: false,
                        manager: circle.addr,
                        reserve: circle.addr,
                        freeze: circle.addr,
                        suggestedParams: await algod.getTransactionParams().do(),
                    }),
                    from: circle,
                },
                algod
            )
        ).confirmation!.assetIndex as number;

        // OptIn and Send FUSDC
        await Promise.all([
            sendTransaction(
                {
                    transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                        from: immersve.addr,
                        to: immersve.addr,
                        assetIndex: fakeUSDC,
                        amount: 0,
                        suggestedParams: await algod.getTransactionParams().do(),
                    }),
                    from: immersve,
                },
                algod
            ),
            sendTransaction(
                {
                    transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                        from: user.addr,
                        to: user.addr,
                        assetIndex: fakeUSDC,
                        amount: 0,
                        suggestedParams: await algod.getTransactionParams().do(),
                    }),
                    from: user,
                },
                algod
            ),
        ]);
        await sendTransaction(
            {
                transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                    from: circle.addr,
                    to: user.addr,
                    assetIndex: fakeUSDC,
                    amount: 100_000_000,
                    suggestedParams: await algod.getTransactionParams().do(),
                }),
                from: circle,
            },
            algod
        );

        appClient = new MasterClient(
            {
                id: 0,
                resolveBy: 'id',
                sender: immersve,
            },
            algod
        );

        await appClient.create.deploy({ owner: immersve.addr });

        // FIX: Do I need to fund the app account?
        // await appClient.appClient.fundAppAccount({ amount: microAlgos(200_000) });
    });

    test('Create new partner', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        // 2500 per box, 400 per byte: prefix + partner name + addr length
        const boxCost = 2500 + 400 * (1 + 2 + 'Pera'.length + 32);

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: 200_000 + boxCost, // TODO: Use minimum balance + asset optin cost + box cost
            suggestedParams: await algod.getTransactionParams().do(),
        });

        await appClient.partnerCreate(
            { mbr, partner: 'Pera' },
            { sendParams: { fee: microAlgos(5_000), populateAppCallResources: true } }
        );
    });

    test('Set withdrawal rounds', async () => {
        const result = await appClient.setWithdrawalRounds({ rounds: 0 });

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Immersve Accept FakeUSDC', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: 100_000,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.acceptAsset(
            {
                mbr,
                asset: fakeUSDC,
            },
            {
                sendParams: {
                    fee: microAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Accept FakeUSDC', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: 100_000,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.partnerAcceptAsset(
            {
                mbr,
                partner: 'Pera',
                asset: fakeUSDC,
            },
            {
                sendParams: {
                    fee: microAlgos(3_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Create new card', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        // 2500 per box, 400 per byte: prefix + partner name + addr length
        const boxCost = 2500 + 400 * (1 + 4 + 'Pera'.length + 32 + 32);

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: 100_000 + boxCost,
            suggestedParams: await algod.getTransactionParams().do(),
        });
        const result = await appClient.cardCreate(
            {
                mbr,
                partner: 'Pera',
                cardHolder: user.addr,
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

    test('Enable FakeUSDC for card', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user.addr,
            to: appAddress,
            amount: 100_000,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.cardEnableAsset(
            {
                mbr,
                partner: 'Pera',
                card: newCardAddress,
                asset: fakeUSDC,
            },
            {
                sender: user,
                sendParams: {
                    fee: microAlgos(3_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Deposit FakeUSDC to card', async () => {
        const { algod } = fixture.context;

        const result = await sendTransaction(
            {
                transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                    from: user.addr,
                    to: newCardAddress,
                    assetIndex: fakeUSDC,
                    amount: 10_000_000,
                    suggestedParams: await algod.getTransactionParams().do(),
                }),
                from: user,
            },
            algod
        );

        expect(result.confirmation!.poolError).toBeDefined();
    });

    test('User spends, Immersve debits', async () => {
        const result = await appClient.cardDebit(
            {
                partner: 'Pera',
                card: newCardAddress,
                asset: fakeUSDC,
                amount: 5_000_000,
            },
            {
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBeDefined();
    });

    test('User creates withdrawal request', async () => {
        const result = await appClient.optIn.cardWithdrawalRequest(
            {
                partner: 'Pera',
                card: newCardAddress,
                asset: fakeUSDC,
                amount: 5_000_000,
            },
            {
                sender: user,
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
                recipient: circle.addr,
                asset: fakeUSDC,
                amount: 5_000_000,
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
                partner: 'Pera',
                card: newCardAddress,
                recipient: user.addr,
                withdrawal_hash: withdrawalRequest,
            },
            {
                sender: user,
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    /*
  TODO: Close properly
  test('Update & remove partner', async () => {
    const { appId } = await appClient.appClient.getAppReference();
    const { algod } = fixture.context;
    const newClient = new RemovePartnerClient(
      {
        id: appId,
        resolveBy: 'id',
        sender: immersve,
      },
      algod
    );

    let errorThrown = false;
    try {
      await newClient.removePartner({ partner: 'Pera' }, { sendParams: { populateAppCallResources: true } });
    } catch (e) {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);

    await newClient.update.update({});
    await newClient.removePartner({ partner: 'Pera' }, { sendParams: { populateAppCallResources: true } });
  });
  */
});
