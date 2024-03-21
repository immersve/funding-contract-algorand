/* eslint-disable import/no-extraneous-dependencies */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import algosdk from 'algosdk';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import { sendTransaction, microAlgos } from '@algorandfoundation/algokit-utils';
import { MasterClient } from '../client/MasterClient';
import { PlaceholderClient } from '../client/PlaceholderClient';

const fixture = algorandFixture({ testAccountFunding: AlgoAmount.MicroAlgos(0) });

let placeholderClient: PlaceholderClient;
let appClient: MasterClient;

describe('Immersve', () => {
    beforeEach(fixture.beforeEach);

    let circle: algosdk.Account;
    let immersve: algosdk.Account;
    let user: algosdk.Account;
    let user2: algosdk.Account;

    let fakeUSDC: number;
    let newCardAddress: string;
    let withdrawalRequest: Uint8Array;

    beforeAll(async () => {
        await fixture.beforeEach();
        const { algod, generateAccount } = fixture.context;

        [immersve, user, user2, circle] = await Promise.all([
            generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
            generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
            generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
            generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
        ]);

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
            sendTransaction(
                {
                    transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                        from: user2.addr,
                        to: user2.addr,
                        assetIndex: fakeUSDC,
                        amount: 0,
                        suggestedParams: await algod.getTransactionParams().do(),
                    }),
                    from: user2,
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

        placeholderClient = new PlaceholderClient(
            {
                id: 0,
                resolveBy: 'id',
                sender: immersve,
            },
            algod
        );

        await placeholderClient.create.deploy(
            { owner: immersve.addr },
            {
                schema: {
                    extraPages: 3,
                    globalInts: 32,
                    globalByteSlices: 32,
                    localInts: 8,
                    localByteSlices: 8,
                },
            }
        );

        // FIX: Do I need to fund the app account?
        await placeholderClient.appClient.fundAppAccount({ amount: microAlgos(100_000) });
    });

    test('Upgrade Placeholder with Master', async () => {
        const { appId } = await placeholderClient.appClient.getAppReference();
        const { algod } = fixture.context;

        appClient = new MasterClient(
            {
                id: appId,
                resolveBy: 'id',
                sender: immersve,
            },
            algod
        );

        const result = await appClient.update.update(
            {
                master: immersve.addr,
            },
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Set withdrawal rounds', async () => {
        // A real value would be:
        // 60 * 60 * 24 * 5 = 432_000 seconds = 5 days
        // We're using 0 seconds to allow for instant withdrawals
        const result = await appClient.setWithdrawalTimeout({ seconds: 0 });

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Set settlement address', async () => {
        const result = await appClient.setSettlementAddress(
            {
                newSettlementAddress: circle.addr,
            },
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Allowlist Add FakeUSDC', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: 100_000,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.assetAllowlistAdd(
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

    test('Create new partner', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        // 2500 per box, 400 per byte: prefix + partner name + addr length
        const boxCost = 2500 + 400 * (1 + 2 + 'Pera'.length + 32);

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: 200_000 + boxCost, // TODO: Use minimum balance + asset opt-in cost + box cost
            suggestedParams: await algod.getTransactionParams().do(),
        });

        await appClient.partnerChannelCreate(
            { mbr, partnerChannel: 'Pera' },
            { sendParams: { fee: microAlgos(5_000), populateAppCallResources: true } }
        );
    });

    test('Create new card without assets', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        // 2500 per box, 400 per byte: prefix + partner name + addr length
        const boxCost = 2500 + 400 * (3 + 4 + 'Pera'.length + 32 + 32);

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user2.addr,
            to: appAddress,
            amount: 100_000 + boxCost,
            suggestedParams: await algod.getTransactionParams().do(),
        });
        const result = await appClient.cardFundCreate(
            {
                mbr,
                partnerChannel: 'Pera',
                asset: 0,
            },
            {
                sender: user2,
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(4_000),
                    populateAppCallResources: true,
                },
            }
        );
        expect(result.return).toBeDefined();

        newCardAddress = result.return!;
    });

    test('Close card without assets', async () => {
        const result = await appClient.cardFundClose(
            {
                partnerChannel: 'Pera',
                cardFundOwner: user2.addr,
                card: newCardAddress,
            },
            {
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(3_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Create new card with FakeUSDC', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        // 2500 per box, 400 per byte: prefix + partner name + addr length
        const boxCost = 2500 + 400 * (3 + 4 + 'Pera'.length + 32 + 32);

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user.addr,
            to: appAddress,
            amount: 100_000 + 100_000 + boxCost,
            suggestedParams: await algod.getTransactionParams().do(),
        });
        const result = await appClient.cardFundCreate(
            {
                mbr,
                partnerChannel: 'Pera',
                asset: fakeUSDC,
            },
            {
                sender: user,
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(5_000),
                    populateAppCallResources: true,
                },
            }
        );
        expect(result.return).toBeDefined();

        newCardAddress = result.return!;
    });

    test('Disable FakeUSDC for card', async () => {
        const result = await appClient.cardFundDisableAsset(
            {
                partnerChannel: 'Pera',
                cardFund: newCardAddress,
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

    test('Enable FakeUSDC for card', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user.addr,
            to: appAddress,
            amount: 100_000,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.cardFundEnableAsset(
            {
                mbr,
                partnerChannel: 'Pera',
                cardFund: newCardAddress,
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
        const result = await appClient.cardFundDebit(
            {
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

    test('Update Contract', async () => {
        const result = await appClient.update.update(
            {},
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Recover Card', async () => {
        const result = await appClient.cardFundRecover(
            {
                partnerChannel: 'Pera',
                oldCardHolder: user.addr,
                newCardHolder: user2.addr,
            },
            {
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('User creates withdrawal request', async () => {
        const result = await appClient.optIn.cardFundWithdrawalRequest(
            {
                partnerChannel: 'Pera',
                card: newCardAddress,
                recipient: user2.addr,
                asset: fakeUSDC,
                amount: 5_000_000,
            },
            {
                sender: user2,
                sendParams: {
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.return).toBeDefined();

        withdrawalRequest = result.return!;
    });

    test('Settle debits', async () => {
        const settlementNonce = await appClient.getNextSettlementNonce(
            {},
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        const result = await appClient.settle(
            {
                asset: fakeUSDC,
                amount: 5_000_000,
                nonce: settlementNonce.return as bigint,
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
        const result = await appClient.closeOut.cardFundWithdraw(
            {
                partnerChannel: 'Pera',
                card: newCardAddress,
                withdrawal_hash: withdrawalRequest,
            },
            {
                sender: user2,
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    // TODO: cardWithdrawEarly test

    test('Disable FakeUSDC for card', async () => {
        const result = await appClient.cardFundDisableAsset(
            {
                partnerChannel: 'Pera',
                cardFund: newCardAddress,
                asset: fakeUSDC,
            },
            {
                sender: user2,
                sendParams: {
                    fee: microAlgos(3_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Close card', async () => {
        const result = await appClient.cardFundClose(
            {
                partnerChannel: 'Pera',
                cardFundOwner: user2.addr,
                card: newCardAddress,
            },
            {
                sendParams: {
                    fee: AlgoAmount.MicroAlgos(3_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Close Partner', async () => {
        const result = await appClient.partnerChannelClose(
            {
                partnerChannel: 'Pera',
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

    test('Allowlist Remove FakeUSDC', async () => {
        const result = await appClient.assetAllowlistRemove(
            {
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

    test('Destroy Contract', async () => {
        const result = await appClient.delete.destroy(
            {},
            {
                sendParams: {
                    fee: microAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.confirmation!.poolError).toBe('');
    });
});
