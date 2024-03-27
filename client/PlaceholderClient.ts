/* eslint-disable */
/**
 * This file was automatically generated by @algorandfoundation/algokit-client-generator.
 * DO NOT MODIFY IT BY HAND.
 * requires: @algorandfoundation/algokit-utils: ^2
 */
import * as algokit from '@algorandfoundation/algokit-utils'
import type {
  ABIAppCallArg,
  AppCallTransactionResult,
  AppCallTransactionResultOfType,
  AppCompilationResult,
  AppReference,
  AppState,
  AppStorageSchema,
  CoreAppCallArgs,
  RawAppCallArgs,
  TealTemplateParams,
} from '@algorandfoundation/algokit-utils/types/app'
import type {
  AppClientCallCoreParams,
  AppClientCompilationParams,
  AppClientDeployCoreParams,
  AppDetails,
  ApplicationClient,
} from '@algorandfoundation/algokit-utils/types/app-client'
import type { AppSpec } from '@algorandfoundation/algokit-utils/types/app-spec'
import type { SendTransactionResult, TransactionToSign, SendTransactionFrom, SendTransactionParams } from '@algorandfoundation/algokit-utils/types/transaction'
import type { ABIResult, TransactionWithSigner } from 'algosdk'
import { Algodv2, OnApplicationComplete, Transaction, AtomicTransactionComposer, modelsv2 } from 'algosdk'
export const APP_SPEC: AppSpec = {
  "hints": {
    "owner()address": {
      "call_config": {
        "no_op": "CALL"
      }
    },
    "transferOwnership(address)void": {
      "call_config": {
        "no_op": "CALL"
      }
    },
    "deploy()void": {
      "call_config": {
        "no_op": "CREATE"
      }
    },
    "update()void": {
      "call_config": {
        "update_application": "CALL"
      }
    },
    "destroy()void": {
      "call_config": {
        "delete_application": "CALL"
      }
    }
  },
  "bare_call_config": {
    "no_op": "NEVER",
    "opt_in": "NEVER",
    "close_out": "NEVER",
    "update_application": "NEVER",
    "delete_application": "NEVER"
  },
  "schema": {
    "local": {
      "declared": {},
      "reserved": {}
    },
    "global": {
      "declared": {
        "_owner": {
          "type": "bytes",
          "key": "_owner"
        }
      },
      "reserved": {}
    }
  },
  "state": {
    "global": {
      "num_byte_slices": 1,
      "num_uints": 0
    },
    "local": {
      "num_byte_slices": 0,
      "num_uints": 0
    }
  },
  "source": {
    "approval": "I3ByYWdtYSB2ZXJzaW9uIDEwCgovLyBUaGlzIFRFQUwgd2FzIGdlbmVyYXRlZCBieSBURUFMU2NyaXB0IHYwLjg4LjEKLy8gaHR0cHM6Ly9naXRodWIuY29tL2FsZ29yYW5kZm91bmRhdGlvbi9URUFMU2NyaXB0CgovLyBUaGlzIGNvbnRyYWN0IGlzIGNvbXBsaWFudCB3aXRoIGFuZC9vciBpbXBsZW1lbnRzIHRoZSBmb2xsb3dpbmcgQVJDczogWyBBUkM0IF0KCi8vIFRoZSBmb2xsb3dpbmcgdGVuIGxpbmVzIG9mIFRFQUwgaGFuZGxlIGluaXRpYWwgcHJvZ3JhbSBmbG93Ci8vIFRoaXMgcGF0dGVybiBpcyB1c2VkIHRvIG1ha2UgaXQgZWFzeSBmb3IgYW55b25lIHRvIHBhcnNlIHRoZSBzdGFydCBvZiB0aGUgcHJvZ3JhbSBhbmQgZGV0ZXJtaW5lIGlmIGEgc3BlY2lmaWMgYWN0aW9uIGlzIGFsbG93ZWQKLy8gSGVyZSwgYWN0aW9uIHJlZmVycyB0byB0aGUgT25Db21wbGV0ZSBpbiBjb21iaW5hdGlvbiB3aXRoIHdoZXRoZXIgdGhlIGFwcCBpcyBiZWluZyBjcmVhdGVkIG9yIGNhbGxlZAovLyBFdmVyeSBwb3NzaWJsZSBhY3Rpb24gZm9yIHRoaXMgY29udHJhY3QgaXMgcmVwcmVzZW50ZWQgaW4gdGhlIHN3aXRjaCBzdGF0ZW1lbnQKLy8gSWYgdGhlIGFjdGlvbiBpcyBub3QgaW1wbGVtZW50ZWQgaW4gdGhlIGNvbnRyYWN0LCBpdHMgcmVzcGVjdGl2ZSBicmFuY2ggd2lsbCBiZSAiKk5PVF9JTVBMRU1FTlRFRCIgd2hpY2gganVzdCBjb250YWlucyAiZXJyIgp0eG4gQXBwbGljYXRpb25JRAohCmludCA2CioKdHhuIE9uQ29tcGxldGlvbgorCnN3aXRjaCAqY2FsbF9Ob09wICpOT1RfSU1QTEVNRU5URUQgKk5PVF9JTVBMRU1FTlRFRCAqTk9UX0lNUExFTUVOVEVEICpjYWxsX1VwZGF0ZUFwcGxpY2F0aW9uICpjYWxsX0RlbGV0ZUFwcGxpY2F0aW9uICpjcmVhdGVfTm9PcCAqTk9UX0lNUExFTUVOVEVEICpOT1RfSU1QTEVNRU5URUQgKk5PVF9JTVBMRU1FTlRFRCAqTk9UX0lNUExFTUVOVEVEICpOT1RfSU1QTEVNRU5URUQKCipOT1RfSU1QTEVNRU5URUQ6CgllcnIKCi8vIG9ubHlPd25lcigpOiB2b2lkCi8vCi8vIEFzc2VydCB0aGUgdHJhbnNhY3Rpb24gc2VuZGVyIGlzIHRoZSBvd25lciBvZiB0aGUgY29udHJhY3QuCm9ubHlPd25lcjoKCXByb3RvIDAgMAoKCS8vIHNyYy9yb2xlcy9Pd25hYmxlLmFsZ28udHM6NTMKCS8vIGFzc2VydCh0aGlzLnR4bi5zZW5kZXIgPT09IHRoaXMuX293bmVyLnZhbHVlKQoJdHhuIFNlbmRlcgoJYnl0ZSAweDVmNmY3NzZlNjU3MiAvLyAiX293bmVyIgoJYXBwX2dsb2JhbF9nZXQKCT09Cglhc3NlcnQKCXJldHN1YgoKLy8gaXNPd25lcigpOiBib29sZWFuCi8vCi8vIENoZWNrcyBpZiB0aGUgY3VycmVudCB0cmFuc2FjdGlvbiBzZW5kZXIgaXMgdGhlIG93bmVyLgovLyBAcmV0dXJucyBib29sZWFuIFRydWUgaWYgdGhlIHNlbmRlciBpcyB0aGUgb3duZXIsIGZhbHNlIG90aGVyd2lzZS4KaXNPd25lcjoKCXByb3RvIDAgMQoKCS8vIHNyYy9yb2xlcy9Pd25hYmxlLmFsZ28udHM6NjEKCS8vIHJldHVybiB0aGlzLnR4bi5zZW5kZXIgPT09IHRoaXMuX293bmVyLnZhbHVlOwoJdHhuIFNlbmRlcgoJYnl0ZSAweDVmNmY3NzZlNjU3MiAvLyAiX293bmVyIgoJYXBwX2dsb2JhbF9nZXQKCT09CglyZXRzdWIKCi8vIG93bmVyKClhZGRyZXNzCiphYmlfcm91dGVfb3duZXI6CgkvLyBUaGUgQUJJIHJldHVybiBwcmVmaXgKCWJ5dGUgMHgxNTFmN2M3NQoKCS8vIGV4ZWN1dGUgb3duZXIoKWFkZHJlc3MKCWNhbGxzdWIgb3duZXIKCWNvbmNhdAoJbG9nCglpbnQgMQoJcmV0dXJuCgovLyBvd25lcigpOiBBZGRyZXNzCm93bmVyOgoJcHJvdG8gMCAxCgoJLy8gc3JjL3JvbGVzL093bmFibGUuYWxnby50czo2NwoJLy8gcmV0dXJuIHRoaXMuX293bmVyLnZhbHVlOwoJYnl0ZSAweDVmNmY3NzZlNjU3MiAvLyAiX293bmVyIgoJYXBwX2dsb2JhbF9nZXQKCXJldHN1YgoKLy8gX3RyYW5zZmVyT3duZXJzaGlwKG5ld093bmVyOiBBZGRyZXNzKTogdm9pZAovLwovLyBUcmFuc2ZlcnMgdGhlIG93bmVyc2hpcCBvZiB0aGUgY29udHJhY3QgdG8gYSBuZXcgb3duZXIuCi8vIEBwYXJhbSBuZXdPd25lciBUaGUgYWRkcmVzcyBvZiB0aGUgbmV3IG93bmVyLgpfdHJhbnNmZXJPd25lcnNoaXA6Cglwcm90byAxIDAKCgkvLyBQdXNoIGVtcHR5IGJ5dGVzIGFmdGVyIHRoZSBmcmFtZSBwb2ludGVyIHRvIHJlc2VydmUgc3BhY2UgZm9yIGxvY2FsIHZhcmlhYmxlcwoJYnl0ZSAweAoKCS8vIHNyYy9yb2xlcy9Pd25hYmxlLmFsZ28udHM6NzYKCS8vIHByZXZpb3VzT3duZXIgPSB0aGlzLl9vd25lci5leGlzdHMgPyB0aGlzLl9vd25lci52YWx1ZSA6IGdsb2JhbHMuemVyb0FkZHJlc3MKCXR4bmEgQXBwbGljYXRpb25zIDAKCWJ5dGUgMHg1ZjZmNzc2ZTY1NzIgLy8gIl9vd25lciIKCWFwcF9nbG9iYWxfZ2V0X2V4Cglzd2FwCglwb3AKCWJ6ICp0ZXJuYXJ5MV9mYWxzZQoJYnl0ZSAweDVmNmY3NzZlNjU3MiAvLyAiX293bmVyIgoJYXBwX2dsb2JhbF9nZXQKCWIgKnRlcm5hcnkxX2VuZAoKKnRlcm5hcnkxX2ZhbHNlOgoJZ2xvYmFsIFplcm9BZGRyZXNzCgoqdGVybmFyeTFfZW5kOgoJZnJhbWVfYnVyeSAwIC8vIHByZXZpb3VzT3duZXI6IGFkZHJlc3MKCgkvLyBzcmMvcm9sZXMvT3duYWJsZS5hbGdvLnRzOjc3CgkvLyB0aGlzLl9vd25lci52YWx1ZSA9IG5ld093bmVyCglieXRlIDB4NWY2Zjc3NmU2NTcyIC8vICJfb3duZXIiCglmcmFtZV9kaWcgLTEgLy8gbmV3T3duZXI6IEFkZHJlc3MKCWFwcF9nbG9iYWxfcHV0CgoJLy8gc3JjL3JvbGVzL093bmFibGUuYWxnby50czo3OQoJLy8gdGhpcy5Pd25lcnNoaXBUcmFuc2ZlcnJlZC5sb2coewoJLy8gICAgICAgICAgICAgcHJldmlvdXNPd25lcjogcHJldmlvdXNPd25lciwKCS8vICAgICAgICAgICAgIG5ld093bmVyOiBuZXdPd25lciwKCS8vICAgICAgICAgfSkKCWJ5dGUgMHg5YTIyM2VmYiAvLyBPd25lcnNoaXBUcmFuc2ZlcnJlZChhZGRyZXNzLGFkZHJlc3MpCglmcmFtZV9kaWcgMCAvLyBwcmV2aW91c093bmVyOiBhZGRyZXNzCglmcmFtZV9kaWcgLTEgLy8gbmV3T3duZXI6IEFkZHJlc3MKCWNvbmNhdAoJY29uY2F0Cglsb2cKCXJldHN1YgoKLy8gdHJhbnNmZXJPd25lcnNoaXAoYWRkcmVzcyl2b2lkCiphYmlfcm91dGVfdHJhbnNmZXJPd25lcnNoaXA6CgkvLyBuZXdPd25lcjogYWRkcmVzcwoJdHhuYSBBcHBsaWNhdGlvbkFyZ3MgMQoJZHVwCglsZW4KCWludCAzMgoJPT0KCWFzc2VydAoKCS8vIGV4ZWN1dGUgdHJhbnNmZXJPd25lcnNoaXAoYWRkcmVzcyl2b2lkCgljYWxsc3ViIHRyYW5zZmVyT3duZXJzaGlwCglpbnQgMQoJcmV0dXJuCgovLyB0cmFuc2Zlck93bmVyc2hpcChuZXdPd25lcjogQWRkcmVzcyk6IHZvaWQKLy8KLy8gVHJhbnNmZXJzIHRoZSBvd25lcnNoaXAgb2YgdGhlIGNvbnRyYWN0IHRvIGEgbmV3IG93bmVyLgovLyBSZXF1aXJlcyB0aGUgY2FsbGVyIHRvIGJlIHRoZSBjdXJyZW50IG93bmVyLgovLwovLyBAcGFyYW0gbmV3T3duZXIgVGhlIGFkZHJlc3Mgb2YgdGhlIG5ldyBvd25lci4KdHJhbnNmZXJPd25lcnNoaXA6Cglwcm90byAxIDAKCgkvLyBzcmMvcm9sZXMvT3duYWJsZS5hbGdvLnRzOjkzCgkvLyBhc3NlcnQodGhpcy5pc093bmVyKCkpCgljYWxsc3ViIGlzT3duZXIKCWFzc2VydAoKCS8vIHNyYy9yb2xlcy9Pd25hYmxlLmFsZ28udHM6OTUKCS8vIHRoaXMuX3RyYW5zZmVyT3duZXJzaGlwKG5ld093bmVyKQoJZnJhbWVfZGlnIC0xIC8vIG5ld093bmVyOiBBZGRyZXNzCgljYWxsc3ViIF90cmFuc2Zlck93bmVyc2hpcAoJcmV0c3ViCgovLyBkZXBsb3koKXZvaWQKKmFiaV9yb3V0ZV9kZXBsb3k6CgkvLyBleGVjdXRlIGRlcGxveSgpdm9pZAoJY2FsbHN1YiBkZXBsb3kKCWludCAxCglyZXR1cm4KCi8vIGRlcGxveSgpOiB2b2lkCmRlcGxveToKCXByb3RvIDAgMAoKCS8vIHNyYy9JbW1lcnN2ZS5hbGdvLnRzOjUyCgkvLyB0aGlzLl90cmFuc2Zlck93bmVyc2hpcCh0aGlzLnR4bi5zZW5kZXIpCgl0eG4gU2VuZGVyCgljYWxsc3ViIF90cmFuc2Zlck93bmVyc2hpcAoJcmV0c3ViCgovLyB1cGRhdGUoKXZvaWQKKmFiaV9yb3V0ZV91cGRhdGU6CgkvLyBleGVjdXRlIHVwZGF0ZSgpdm9pZAoJY2FsbHN1YiB1cGRhdGUKCWludCAxCglyZXR1cm4KCi8vIHVwZGF0ZSgpOiB2b2lkCnVwZGF0ZToKCXByb3RvIDAgMAoKCS8vIHNyYy9JbW1lcnN2ZS5hbGdvLnRzOjU3CgkvLyBhc3NlcnQodGhpcy50eG4uc2VuZGVyID09PSB0aGlzLmFwcC5jcmVhdG9yKQoJdHhuIFNlbmRlcgoJdHhuYSBBcHBsaWNhdGlvbnMgMAoJYXBwX3BhcmFtc19nZXQgQXBwQ3JlYXRvcgoJcG9wCgk9PQoJYXNzZXJ0CglyZXRzdWIKCi8vIGRlc3Ryb3koKXZvaWQKKmFiaV9yb3V0ZV9kZXN0cm95OgoJLy8gZXhlY3V0ZSBkZXN0cm95KCl2b2lkCgljYWxsc3ViIGRlc3Ryb3kKCWludCAxCglyZXR1cm4KCi8vIGRlc3Ryb3koKTogdm9pZApkZXN0cm95OgoJcHJvdG8gMCAwCgoJLy8gc3JjL0ltbWVyc3ZlLmFsZ28udHM6NjIKCS8vIGFzc2VydCh0aGlzLnR4bi5zZW5kZXIgPT09IHRoaXMuYXBwLmNyZWF0b3IpCgl0eG4gU2VuZGVyCgl0eG5hIEFwcGxpY2F0aW9ucyAwCglhcHBfcGFyYW1zX2dldCBBcHBDcmVhdG9yCglwb3AKCT09Cglhc3NlcnQKCXJldHN1YgoKKmNyZWF0ZV9Ob09wOgoJbWV0aG9kICJkZXBsb3koKXZvaWQiCgl0eG5hIEFwcGxpY2F0aW9uQXJncyAwCgltYXRjaCAqYWJpX3JvdXRlX2RlcGxveQoJZXJyCgoqY2FsbF9Ob09wOgoJbWV0aG9kICJvd25lcigpYWRkcmVzcyIKCW1ldGhvZCAidHJhbnNmZXJPd25lcnNoaXAoYWRkcmVzcyl2b2lkIgoJdHhuYSBBcHBsaWNhdGlvbkFyZ3MgMAoJbWF0Y2ggKmFiaV9yb3V0ZV9vd25lciAqYWJpX3JvdXRlX3RyYW5zZmVyT3duZXJzaGlwCgllcnIKCipjYWxsX1VwZGF0ZUFwcGxpY2F0aW9uOgoJbWV0aG9kICJ1cGRhdGUoKXZvaWQiCgl0eG5hIEFwcGxpY2F0aW9uQXJncyAwCgltYXRjaCAqYWJpX3JvdXRlX3VwZGF0ZQoJZXJyCgoqY2FsbF9EZWxldGVBcHBsaWNhdGlvbjoKCW1ldGhvZCAiZGVzdHJveSgpdm9pZCIKCXR4bmEgQXBwbGljYXRpb25BcmdzIDAKCW1hdGNoICphYmlfcm91dGVfZGVzdHJveQoJZXJy",
    "clear": "I3ByYWdtYSB2ZXJzaW9uIDEw"
  },
  "contract": {
    "name": "Placeholder",
    "desc": "",
    "methods": [
      {
        "name": "owner",
        "readonly": true,
        "args": [],
        "returns": {
          "type": "address"
        }
      },
      {
        "name": "transferOwnership",
        "desc": "Transfers the ownership of the contract to a new owner.Requires the caller to be the current owner.",
        "args": [
          {
            "name": "newOwner",
            "type": "address",
            "desc": "The address of the new owner."
          }
        ],
        "returns": {
          "type": "void"
        }
      },
      {
        "name": "deploy",
        "args": [],
        "returns": {
          "type": "void"
        }
      },
      {
        "name": "update",
        "args": [],
        "returns": {
          "type": "void"
        }
      },
      {
        "name": "destroy",
        "args": [],
        "returns": {
          "type": "void"
        }
      }
    ],
    "events": [
      {
        "name": "OwnershipTransferred",
        "args": [
          {
            "name": "previousOwner",
            "type": "address",
            "desc": "Previous owner address"
          },
          {
            "name": "newOwner",
            "type": "address",
            "desc": "New owner address"
          }
        ],
        "desc": "Event emitted when ownership of the contract is transferred."
      }
    ]
  }
}

