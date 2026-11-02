#!/usr/bin/env bash
# Re-downloads the two Sputnik DAO builds the integration tests run against,
# straight from the live accounts, and prints their hashes.
set -euo pipefail
cd "$(dirname "$0")/../contract/tests/res"

fetch() {
  local rpc="$1" account="$2" out="$3"
  curl -s "$rpc" -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": \"fetch\", \"method\": \"query\",
    \"params\": {\"request_type\": \"view_code\", \"finality\": \"final\", \"account_id\": \"$account\"}
  }" | python3 -c 'import json,sys,base64; r=json.load(sys.stdin)["result"]; sys.stdout.buffer.write(base64.b64decode(r["code_base64"])); print(r["hash"], file=sys.stderr)' > "$out"
}

fetch https://rpc.mainnet.near.org treasury-team.sputnik-dao.near sputnikdao2-mainnet.wasm
fetch https://rpc.testnet.near.org zf-chat-room.sputnik-v2.testnet sputnikdao2-testnet.wasm
shasum -a 256 sputnikdao2-*.wasm
