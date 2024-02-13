import algosdk from 'algosdk';
import { ImmersveClient } from "./client/Immersve.client";
import * as algokit from '@algorandfoundation/algokit-utils';

const kmd = new algosdk.Kmd('a'.repeat(64), 'http://127.0.0.1', 4002);
const algod = new algosdk.Algodv2('a'.repeat(64), 'http://127.0.0.1', 4001);
const indexer = new algosdk.Indexer('a'.repeat(64), 'http://127.0.0.1', 8980);

// Accounts:
// 0: Admin
// 1: Depositor (user)
// 2: Circle

let walletId = '';
await kmd.listWallets().then((res) => {
    res.wallets.forEach((wallet: any) => {
        if (wallet.name === "unencrypted-default-wallet") {
            walletId = wallet.id;
        }
    });
});
let walletHandle = (await kmd.initWalletHandle(walletId, '')).wallet_handle_token;
const addresses = (await kmd.listKeys(walletHandle)).addresses;
const accounts: algosdk.Account[] = [];
for (const address of addresses) {
    accounts.push({
        addr: address,
        sk: (await kmd.exportKey(walletHandle, '', address)).private_key,
    });
}

const Immersve = new ImmersveClient({
    id: 0,
    resolveBy: 'id',
}, algod);

// Create FakeUSDC
console.log("Create FakeUSDC");
const fakeUSDC = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: accounts[0].addr,
    assetName: 'FakeUSDC',
    unitName: 'FUSDC',
    total: BigInt(2) ** BigInt(64) - BigInt(1),
    decimals: 6,
    defaultFrozen: false,
    manager: accounts[0].addr,
    reserve: accounts[0].addr,
    freeze: accounts[0].addr,
    suggestedParams: await algod.getTransactionParams().do()
}).signTxn(accounts[0].sk);
const fakeUSDCTxn = await algod.sendRawTransaction(fakeUSDC).do();
const FUSDC_ID = (await algosdk.waitForConfirmation(algod, fakeUSDCTxn.txId, 3))['asset-index'];

// OptIn and Send FUSDC
console.log("OptIn and Send FUSDC");
const optIn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: accounts[1].addr,
    to: accounts[1].addr,
    assetIndex: FUSDC_ID,
    amount: 0,
    suggestedParams: await algod.getTransactionParams().do()
}).signTxn(accounts[1].sk);
const optInTxn = await algod.sendRawTransaction(optIn).do();
await algosdk.waitForConfirmation(algod, optInTxn.txId, 3);
const optIn2 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: accounts[2].addr,
    to: accounts[2].addr,
    assetIndex: FUSDC_ID,
    amount: 0,
    suggestedParams: await algod.getTransactionParams().do()
}).signTxn(accounts[2].sk);
const optInTxn2 = await algod.sendRawTransaction(optIn2).do();
await algosdk.waitForConfirmation(algod, optInTxn2.txId, 3);
const sendFUSDC = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: accounts[0].addr,
    to: accounts[1].addr,
    assetIndex: FUSDC_ID,
    amount: 100000000,
    suggestedParams: await algod.getTransactionParams().do()
}).signTxn(accounts[0].sk);
const sendFUSDCTxn = await algod.sendRawTransaction(sendFUSDC).do();
await algosdk.waitForConfirmation(algod, sendFUSDCTxn.txId, 3);

// Deploy
console.log("Deploy");
await Immersve.create.deploy({}, {
    sender: accounts[0]
});

// Set Withdrawal Rounds
console.log("Set Withdrawal Rounds");
await Immersve.setWithdrawalRounds({
    rounds: 1
}, {
    sender: accounts[0]
});

// Fund Application Address
console.log("Fund Application Address");
await Immersve.appClient.fundAppAccount({
    sender: accounts[0],
    amount: algokit.microAlgos(100000),
});

// Create new card
console.log("Create new card");
const createCardMbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: accounts[0].addr,
    to: Immersve.appClient._appAddress,
    amount: 140900,
    suggestedParams: await algod.getTransactionParams().do()
});
const newCard = await Immersve.cardCreate({
    depositor: accounts[1].addr,
    fundingChannel: 'Pera',
    mbr: createCardMbr
}, {
    sender: accounts[0],
    sendParams: {
        populateAppCallResources: true,
        fee: algokit.microAlgos(4000),
    }
});
const newCardAddress = newCard.return;

// Allow FakeUSDC to be used
console.log("Allow FakeUSDC to be used");
const allowAssetMbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: accounts[0].addr,
    to: Immersve.appClient._appAddress,
    amount: 100000,
    suggestedParams: await algod.getTransactionParams().do()
});
await Immersve.allowAsset({
    asset: FUSDC_ID,
    mbr: allowAssetMbr
}, {
    sender: accounts[0],
    sendParams: {
        fee: algokit.microAlgos(2000),
    }
});

// Add FakeUSDC to card
console.log("Add FakeUSDC to card");
const cardAddAssetMbr = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: accounts[1].addr,
    to: Immersve.appClient._appAddress,
    amount: 100000,
    suggestedParams: await algod.getTransactionParams().do()
});
await Immersve.cardAddAsset({
    asset: FUSDC_ID,
    card: newCardAddress,
    fundingChannel: 'Pera',
    mbr: cardAddAssetMbr
}, {
    sender: accounts[1],
    sendParams: {
        fee: algokit.microAlgos(3000),
        populateAppCallResources: true,
    }
});

// Deposit FakeUSDC to card
console.log("Deposit FakeUSDC to card");
const depositFUSDCTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: accounts[1].addr,
    to: newCardAddress,
    assetIndex: FUSDC_ID,
    amount: 10000000,
    suggestedParams: await algod.getTransactionParams().do()
}).signTxn(accounts[1].sk);
await algod.sendRawTransaction(depositFUSDCTxn).do();

// Depositor spends 5 FakeUSDC, owner debits 5 FakeUSDC
console.log("Depositor spends 5 FakeUSDC, owner debits 5 FakeUSDC");
await Immersve.cardDebit({
    amount: 5000000,
    asset: FUSDC_ID,
    card: newCardAddress,
}, {
    sender: accounts[0],
    sendParams: {
        fee: algokit.microAlgos(3000),
        populateAppCallResources: true,
    }
});

// Depositor creates withdrawal request
console.log("Depositor creates withdrawal request");
const withdrawalRequest = await Immersve.optIn.cardWithdrawalRequest({
    amount: 5000000,
    asset: FUSDC_ID,
    card: newCardAddress,
    fundingChannel: 'Pera',
}, {
    sender: accounts[1],
    sendParams: {
        populateAppCallResources: true,
    }
}); 

// Settle debits
// This also progresses the withdrawal request by 1 round
console.log("Settle debits");
await Immersve.settle({
    amount: 5000000,
    asset: FUSDC_ID,
    recipient: accounts[2].addr,
}, {
    sender: accounts[0],
    sendParams: {
        fee: algokit.microAlgos(2000),
        populateAppCallResources: true,
    }
});

// Complete withdrawal request
console.log("Complete withdrawal request");
await Immersve.cardWithdraw({
    asset: FUSDC_ID,
    card: newCardAddress,
    fundingChannel: 'Pera',
    recipient: accounts[1].addr,
    withdrawal_hash: withdrawalRequest.return,
}, {
    sender: accounts[1],
    sendParams: {
        fee: algokit.microAlgos(2000),
        populateAppCallResources: true,
    }
});