/**
 * Defines an onCompletionAction of 'no_op'
 */
export type OnCompleteNoOp =  { onCompleteAction?: 'no_op' | OnApplicationComplete.NoOpOC }
/**
 * Defines an onCompletionAction of 'opt_in'
 */
export type OnCompleteOptIn =  { onCompleteAction: 'opt_in' | OnApplicationComplete.OptInOC }
/**
 * Defines an onCompletionAction of 'close_out'
 */
export type OnCompleteCloseOut =  { onCompleteAction: 'close_out' | OnApplicationComplete.CloseOutOC }
/**
 * Defines an onCompletionAction of 'delete_application'
 */
export type OnCompleteDelApp =  { onCompleteAction: 'delete_application' | OnApplicationComplete.DeleteApplicationOC }
/**
 * Defines an onCompletionAction of 'update_application'
 */
export type OnCompleteUpdApp =  { onCompleteAction: 'update_application' | OnApplicationComplete.UpdateApplicationOC }
/**
 * A state record containing a single unsigned integer
 */
export type IntegerState = {
  /**
   * Gets the state value as a BigInt.
   */
  asBigInt(): bigint
  /**
   * Gets the state value as a number.
   */
  asNumber(): number
}
/**
 * A state record containing binary data
 */
export type BinaryState = {
  /**
   * Gets the state value as a Uint8Array
   */
  asByteArray(): Uint8Array
  /**
   * Gets the state value as a string
   */
  asString(): string
}

