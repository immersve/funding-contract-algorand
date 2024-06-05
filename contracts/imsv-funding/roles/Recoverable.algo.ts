/*
 * MIT License
 *
 * Copyright (c) 2024 Algorand Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { Contract } from '@algorandfoundation/tealscript';
import { Ownable } from './Ownable.algo';

/**
 * Recoverable class, with the ability to recover assets sent to the contract by mistake.
 */
export class Recoverable extends Contract.extend(Ownable) {
    /**
     * Recover an asset sent to the contract by mistake. Only the owner can call this function.
     * @param asset Asset ID of the asset to recover. If 0, Algo will be recovered.
     * @param amount Amount of the asset to recover. If Algos, remember the minimum balance requirement.
     * @param recipient Address to send the recovered asset to.
     */
    recoverAsset(asset: AssetID, amount: uint64, recipient: Address): void {
        this.onlyOwner();

        // Send Algo or ASAs held by the master contract. These were likely sent by mistake and may only be recoverable by the owner.
        if (asset) {
            sendAssetTransfer({
                assetAmount: amount,
                assetReceiver: recipient,
                xferAsset: asset,
            });
        } else {
            sendPayment({
                amount: amount,
                receiver: recipient,
            });
        }
    }
}
