/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import { AlgorandSubscriber } from '@algorandfoundation/algokit-subscriber';
import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { BalanceChangeRole, SubscribedTransaction } from '@algorandfoundation/algokit-subscriber/types/subscription';
import appSpec from '../dist/Master.arc32.json';

const algod = algokit.getAlgoClient(algokit.getDefaultLocalNetConfig('algod'));
const indexer = algokit.getAlgoIndexerClient(algokit.getDefaultLocalNetConfig('indexer'));
let lastRound = 0;

/**
 * Check if an address is a card funds address.
 * In prod this will check against a cached list of addresses and DynamoDB
 */
function isCardFundsAddress(address: string) {
    return !!address;
}

/**
 * Check if this is an asset supported by Immersve
 */
function isSupportedAsset(assetId: number) {
    return !!assetId;
}

const subscriber = new AlgorandSubscriber(
    {
        filters: [
            // Subscribe to every time an account receives at least 1 asset
            {
                name: 'assetReceive',
                filter: {
                    type: algosdk.TransactionType.axfer,
                    balanceChanges: [
                        {
                            role: [BalanceChangeRole.Receiver, BalanceChangeRole.CloseTo],
                            minAmount: 1,
                        },
                    ],
                },
            },
            // Subscribe to every event in the master contract
            {
                name: 'masterEvent',
                filter: {
                    type: algosdk.TransactionType.appl,
                    arc28Events: appSpec.contract.events.map((e) => {
                        return { groupName: 'master', eventName: e.name };
                    }),
                },
            },
        ],
        arc28Events: [{ groupName: 'master', events: appSpec.contract.events }],
        // if there is downtime of this service for longer than 1000 blocks, use indexer to catch up
        syncBehaviour: 'sync-oldest',
        // this is how we save which round was last processed
        // probably want to commit to dynamodb in prod
        watermarkPersistence: {
            get: async () => lastRound,
            set: async (newWatermark: number) => {
                lastRound = newWatermark;
            },
        },
    },
    algod,
    indexer
);

function handleAssetReceive(
    assetsReceived: { [address: string]: { [asset: number]: bigint } },
    tx: SubscribedTransaction
) {
    tx.balanceChanges?.forEach((change) => {
        const { address, assetId, amount, roles } = change;
        if (!isSupportedAsset(assetId)) return;
        if (!isCardFundsAddress(address)) return;

        // Only care about assets that are received by the card funds address
        if (roles.includes(BalanceChangeRole.Sender)) return;

        assetsReceived[address] = assetsReceived[address] || {};
        assetsReceived[address][assetId] = (assetsReceived[address][assetId] || BigInt(0)) + amount;
    });
}

function handleMasterEvent(tx: SubscribedTransaction) {
    tx.arc28Events?.forEach((e) => {
        // Convert bigint to number just so we can JSON stringify it
        const args: Record<string, algosdk.ABIValue> = {};
        Object.keys(e.argsByName).forEach((key) => {
            if (typeof e.argsByName[key] === 'bigint') {
                args[key] = Number(e.argsByName[key]);
                return;
            }
            args[key] = e.argsByName[key];
        });

        console.log(`${e.eventName}: ${JSON.stringify(args, null, 2)}`);
    });
}

// Every time we poll, handle the events for that block
subscriber.onPoll((poll) => {
    const assetsReceived: { [address: string]: { [asset: number]: bigint } } = {};

    poll.subscribedTransactions.forEach((tx) => {
        if (tx.filtersMatched?.includes('assetReceive')) handleAssetReceive(assetsReceived, tx);
        if (tx.filtersMatched?.includes('masterEvent')) handleMasterEvent(tx);
    });

    console.log(`Assets received on round ${poll.currentRound}:`, assetsReceived);
});

subscriber.start();