export type AppCreateCallTransactionResult = AppCallTransactionResult & Partial<AppCompilationResult> & AppReference
export type AppUpdateCallTransactionResult = AppCallTransactionResult & Partial<AppCompilationResult>

export type AppClientComposeCallCoreParams = Omit<AppClientCallCoreParams, 'sendParams'> & {
  sendParams?: Omit<SendTransactionParams, 'skipSending' | 'atc' | 'skipWaiting' | 'maxRoundsToWaitForConfirmation' | 'populateAppCallResources'>
}
export type AppClientComposeExecuteParams = Pick<SendTransactionParams, 'skipWaiting' | 'maxRoundsToWaitForConfirmation' | 'populateAppCallResources' | 'suppressLog'>

export type IncludeSchema = {
  /**
   * Any overrides for the storage schema to request for the created app; by default the schema indicated by the app spec is used.
   */
  schema?: Partial<AppStorageSchema>
}

/**
 * Defines the types of available calls and state of the Placeholder smart contract.
 */
export type Placeholder = {
  /**
   * Maps method signatures / names to their argument and return types.
   */
  methods:
    & Record<'owner()address' | 'owner', {
      argsObj: {
      }
      argsTuple: []
      returns: string
    }>
    & Record<'transferOwnership(address)void' | 'transferOwnership', {
      argsObj: {
        /**
         * The address of the new owner.
         */
        newOwner: string
      }
      argsTuple: [newOwner: string]
      returns: void
    }>
    & Record<'deploy()void' | 'deploy', {
      argsObj: {
      }
      argsTuple: []
      returns: void
    }>
    & Record<'update()void' | 'update', {
      argsObj: {
      }
      argsTuple: []
      returns: void
    }>
    & Record<'destroy()void' | 'destroy', {
      argsObj: {
      }
      argsTuple: []
      returns: void
    }>
  /**
   * Defines the shape of the global and local state of the application.
   */
  state: {
    global: {
      owner?: BinaryState
    }
  }
}
/**
 * Defines the possible abi call signatures
 */
