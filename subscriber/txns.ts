/* eslint-disable no-console */
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';

async function main() {
    const algod = algokit.getAlgoClient(algokit.getDefaultLocalNetConfig('algod'));

    const aliceMnemonic =
        'bridge cross logic goose coconut melody gasp pottery leader guitar risk museum range resemble visa city traffic broom strike tree amateur cover ski above true';

    const bobMnemonic =
        'crazy indoor viable story charge citizen whisper birth coil dilemma approve special august round member panther tape lottery camp wire neutral minimum zebra above program';

    const alice = algosdk.mnemonicToSecretKey(aliceMnemonic);
    const bob = algosdk.mnemonicToSecretKey(bobMnemonic);

    const kmd = algokit.getAlgoKmdClient(algokit.getDefaultLocalNetConfig('kmd'));
    const dispenser = await algokit.getDispenserAccount(algod, kmd);

    const aliceFundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: dispenser.addr,
        to: alice.addr,
        amount: 10e6,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const dispenserSigner = algosdk.makeBasicAccountTransactionSigner(dispenser);

    const aliceFundAtc = new algosdk.AtomicTransactionComposer();

    aliceFundAtc.addTransaction({ txn: aliceFundTxn, signer: dispenserSigner });

    await algokit.sendAtomicTransactionComposer({ atc: aliceFundAtc }, algod);

    // create an asa
    const asaCreation = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        from: alice.addr,
        total: 100,
        decimals: 0,
        suggestedParams: await algod.getTransactionParams().do(),
        defaultFrozen: false,
    });

    const aliceSigner = algosdk.makeBasicAccountTransactionSigner(alice);

    const asaCreateAtc = new algosdk.AtomicTransactionComposer();
    asaCreateAtc.addTransaction({ txn: asaCreation, signer: aliceSigner });

    const createResult = await algokit.sendAtomicTransactionComposer({ atc: asaCreateAtc }, algod);

    const assetIndex = Number(createResult.confirmations![0].assetIndex);

    // transfer asa
    const asaTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: alice.addr,
        to: bob.addr,
        assetIndex,
        amount: 1,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    // fund bob
    const bobFundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: dispenser.addr,
        to: bob.addr,
        amount: 10e6,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const bobFundAtc = new algosdk.AtomicTransactionComposer();
    bobFundAtc.addTransaction({ txn: bobFundTxn, signer: dispenserSigner });
    await algokit.sendAtomicTransactionComposer({ atc: bobFundAtc }, algod);

    // // opt in
    const optIn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: bob.addr,
        to: bob.addr,
        assetIndex,
        amount: 0,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const bobSigner = algosdk.makeBasicAccountTransactionSigner(bob);

    const optInTransferAtc = new algosdk.AtomicTransactionComposer();
    optInTransferAtc.addTransaction({ txn: optIn, signer: bobSigner });
    optInTransferAtc.addTransaction({ txn: asaTransfer, signer: aliceSigner });
    await algokit.sendAtomicTransactionComposer({ atc: optInTransferAtc }, algod);

    // Alice buy back the ASA from Bob
    const alicePayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: alice.addr,
        to: bob.addr,
        amount: 1e6,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const bobTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: bob.addr,
        to: alice.addr,
        assetIndex,
        amount: 1,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const buyBackAtc = new algosdk.AtomicTransactionComposer();
    buyBackAtc.addTransaction({ txn: alicePayment, signer: aliceSigner });
    buyBackAtc.addTransaction({ txn: bobTransfer, signer: bobSigner });
    await algokit.sendAtomicTransactionComposer({ atc: buyBackAtc }, algod);

    // Reverse opt in
    // close out
    // opt out
    const optOut = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: bob.addr,
        to: alice.addr,
        assetIndex,
        amount: 0,
        suggestedParams: await algod.getTransactionParams().do(),
        closeRemainderTo: alice.addr,
    });

    const optOutAtc = new algosdk.AtomicTransactionComposer();
    optOutAtc.addTransaction({ txn: optOut, signer: bobSigner });
    await algokit.sendAtomicTransactionComposer({ atc: optOutAtc }, algod);
}
main();
