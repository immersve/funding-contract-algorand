/* eslint-disable import/no-extraneous-dependencies */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import algosdk from 'algosdk';
import nacl from 'tweetnacl';
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
    let withdrawalAcc: algosdk.Account;

    let fakeUSDC: number;
    let newPartnerChannel: string;
    let newCardAddress: string;
    let withdrawalRequest: Uint8Array;

    beforeAll(async () => {
        await fixture.beforeEach();
        const { algod, generateAccount } = fixture.context;

        [immersve, user, user2, circle, withdrawalAcc] = await Promise.all([
            generateAccount({ initialFunds: AlgoAmount.Algos(10) }),
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

    test('Set withdrawal rounds to 0', async () => {
        // A real value would be:
        // 60 * 60 * 24 * 5 = 432_000 seconds = 5 days
        // We're using 0 seconds to allow for instant withdrawals
        const result = await appClient.setWithdrawalTimeout({ seconds: 0 });

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Set early withdrawal public key', async () => {
        const result = await appClient.setEarlyWithdrawalPubkey(
            {
                pubkey: algosdk.decodeAddress(withdrawalAcc.addr).publicKey,
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
            amount: 100_000 + (2_500 + 400 * (2 + 8 + 32)), // Asset MBR + Box Cost
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.assetAllowlistAdd(
            {
                mbr,
                asset: fakeUSDC,
                settlementAddress: immersve.addr,
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

    test('Recover Algo from Master', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        await sendTransaction(
            {
                transaction: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                    from: immersve.addr,
                    to: appAddress,
                    amount: 1_000_000,
                    suggestedParams: await algod.getTransactionParams().do(),
                }),
                from: immersve,
            },
            algod
        );

        const recover = await appClient.recoverAsset(
            {
                amount: 1_000_000,
                asset: 0,
                recipient: immersve.addr,
            },
            {
                sendParams: {
                    fee: microAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(recover.confirmation!.poolError).toBe('');
    });

    test('Recover ASA from Master', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        await sendTransaction(
            {
                transaction: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                    from: circle.addr,
                    to: appAddress,
                    assetIndex: fakeUSDC,
                    amount: 10_000_000_000,
                    suggestedParams: await algod.getTransactionParams().do(),
                }),
                from: circle,
            },
            algod
        );

        const recover = await appClient.recoverAsset(
            {
                amount: 10_000_000_000,
                asset: fakeUSDC,
                recipient: immersve.addr,
            },
            {
                sendParams: {
                    fee: microAlgos(2_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(recover.confirmation!.poolError).toBe('');
    });

    test('Create new partner', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const CHANNEL_NAME = 'Pera';

        const getMbr = await appClient.getPartnerChannelMbr(
            {
                partnerChannelName: CHANNEL_NAME,
            },
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: immersve.addr,
            to: appAddress,
            amount: getMbr.return!,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.partnerChannelCreate(
            { mbr, partnerChannelName: CHANNEL_NAME },
            { sendParams: { fee: microAlgos(5_000), populateAppCallResources: true } }
        );
        expect(result.return).toBeDefined();

        newPartnerChannel = result.return!;
    });

    test('Create new card without assets', async () => {
        const { appAddress } = await appClient.appClient.getAppReference();
        const { algod } = fixture.context;

        const getMbr = await appClient.getCardFundMbr(
            {
                asset: 0,
            },
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user2.addr,
            to: appAddress,
            amount: getMbr.return!,
            suggestedParams: await algod.getTransactionParams().do(),
        });
        const result = await appClient.cardFundCreate(
            {
                mbr,
                partnerChannel: newPartnerChannel,
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
                cardFund: newCardAddress,
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

        const getMbr = await appClient.getCardFundMbr(
            {
                asset: fakeUSDC,
            },
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user.addr,
            to: appAddress,
            amount: getMbr.return!,
            suggestedParams: await algod.getTransactionParams().do(),
        });
        const result = await appClient.cardFundCreate(
            {
                mbr,
                partnerChannel: newPartnerChannel,
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

        const getMbr = await appClient.getCardFundAssetMbr(
            {},
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        const mbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: user.addr,
            to: appAddress,
            amount: getMbr.return!,
            suggestedParams: await algod.getTransactionParams().do(),
        });

        const result = await appClient.cardFundEnableAsset(
            {
                mbr,
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
        const nextNonce = await appClient.getNextCardFundNonce(
            {
                cardFund: newCardAddress,
            },
            {
                sendParams: {
                    // fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        const result = await appClient.cardFundDebit(
            {
                cardFund: newCardAddress,
                asset: fakeUSDC,
                amount: 5_000_000,
                nonce: nextNonce.return as bigint,
                ref: 'Test Transaction REF-1234567890',
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

    test('Get CardFundData', async () => {
        const result = await appClient.getCardFundData(
            {
                cardFund: newCardAddress,
            },
            {
                sendParams: {
                    fee: microAlgos(1_000),
                    populateAppCallResources: true,
                },
            }
        );

        expect(result.return?.[0]).toBe(newPartnerChannel);
        expect(result.return?.[1]).toBe(user.addr);
        expect(result.return?.[2]).toBe(newCardAddress);
        expect(result.return?.[3]).toEqual(BigInt(1));
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
                cardFund: newCardAddress,
                newCardFundHolder: user2.addr,
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
                cardFund: newCardAddress,
                recipient: user2.addr,
                asset: fakeUSDC,
                amount: 3_000_000,
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
                cardFund: newCardAddress,
                withdrawalHash: withdrawalRequest,
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

    test('Set withdrawal rounds to 10', async () => {
        // A real value would be:
        // 60 * 60 * 24 * 5 = 432_000 seconds = 5 days
        // We're using 0 seconds to allow for instant withdrawals
        const result = await appClient.setWithdrawalTimeout({ seconds: 10 });

        expect(result.confirmation!.poolError).toBe('');
    });

    // TODO: cardWithdrawEarly test
    test('User creates another withdrawal request', async () => {
        const result = await appClient.optIn.cardFundWithdrawalRequest(
            {
                cardFund: newCardAddress,
                recipient: user2.addr,
                asset: fakeUSDC,
                amount: 2_000_000,
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

    // Early Withdrawal Test
    test('Request early withdrawal', async () => {
        // Generate the early withdrawal signature using the withdrawalAcc secret key
        const sig = nacl.sign.detached(Buffer.from(withdrawalRequest), withdrawalAcc.sk);
        const result = await appClient.cardFundWithdrawEarly(
            {
                cardFund: newCardAddress,
                withdrawalHash: withdrawalRequest,
                earlyWithdrawalSig: sig,
            },
            {
                sender: user2,
                sendParams: {
                    fee: microAlgos(2_000 + 3_000), // 3x OpUp
                    populateAppCallResources: true,
                },
            }
        );
        console.log(result.transaction?.txID());

        expect(result.confirmation!.poolError).toBe('');
    });

    test('Disable FakeUSDC for card', async () => {
        const result = await appClient.cardFundDisableAsset(
            {
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
                cardFund: newCardAddress,
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
                partnerChannel: newPartnerChannel,
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