export type PlaceholderSig = keyof Placeholder['methods']
/**
 * Defines an object containing all relevant parameters for a single call to the contract. Where TSignature is undefined, a bare call is made
 */
export type TypedCallParams<TSignature extends PlaceholderSig | undefined> = {
  method: TSignature
  methodArgs: TSignature extends undefined ? undefined : Array<ABIAppCallArg | undefined>
} & AppClientCallCoreParams & CoreAppCallArgs
/**
 * Defines the arguments required for a bare call
 */
export type BareCallArgs = Omit<RawAppCallArgs, keyof CoreAppCallArgs>
/**
 * Maps a method signature from the Placeholder smart contract to the method's arguments in either tuple of struct form
 */
export type MethodArgs<TSignature extends PlaceholderSig> = Placeholder['methods'][TSignature]['argsObj' | 'argsTuple']
/**
 * Maps a method signature from the Placeholder smart contract to the method's return type
 */
export type MethodReturn<TSignature extends PlaceholderSig> = Placeholder['methods'][TSignature]['returns']

/**
 * A factory for available 'create' calls
 */
export type PlaceholderCreateCalls = (typeof PlaceholderCallFactory)['create']
/**
 * Defines supported create methods for this smart contract
 */
export type PlaceholderCreateCallParams =
  | (TypedCallParams<'deploy()void'> & (OnCompleteNoOp))
