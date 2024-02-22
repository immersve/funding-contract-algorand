/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable import/no-extraneous-dependencies */
import WebSocket from 'websocket';
import * as msgpack from 'algo-msgpack-with-bigint';
import algosdk from 'algosdk';

// eslint-disable-next-line new-cap
const client = new WebSocket.client();

function processData(connection: WebSocket.connection, data: Buffer) {
  const block = msgpack.decode(data) as any;

  (block.payset as any[])?.forEach((t: any) => {
    // decodeSignedTransaction will complain if gh is not set
    t.txn.gh = block.block.gh;
    const sTxn = algosdk.decodeSignedTransaction(algosdk.encodeObj(t));
    const sender = algosdk.encodeAddress(sTxn.txn.from.publicKey);
    console.log(sender);
  });

  connection.sendBytes(data);
}

client.on('connectFailed', (error) => {
  console.error(`Connect Error: ${error.toString()}`);
});

client.on('connect', (connection) => {
  console.log('WebSocket Client Connected');

  connection.on('error', (error) => {
    console.error(`Connection Error: ${error.toString()}`);
  });

  connection.on('close', () => {
    console.log('Connection Closed');
  });

  connection.on('message', (message) => {
    if (message.type === 'binary') {
      processData(connection, message.binaryData);
    }
  });
});

client.connect('ws://localhost:8888/filter');
