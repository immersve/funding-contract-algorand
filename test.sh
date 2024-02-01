#!/usr/bin/env bash

set -ex

if [ -z "$ALGORAND_DATA" ]; then
	echo "ALGORAND_DATA environment variable is not set. Exiting."
	exit 1
fi

GOAL="goal"

ACCT1=$(${GOAL} account list | head -n 1 | tail -n 1 | awk '{print $3}' | tr -d '[\n\r]')
ACCT2=$(${GOAL} account list | head -n 2 | tail -n 1 | awk '{print $3}' | tr -d '[\n\r]')

APP_ID=$(${GOAL} app method \
	--create \
	-f ${ACCT1} \
	--method "deploy()void" \
	--approval-prog dist/Immersve.approval.teal \
	--clear-prog dist/Immersve.clear.teal \
	--global-byteslices 1 \
	--global-ints 2 \
	--local-byteslices 15 \
	--local-ints 1 \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '[\n\r]')

APP_ADDR=$(${GOAL} app info \
	--app-id ${APP_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '[\n\r]')

# Fund minimum balance requirement
${GOAL} clerk send -f ${ACCT1} -t ${APP_ADDR} -a 100000

# Set withdrawal rounds
${GOAL} app method \
	-f ${ACCT1} \
	--app-id ${APP_ID} \
	--method "setWithdrawalRounds(uint64)void" \
	--arg 5

# Create a new card, providing the owner address
${GOAL} clerk send \
	-f ${ACCT1} \
	-t ${APP_ADDR} \
	-a 140900 \
	-o mbr.txn
CARD_ADDR=$(${GOAL} app method \
	-f ${ACCT1} \
	--app-id ${APP_ID} \
	--method 'cardCreate(pay,string,address)address' \
	--arg mbr.txn \
	--arg '"Master Card"' \
	--arg \"${ACCT2}\" \
	--box "b64:ACILghwHcB9gaGvkDg56T+n/iWuorpF01uMYR4jgQ6PbNQALTWFzdGVyIENhcmQ=" \
	--fee 4000 \
	| grep 'method cardCreate(pay,string,address)address succeeded with output' \
	| awk '{print $6}' \
	| tr -d '[\n\r"]')
rm mbr.txn

# Create FakeUSDC ASA for testing
FUSDC=$(${GOAL} asset create \
	--creator ${ACCT1} \
	--name "FakeUSDC" \
	--unitname "FUSDC" \
	--total 1000000000000 \
	--decimals 6 \
	| grep 'Created asset with asset index' \
	| awk '{print $6}' \
	| tr -d '[\r\n]')

# OptIn and Send 100 FUSDC to ACCT2 (card owner)
${GOAL} asset send \
	--assetid ${FUSDC} \
	-f ${ACCT2} \
	-t ${ACCT2} \
	-a 0
${GOAL} asset send \
	--assetid ${FUSDC} \
	-f ${ACCT1} \
	-t ${ACCT2} \
	-a 100000000

# Add FakeUSDC to card account
${GOAL} clerk send \
	-f ${ACCT1} \
	-t ${APP_ADDR} \
	-a 100000 \
	-o mbr.txn
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT1} \
	--method "cardAddAsset(pay,string,account,asset)void" \
	--arg mbr.txn \
	--arg '"Master Card"' \
	--arg ${CARD_ADDR} \
	--arg ${FUSDC} \
	--fee 3000
rm mbr.txn

# Deposit 10 FUSDC from owner to card
${GOAL} asset send \
	--assetid ${FUSDC} \
	-f ${ACCT2} \
	-t ${CARD_ADDR} \
	-a 10000000

# Owner spends $5 on his card, admin debits card
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT1} \
	--method "cardDebit(account,account,asset,uint64)void" \
	--arg ${CARD_ADDR} \
	--arg ${ACCT1} \
	--arg ${FUSDC} \
	--arg 5000000 \
	--fee 2000

# Owner creates withdraw request for 1 FUSDC
WITHDRAWAL_HASH1=$(${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT2} \
	--method "cardWithdrawalRequest(string,account,asset,uint64)byte[32]" \
	--on-completion "OptIn" \
	--arg '"Master Card"' \
	--arg ${CARD_ADDR} \
	--arg ${FUSDC} \
	--arg 1000000 \
	--box "b64:ACILghwHcB9gaGvkDg56T+n/iWuorpF01uMYR4jgQ6PbNQALTWFzdGVyIENhcmQ=" \
	--fee 2000 \
	| grep 'method cardWithdrawalRequest(string,account,asset,uint64)byte\[32\] succeeded with output' \
	| awk '{print $6}' \
	| tr -d '[\n\r"]')

# Owner creates withdraw request for remaining 4 FUSDC
WITHDRAWAL_HASH2=$(${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT2} \
	--method "cardWithdrawalRequest(string,account,asset,uint64)byte[32]" \
	--arg '"Master Card"' \
	--arg ${CARD_ADDR} \
	--arg ${FUSDC} \
	--arg 4000000 \
	--box "b64:ACILghwHcB9gaGvkDg56T+n/iWuorpF01uMYR4jgQ6PbNQALTWFzdGVyIENhcmQ=" \
	--fee 2000 \
	| grep 'method cardWithdrawalRequest(string,account,asset,uint64)byte\[32\] succeeded with output' \
	| awk '{print $6}' \
	| tr -d '[\n\r"]')

echo "Wait at least 5 rounds to process withdrawals"
read -p "Press enter to continue"

# Owner withdraws 1 FUSDC
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT2} \
	--method "cardWithdraw(string,account,account,asset,byte[32])void" \
	--arg '"Master Card"' \
	--arg ${CARD_ADDR} \
	--arg ${ACCT2} \
	--arg ${FUSDC} \
	--arg \"${WITHDRAWAL_HASH1}\" \
	--box "b64:ACILghwHcB9gaGvkDg56T+n/iWuorpF01uMYR4jgQ6PbNQALTWFzdGVyIENhcmQ=" \
	--fee 2000

# Owner withdraws remaining 4 FUSDC
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT2} \
	--method "cardWithdraw(string,account,account,asset,byte[32])void" \
	--arg '"Master Card"' \
	--arg ${CARD_ADDR} \
	--arg ${ACCT2} \
	--arg ${FUSDC} \
	--arg \"${WITHDRAWAL_HASH2}\" \
	--box "b64:ACILghwHcB9gaGvkDg56T+n/iWuorpF01uMYR4jgQ6PbNQALTWFzdGVyIENhcmQ=" \
	--fee 2000

# Admin closes the card down
# First CloseOut of FUSDC
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT1} \
	--method "cardRemoveAsset(string,account,asset)void" \
	--arg '"Master Card"' \
	--arg ${CARD_ADDR} \
	--arg ${FUSDC} \
	--fee 3000
# Now close the card
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT1} \
	--method "cardClose(string,address,account)void" \
	--arg '"Master Card"' \
	--arg \"${ACCT2}\" \
	--arg ${CARD_ADDR} \
	--box "b64:ACILghwHcB9gaGvkDg56T+n/iWuorpF01uMYR4jgQ6PbNQALTWFzdGVyIENhcmQ=" \
	--fee 3000

# Destroy app. No more active cards
${GOAL} app method \
	--app-id ${APP_ID} \
	-f ${ACCT1} \
	--method "destroy()void" \
	--on-completion "DeleteApplication" \
	--fee 2000