/**
 * A factory for available 'update' calls
 */
export type PlaceholderUpdateCalls = (typeof PlaceholderCallFactory)['update']
/**
 * Defines supported update methods for this smart contract
 */
export type PlaceholderUpdateCallParams =
  | TypedCallParams<'update()void'>
/**
 * A factory for available 'delete' calls
 */
export type PlaceholderDeleteCalls = (typeof PlaceholderCallFactory)['delete']
/**
 * Defines supported delete methods for this smart contract
 */
export type PlaceholderDeleteCallParams =
  | TypedCallParams<'destroy()void'>
/**
 * Defines arguments required for the deploy method.
 */
export type PlaceholderDeployArgs = {
  deployTimeParams?: TealTemplateParams
  /**
   * A delegate which takes a create call factory and returns the create call params for this smart contract
   */
  createCall?: (callFactory: PlaceholderCreateCalls) => PlaceholderCreateCallParams
  /**
   * A delegate which takes a update call factory and returns the update call params for this smart contract
   */
  updateCall?: (callFactory: PlaceholderUpdateCalls) => PlaceholderUpdateCallParams
  /**
   * A delegate which takes a delete call factory and returns the delete call params for this smart contract
   */
  deleteCall?: (callFactory: PlaceholderDeleteCalls) => PlaceholderDeleteCallParams
}


/**
 * Exposes methods for constructing all available smart contract calls
 */
export abstract class PlaceholderCallFactory {
  /**
   * Gets available create call factories
   */
  static get create() {
    return {
      /**
       * Constructs a create call for the Placeholder smart contract using the deploy()void ABI method
       *
       * @param args Any args for the contract call
       * @param params Any additional parameters for the call
       * @returns A TypedCallParams object for the call
       */
      deploy(args: MethodArgs<'deploy()void'>, params: AppClientCallCoreParams & CoreAppCallArgs & AppClientCompilationParams & (OnCompleteNoOp) = {}) {
        return {
          method: 'deploy()void' as const,
          methodArgs: Array.isArray(args) ? args : [],
          ...params,
        }
      },
    }
  }

  /**
   * Gets available update call factories
   */
  static get update() {
    return {
      /**
       * Constructs an update call for the Placeholder smart contract using the update()void ABI method
       *
       * @param args Any args for the contract call
       * @param params Any additional parameters for the call
       * @returns A TypedCallParams object for the call
       */
      update(args: MethodArgs<'update()void'>, params: AppClientCallCoreParams & CoreAppCallArgs & AppClientCompilationParams = {}) {
        return {
          method: 'update()void' as const,
          methodArgs: Array.isArray(args) ? args : [],
          ...params,
        }
      },
    }
  }

