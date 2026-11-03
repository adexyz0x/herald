#!/usr/bin/env bash
# Sets up the Herald pilot on NEAR testnet. Every step that signs or spends asks first.
#
#   ./scripts/testnet.sh status                         what's deployed and who holds what (read-only)
#   ./scripts/testnet.sh deploy                         build Herald and deploy it to herald.testnet
#   ./scripts/testnet.sh dao you.testnet [more.testnet] create the pilot DAO with this council
#   ./scripts/testnet.sh fund 15                        send 15 test NEAR from herald.testnet to the DAO
#
# Steps sign with keys in your keychain (put there when you created the accounts). Test NEAR has
# no value, but the transactions are real and public on testnet.
set -euo pipefail

export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
HERALD="${HERALD:-herald.testnet}"
DAO_NAME="${DAO_NAME:-herald-pilot}"
DAO="$DAO_NAME.sputnik-v2.testnet"
FACTORY="sputnik-v2.testnet"
RPC="https://test.rpc.fastnear.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

confirm() {
  echo
  echo "$1"
  read -r -p "Type yes to go ahead: " answer
  [ "$answer" = "yes" ] || { echo "Stopped. Nothing was sent."; exit 1; }
}

balance() {
  curl -s "$RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" |
    python3 -c 'import json,sys; r=json.load(sys.stdin); print("not created" if "error" in r else "%.2f NEAR%s" % (int(r["result"]["amount"])/1e24, ", has a contract" if r["result"]["code_hash"] != "1"*32 else ""))'
}

case "${1:-}" in
  status)
    echo "$HERALD: $(balance "$HERALD")"
    echo "$DAO: $(balance "$DAO")"
    ;;

  deploy)
    echo "Building the Herald contract..."
    (cd "$ROOT/contract" && cargo near build non-reproducible-wasm)
    confirm "Deploy Herald to $HERALD and set it up. Storage uses about 3 test NEAR from $HERALD."
    near contract deploy "$HERALD" use-file "$ROOT/contract/target/near/herald.wasm" \
      with-init-call new json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
      network-config testnet sign-with-keychain send
    ;;

  dao)
    shift
    [ $# -ge 1 ] || { echo "Name the council: ./scripts/testnet.sh dao you.testnet [co-council.testnet ...]"; exit 1; }
    council=$(printf '"%s",' "$@")
    init=$(printf '{"config":{"name":"%s","purpose":"Herald pilot: ambassador and creator payouts on NEAR testnet","metadata":""},"policy":[%s]}' "$DAO_NAME" "${council%,}")
    args=$(printf '%s' "$init" | base64 | tr -d '\n')
    confirm "Create $DAO through $FACTORY with council: $*. $HERALD pays 6 test NEAR; what storage doesn't use stays in the DAO's treasury."
    near contract call-function as-transaction "$FACTORY" create \
      json-args "{\"name\":\"$DAO_NAME\",\"args\":\"$args\"}" \
      prepaid-gas '300.0 Tgas' attached-deposit '6 NEAR' \
      sign-as "$HERALD" network-config testnet sign-with-keychain send
    ;;

  fund)
    amount="${2:-}"
    [[ "$amount" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "Say how much: ./scripts/testnet.sh fund 15"; exit 1; }
    confirm "Send $amount test NEAR from $HERALD to the DAO treasury at $DAO."
    near tokens "$HERALD" send-near "$DAO" "${amount}NEAR" network-config testnet sign-with-keychain send
    ;;

  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
