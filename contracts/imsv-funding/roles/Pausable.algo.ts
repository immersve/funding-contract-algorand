/* eslint-disable no-underscore-dangle */
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

export class Pausable extends Contract {
    programVersion = 10;

    // ============ State Variables ============
    _pauser = GlobalStateKey<Address>();

    paused = GlobalStateKey<boolean>();

    // ============ Events ============
    Pause = new EventLogger<{
      sender: Address;
    }>();

    Unpause = new EventLogger<{
      sender: Address;
    }>();

    PauserChanged = new EventLogger<{
        newAddress: Address;
    }>();

    // ============ Access Checks ============
    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    protected whenNotPaused(): void {
        assert(!this.paused.value, 'CONTRACT_PAUSED');
    }

    /**
     * @dev throws if called by any account other than the pauser
     */
    protected onlyPauser(): void {
        assert(this.txn.sender === this._pauser.value, 'SENDER_NOT_ALLOWED');
    }

    // ============ Read Only ============
    /**
     * @notice Returns current pauser
     * @return Pauser's address
     */
    pauser(): Address {
        return this._pauser.value;
    }

    // ============ External Functions ============
    /**
     * @dev called by the owner to pause, triggers stopped state
     */
    pause(): void {
        this.onlyPauser();

        this.paused.value = true;
        this.Pause.log({
          sender: this.txn.sender
        });
    }

    /**
     * @dev called by the owner to unpause, returns to normal state
     */
    unpause(): void {
        this.onlyPauser();

        this.paused.value = false;
        this.Unpause.log({
          sender: this.txn.sender
        });
    }

    /**
     * @dev update the pauser role
     */
    updatePauser(_newPauser: Address): void {
        this.onlyPauser();

        assert(_newPauser !== globals.zeroAddress);
        this._pauser.value = _newPauser;
        this.PauserChanged.log({ newAddress: this._pauser.value });
    }
}