  /**
   * Gets available delete call factories
   */
  static get delete() {
    return {
      /**
       * Constructs a delete call for the Placeholder smart contract using the destroy()void ABI method
       *
       * @param args Any args for the contract call
       * @param params Any additional parameters for the call
       * @returns A TypedCallParams object for the call
       */
      destroy(args: MethodArgs<'destroy()void'>, params: AppClientCallCoreParams & CoreAppCallArgs = {}) {
        return {
          method: 'destroy()void' as const,
          methodArgs: Array.isArray(args) ? args : [],
          ...params,
        }
      },
    }
  }

  /**
   * Constructs a no op call for the owner()address ABI method
   *
   * @param args Any args for the contract call
   * @param params Any additional parameters for the call
   * @returns A TypedCallParams object for the call
   */
  static owner(args: MethodArgs<'owner()address'>, params: AppClientCallCoreParams & CoreAppCallArgs) {
    return {
      method: 'owner()address' as const,
      methodArgs: Array.isArray(args) ? args : [],
      ...params,
    }
  }
  /**
   * Constructs a no op call for the transferOwnership(address)void ABI method
   *
   * Transfers the ownership of the contract to a new owner.Requires the caller to be the current owner.
   *
   * @param args Any args for the contract call
   * @param params Any additional parameters for the call
   * @returns A TypedCallParams object for the call
   */
  static transferOwnership(args: MethodArgs<'transferOwnership(address)void'>, params: AppClientCallCoreParams & CoreAppCallArgs) {
    return {
      method: 'transferOwnership(address)void' as const,
      methodArgs: Array.isArray(args) ? args : [args.newOwner],
      ...params,
    }
  }
}

/**
 * A client to make calls to the Placeholder smart contract
 */
export class PlaceholderClient {
  /**
   * The underlying `ApplicationClient` for when you want to have more flexibility
   */
  public readonly appClient: ApplicationClient

  private readonly sender: SendTransactionFrom | undefined

  /**
   * Creates a new instance of `PlaceholderClient`
   *
   * @param appDetails appDetails The details to identify the app to deploy
   * @param algod An algod client instance
   */
  constructor(appDetails: AppDetails, private algod: Algodv2) {
    this.sender = appDetails.sender
    this.appClient = algokit.getAppClient({
      ...appDetails,
      app: APP_SPEC
    }, algod)
  }

  /**
   * Checks for decode errors on the AppCallTransactionResult and maps the return value to the specified generic type
   *
   * @param result The AppCallTransactionResult to be mapped
   * @param returnValueFormatter An optional delegate to format the return value if required
   * @returns The smart contract response with an updated return value
   */
  protected mapReturnValue<TReturn, TResult extends AppCallTransactionResult = AppCallTransactionResult>(result: AppCallTransactionResult, returnValueFormatter?: (value: any) => TReturn): AppCallTransactionResultOfType<TReturn> & TResult {
    if(result.return?.decodeError) {
      throw result.return.decodeError
    }
    const returnValue = result.return?.returnValue !== undefined && returnValueFormatter !== undefined
      ? returnValueFormatter(result.return.returnValue)
      : result.return?.returnValue as TReturn | undefined
      return { ...result, return: returnValue } as AppCallTransactionResultOfType<TReturn> & TResult
  }

  /**
   * Calls the ABI method with the matching signature using an onCompletion code of NO_OP
   *
   * @param typedCallParams An object containing the method signature, args, and any other relevant parameters
   * @param returnValueFormatter An optional delegate which when provided will be used to map non-undefined return values to the target type
   * @returns The result of the smart contract call
   */
  public async call<TSignature extends keyof Placeholder['methods']>(typedCallParams: TypedCallParams<TSignature>, returnValueFormatter?: (value: any) => MethodReturn<TSignature>) {
    return this.mapReturnValue<MethodReturn<TSignature>>(await this.appClient.call(typedCallParams), returnValueFormatter)
  }

  /**
   * Idempotently deploys the Placeholder smart contract.
   *
   * @param params The arguments for the contract calls and any additional parameters for the call
   * @returns The deployment result
   */
  public deploy(params: PlaceholderDeployArgs & AppClientDeployCoreParams & IncludeSchema = {}): ReturnType<ApplicationClient['deploy']> {
    const createArgs = params.createCall?.(PlaceholderCallFactory.create)
    const updateArgs = params.updateCall?.(PlaceholderCallFactory.update)
    const deleteArgs = params.deleteCall?.(PlaceholderCallFactory.delete)
    return this.appClient.deploy({
      ...params,
      updateArgs,
      deleteArgs,
      createArgs,
      createOnCompleteAction: createArgs?.onCompleteAction,
    })
  }

  /**
   * Gets available create methods
   */
  public get create() {
    const $this = this
    return {
      /**
       * Creates a new instance of the Placeholder smart contract using the deploy()void ABI method.
       *
       * @param args The arguments for the smart contract call
       * @param params Any additional parameters for the call
       * @returns The create result
       */
      async deploy(args: MethodArgs<'deploy()void'>, params: AppClientCallCoreParams & AppClientCompilationParams & IncludeSchema & (OnCompleteNoOp) = {}) {
        return $this.mapReturnValue<MethodReturn<'deploy()void'>, AppCreateCallTransactionResult>(await $this.appClient.create(PlaceholderCallFactory.create.deploy(args, params)))
      },
    }
  }

  /**
   * Gets available update methods
   */
  public get update() {
    const $this = this
    return {
      /**
       * Updates an existing instance of the Placeholder smart contract using the update()void ABI method.
       *
       * @param args The arguments for the smart contract call
       * @param params Any additional parameters for the call
       * @returns The update result
       */
      async update(args: MethodArgs<'update()void'>, params: AppClientCallCoreParams & AppClientCompilationParams = {}) {
        return $this.mapReturnValue<MethodReturn<'update()void'>, AppUpdateCallTransactionResult>(await $this.appClient.update(PlaceholderCallFactory.update.update(args, params)))
      },
    }
  }

