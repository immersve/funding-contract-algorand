/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import { AlgorandSubscriber } from '@algorandfoundation/algokit-subscriber';
import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import appSpec from '../dist/Master.arc32.json';

type TotalReceived = { [address: string]: { [asset: number]: number } };

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

/**
 * Get the total amount of each asset received for each cardFundsAddress and commit it to the DB
 */
function commitTotalReceived(totalReceived: TotalReceived) {
    Object.keys(totalReceived).forEach((cardFundsAddress) => {
        Object.keys(totalReceived[cardFundsAddress]).forEach((asset) => {
            const amount = totalReceived[cardFundsAddress][Number(asset)];

            // In prod this will commit the amount to DynamoDB
            console.log(`${cardFundsAddress} received ${amount} of asset ${asset} to address`);
        });
    });
}

const subscriber = new AlgorandSubscriber(
    {
        events: [
            // Subscribe to every asset transfer
            // The filtering will be done in the event handler
            // {
            //     eventName: 'assetTransfers',
            //     filter: {
            //         type: algosdk.TransactionType.axfer,
            //     },
            // },

            // Subscribe to every event in the master contract
            {
                eventName: 'Master Event',
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
        syncBehaviour: 'catchup-with-indexer',
        // this is how we save which round was last processed
        // probably want to commit to dynamodb in prod
        watermarkPersistence: {
            get: async () => lastRound,
            set: async (newWatermark) => {
                lastRound = newWatermark;
            },
        },
    },
    algod,
    indexer
);

subscriber.onBatch('assetTransfers', (events) => {
    // This is the total amount of each asset received for each cardFundsAddress
    const totalReceived: TotalReceived = {};

    const addReceived = (address: string, asset: number, amount: number) => {
        if (!totalReceived[address]) totalReceived[address] = {};
        if (!totalReceived[address][asset]) totalReceived[address][asset] = 0;

        totalReceived[address][asset] += amount;
    };

    events.forEach((event) => {
        const axfer = event['asset-transfer-transaction']!;

        const asset = axfer['asset-id'];
        if (!isSupportedAsset(asset)) return;

        const amount = axfer?.amount;
        const receiver = axfer?.receiver;

        if (amount && isCardFundsAddress(receiver)) addReceived(receiver, asset, amount);

        const closeAmount = axfer['close-amount'];
        const closeTo = axfer['close-to'];

        if (closeAmount && isCardFundsAddress(closeTo!)) addReceived(closeTo!, asset, closeAmount);
    });

    commitTotalReceived(totalReceived);
});

subscriber.onBatch('Master Event', (events) => {
    events.forEach((event) => {
        event.arc28Events?.forEach((e) => {
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
    });
});

console.log();
subscriber.start();
