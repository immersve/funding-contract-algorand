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
/* eslint-disable no-underscore-dangle */
import { Contract } from '@algorandfoundation/tealscript';

export class Ownable extends Contract {
    // ========== State Variables ==========
    /**
     * Owner of the contract
     */
    _owner = GlobalStateKey<Address>();

    // ========== Events ==========
    /**
     * Event emitted when ownership of the contract is transferred.
     * @event OwnershipTransferred
     * @property {Address} previousOwner - The previous owner address.
     * @property {Address} newOwner - The new owner address.
     */
    OwnershipTransferred = new EventLogger<{
        /** Previous owner address */
        previousOwner: Address;
        /** New owner address */
        newOwner: Address;
    }>();

    // ========== Access Checks ==========
    /**
     * Assert the transaction sender is the owner of the contract.
     */
    protected onlyOwner(): void {
        assert(this.txn.sender === this._owner.value, 'SENDER_NOT_ALLOWED');
    }

    /**
     * Checks if the current transaction sender is the owner.
     * @returns boolean True if the sender is the owner, false otherwise.
     */
    protected isOwner(): boolean {
        return this.txn.sender === this._owner.value;
    }

    // ========== Read Only ==========
    @abi.readonly
    owner(): Address {
        return this._owner.value;
    }

    // ========== Internal Utils ==========
    /**
     * Transfers the ownership of the contract to a new owner.
     * @param newOwner The address of the new owner.
     */
    protected _transferOwnership(newOwner: Address): void {
        const previousOwner = this._owner.exists ? this._owner.value : globals.zeroAddress;
        this._owner.value = newOwner;

        this.OwnershipTransferred.log({
            previousOwner: previousOwner,
            newOwner: newOwner,
        });
    }

    // ========== External Functions ==========
    /**
     * Transfers the ownership of the contract to a new owner.
     * Requires the caller to be the current owner.
     *
     * @param newOwner The address of the new owner.
     */
    transferOwnership(newOwner: Address): void {
        this.onlyOwner();

        this._transferOwnership(newOwner);
    }
}