  /**
   * Gets available delete methods
   */
  public get delete() {
    const $this = this
    return {
      /**
       * Deletes an existing instance of the Placeholder smart contract using the destroy()void ABI method.
       *
       * @param args The arguments for the smart contract call
       * @param params Any additional parameters for the call
       * @returns The delete result
       */
      async destroy(args: MethodArgs<'destroy()void'>, params: AppClientCallCoreParams = {}) {
        return $this.mapReturnValue<MethodReturn<'destroy()void'>>(await $this.appClient.delete(PlaceholderCallFactory.delete.destroy(args, params)))
      },
    }
  }

  /**
   * Makes a clear_state call to an existing instance of the Placeholder smart contract.
   *
   * @param args The arguments for the bare call
   * @returns The clear_state result
   */
  public clearState(args: BareCallArgs & AppClientCallCoreParams & CoreAppCallArgs = {}) {
    return this.appClient.clearState(args)
  }

  /**
   * Calls the owner()address ABI method.
   *
   * @param args The arguments for the contract call
   * @param params Any additional parameters for the call
   * @returns The result of the call
   */
  public owner(args: MethodArgs<'owner()address'>, params: AppClientCallCoreParams & CoreAppCallArgs = {}) {
    return this.call(PlaceholderCallFactory.owner(args, params))
  }

  /**
   * Calls the transferOwnership(address)void ABI method.
   *
   * Transfers the ownership of the contract to a new owner.Requires the caller to be the current owner.
   *
   * @param args The arguments for the contract call
   * @param params Any additional parameters for the call
   * @returns The result of the call
   */
  public transferOwnership(args: MethodArgs<'transferOwnership(address)void'>, params: AppClientCallCoreParams & CoreAppCallArgs = {}) {
    return this.call(PlaceholderCallFactory.transferOwnership(args, params))
  }

  /**
   * Extracts a binary state value out of an AppState dictionary
   *
   * @param state The state dictionary containing the state value
   * @param key The key of the state value
   * @returns A BinaryState instance containing the state value, or undefined if the key was not found
   */
  private static getBinaryState(state: AppState, key: string): BinaryState | undefined {
    const value = state[key]
    if (!value) return undefined
    if (!('valueRaw' in value))
      throw new Error(`Failed to parse state value for ${key}; received an int when expected a byte array`)
    return {
      asString(): string {
        return value.value
      },
      asByteArray(): Uint8Array {
        return value.valueRaw
      }
    }
  }

  /**
   * Extracts a integer state value out of an AppState dictionary
   *
   * @param state The state dictionary containing the state value
   * @param key The key of the state value
   * @returns An IntegerState instance containing the state value, or undefined if the key was not found
   */
  private static getIntegerState(state: AppState, key: string): IntegerState | undefined {
    const value = state[key]
    if (!value) return undefined
    if ('valueRaw' in value)
      throw new Error(`Failed to parse state value for ${key}; received a byte array when expected a number`)
    return {
      asBigInt() {
        return typeof value.value === 'bigint' ? value.value : BigInt(value.value)
      },
      asNumber(): number {
        return typeof value.value === 'bigint' ? Number(value.value) : value.value
      },
    }
  }

  /**
   * Returns the smart contract's global state wrapped in a strongly typed accessor with options to format the stored value
   */
  public async getGlobalState(): Promise<Placeholder['state']['global']> {
    const state = await this.appClient.getGlobalState()
    return {
      get owner() {
        return PlaceholderClient.getBinaryState(state, '_owner')
      },
    }
  }

  public compose(): PlaceholderComposer {
    const client = this
    const atc = new AtomicTransactionComposer()
    let promiseChain:Promise<unknown> = Promise.resolve()
    const resultMappers: Array<undefined | ((x: any) => any)> = []
    return {
      owner(args: MethodArgs<'owner()address'>, params?: AppClientComposeCallCoreParams & CoreAppCallArgs) {
        promiseChain = promiseChain.then(() => client.owner(args, {...params, sendParams: {...params?.sendParams, skipSending: true, atc}}))
        resultMappers.push(undefined)
        return this
      },
      transferOwnership(args: MethodArgs<'transferOwnership(address)void'>, params?: AppClientComposeCallCoreParams & CoreAppCallArgs) {
        promiseChain = promiseChain.then(() => client.transferOwnership(args, {...params, sendParams: {...params?.sendParams, skipSending: true, atc}}))
        resultMappers.push(undefined)
        return this
      },
      get update() {
        const $this = this
        return {
          update(args: MethodArgs<'update()void'>, params?: AppClientComposeCallCoreParams & AppClientCompilationParams) {
            promiseChain = promiseChain.then(() => client.update.update(args, {...params, sendParams: {...params?.sendParams, skipSending: true, atc}}))
            resultMappers.push(undefined)
            return $this
          },
        }
      },
      get delete() {
        const $this = this
        return {
          destroy(args: MethodArgs<'destroy()void'>, params?: AppClientComposeCallCoreParams) {
            promiseChain = promiseChain.then(() => client.delete.destroy(args, {...params, sendParams: {...params?.sendParams, skipSending: true, atc}}))
            resultMappers.push(undefined)
            return $this
          },
        }
      },
      clearState(args?: BareCallArgs & AppClientComposeCallCoreParams & CoreAppCallArgs) {
        promiseChain = promiseChain.then(() => client.clearState({...args, sendParams: {...args?.sendParams, skipSending: true, atc}}))
        resultMappers.push(undefined)
        return this
      },
      addTransaction(txn: TransactionWithSigner | TransactionToSign | Transaction | Promise<SendTransactionResult>, defaultSender?: SendTransactionFrom) {
        promiseChain = promiseChain.then(async () => atc.addTransaction(await algokit.getTransactionWithSigner(txn, defaultSender ?? client.sender)))
        return this
      },
      async atc() {
        await promiseChain
        return atc
      },
      async simulate(options?: SimulateOptions) {
        await promiseChain
        const result = await atc.simulate(client.algod, new modelsv2.SimulateRequest({ txnGroups: [], ...options }))
        return {
          ...result,
          returns: result.methodResults?.map((val, i) => resultMappers[i] !== undefined ? resultMappers[i]!(val.returnValue) : val.returnValue)
        }
      },
      async execute(sendParams?: AppClientComposeExecuteParams) {
        await promiseChain
        const result = await algokit.sendAtomicTransactionComposer({ atc, sendParams }, client.algod)
        return {
          ...result,
          returns: result.returns?.map((val, i) => resultMappers[i] !== undefined ? resultMappers[i]!(val.returnValue) : val.returnValue)
        }
      }
    } as unknown as PlaceholderComposer
  }
}
export type PlaceholderComposer<TReturns extends [...any[]] = []> = {
  /**
   * Calls the owner()address ABI method.
   *
   * @param args The arguments for the contract call
   * @param params Any additional parameters for the call
   * @returns The typed transaction composer so you can fluently chain multiple calls or call execute to execute all queued up transactions
   */
  owner(args: MethodArgs<'owner()address'>, params?: AppClientComposeCallCoreParams & CoreAppCallArgs): PlaceholderComposer<[...TReturns, MethodReturn<'owner()address'>]>

  /**
   * Calls the transferOwnership(address)void ABI method.
   *
   * Transfers the ownership of the contract to a new owner.Requires the caller to be the current owner.
   *
   * @param args The arguments for the contract call
   * @param params Any additional parameters for the call
   * @returns The typed transaction composer so you can fluently chain multiple calls or call execute to execute all queued up transactions
   */
  transferOwnership(args: MethodArgs<'transferOwnership(address)void'>, params?: AppClientComposeCallCoreParams & CoreAppCallArgs): PlaceholderComposer<[...TReturns, MethodReturn<'transferOwnership(address)void'>]>

  /**
   * Gets available update methods
   */
  readonly update: {
    /**
     * Updates an existing instance of the Placeholder smart contract using the update()void ABI method.
     *
     * @param args The arguments for the smart contract call
     * @param params Any additional parameters for the call
     * @returns The typed transaction composer so you can fluently chain multiple calls or call execute to execute all queued up transactions
     */
    update(args: MethodArgs<'update()void'>, params?: AppClientComposeCallCoreParams & AppClientCompilationParams): PlaceholderComposer<[...TReturns, MethodReturn<'update()void'>]>
  }

  /**
   * Gets available delete methods
   */
  readonly delete: {
    /**
     * Deletes an existing instance of the Placeholder smart contract using the destroy()void ABI method.
     *
     * @param args The arguments for the smart contract call
     * @param params Any additional parameters for the call
     * @returns The typed transaction composer so you can fluently chain multiple calls or call execute to execute all queued up transactions
     */
    destroy(args: MethodArgs<'destroy()void'>, params?: AppClientComposeCallCoreParams): PlaceholderComposer<[...TReturns, MethodReturn<'destroy()void'>]>
  }

  /**
   * Makes a clear_state call to an existing instance of the Placeholder smart contract.
   *
   * @param args The arguments for the bare call
   * @returns The typed transaction composer so you can fluently chain multiple calls or call execute to execute all queued up transactions
   */
  clearState(args?: BareCallArgs & AppClientComposeCallCoreParams & CoreAppCallArgs): PlaceholderComposer<[...TReturns, undefined]>

  /**
   * Adds a transaction to the composer
   *
   * @param txn One of: A TransactionWithSigner object (returned as is), a TransactionToSign object (signer is obtained from the signer property), a Transaction object (signer is extracted from the defaultSender parameter), an async SendTransactionResult returned by one of algokit utils helpers (signer is obtained from the defaultSender parameter)
   * @param defaultSender The default sender to be used to obtain a signer where the object provided to the transaction parameter does not include a signer.
   */
  addTransaction(txn: TransactionWithSigner | TransactionToSign | Transaction | Promise<SendTransactionResult>, defaultSender?: SendTransactionFrom): PlaceholderComposer<TReturns>
  /**
   * Returns the underlying AtomicTransactionComposer instance
   */
  atc(): Promise<AtomicTransactionComposer>
  /**
   * Simulates the transaction group and returns the result
   */
  simulate(options?: SimulateOptions): Promise<PlaceholderComposerSimulateResult<TReturns>>
  /**
   * Executes the transaction group and returns the results
   */
  execute(sendParams?: AppClientComposeExecuteParams): Promise<PlaceholderComposerResults<TReturns>>
}
export type SimulateOptions = Omit<ConstructorParameters<typeof modelsv2.SimulateRequest>[0], 'txnGroups'>
export type PlaceholderComposerSimulateResult<TReturns extends [...any[]]> = {
  returns: TReturns
  methodResults: ABIResult[]
  simulateResponse: modelsv2.SimulateResponse
}
export type PlaceholderComposerResults<TReturns extends [...any[]]> = {
  returns: TReturns
  groupId: string
  txIds: string[]
  transactions: Transaction[]
}
