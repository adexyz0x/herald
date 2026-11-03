#!/usr/bin/env bash
# Sets up and runs the Herald pilot on NEAR testnet. Every step that signs or spends asks first,
# unless YES=1 is set.
#
#   ./scripts/testnet.sh status                              what exists and who holds what (read-only)
#   ./scripts/testnet.sh deploy                              build Herald and deploy it to herald.testnet
#   PAYER=a.testnet DEPOSIT=9.8 ./scripts/testnet.sh dao a.testnet b.testnet ...
#                                                            create the pilot DAO with this council
#   FROM=a.testnet ./scripts/testnet.sh fund 6               send test NEAR into the DAO treasury
#   ./scripts/testnet.sh campaign pilot/launch-week.json a.testnet
#                                                            propose a campaign from a file, as a.testnet
#   ./scripts/testnet.sh vote 0 a.testnet                    vote yes on proposal 0, as a.testnet
#
# DRY=1 prints what a step would send and stops before signing.
# Steps sign with keys in this Mac's keychain, put there when the accounts were created. Test NEAR
# has no value, but the transactions are real and public on testnet.
set -euo pipefail

export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
HERALD="${HERALD:-herald.testnet}"
DAO_NAME="${DAO_NAME:-herald-dao}"
DAO="$DAO_NAME.sputnik-v2.testnet"
FACTORY="sputnik-v2.testnet"
RPC="https://test.rpc.fastnear.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

confirm() {
  echo
  echo "$1"
  if [ "${DRY:-}" = "1" ]; then echo "Dry run: nothing was sent."; exit 0; fi
  if [ "${YES:-}" = "1" ]; then return; fi
  read -r -p "Type yes to go ahead: " answer
  [ "$answer" = "yes" ] || { echo "Stopped. Nothing was sent."; exit 1; }
}

# Read-only contract call; prints the JSON result.
rpc_view() {
  python3 - "$RPC" "$1" "$2" "${3:-{\}}" <<'EOF'
import base64, json, sys, urllib.request
rpc, account, method, args = sys.argv[1:5]
body = {"jsonrpc": "2.0", "id": 1, "method": "query", "params": {"request_type": "call_function", "finality": "final",
        "account_id": account, "method_name": method, "args_base64": base64.b64encode(args.encode()).decode()}}
r = json.load(urllib.request.urlopen(urllib.request.Request(rpc, json.dumps(body).encode(), {"Content-Type": "application/json"})))
if "error" in r or "error" in r.get("result", {}):
    sys.exit(f"{method} failed: {r.get('error') or r['result']['error']}")
print(bytes(r["result"]["result"]).decode())
EOF
}

balance() {
  curl -s "$RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" |
    python3 -c 'import json,sys; r=json.load(sys.stdin); print("not created" if "error" in r else "%.2f NEAR%s" % (int(r["result"]["amount"])/1e24, ", has a contract" if r["result"]["code_hash"] != "1"*32 else ""))'
}

case "${1:-}" in
  status)
    for account in "$HERALD" "$DAO" oliver-herald.testnet amelia-herald.testnet; do
      echo "$account: $(balance "$account")"
    done
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
    [ $# -ge 1 ] || { echo "Name the council: ./scripts/testnet.sh dao a.testnet [b.testnet ...]"; exit 1; }
    payer="${PAYER:-$HERALD}"
    deposit="${DEPOSIT:-6}"
    council=$(printf '"%s",' "$@")
    init=$(printf '{"config":{"name":"%s","purpose":"Herald pilot: ambassador and creator payouts on NEAR testnet","metadata":""},"policy":[%s]}' "$DAO_NAME" "${council%,}")
    args=$(printf '%s' "$init" | base64 | tr -d '\n')
    confirm "Create $DAO through $FACTORY with council: $*. $payer pays $deposit test NEAR; about 4.8 covers storage and the rest becomes the treasury."
    near contract call-function as-transaction "$FACTORY" create \
      json-args "{\"name\":\"$DAO_NAME\",\"args\":\"$args\"}" \
      prepaid-gas '300.0 Tgas' attached-deposit "$deposit NEAR" \
      sign-as "$payer" network-config testnet sign-with-keychain send
    ;;

  fund)
    amount="${2:-}"
    from="${FROM:-$HERALD}"
    [[ "$amount" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "Say how much: ./scripts/testnet.sh fund 6"; exit 1; }
    confirm "Send $amount test NEAR from $from to the DAO treasury at $DAO."
    near tokens "$from" send-near "$DAO" "${amount}NEAR" network-config testnet sign-with-keychain send
    ;;

  campaign)
    file="${2:-}"
    proposer="${3:-}"
    [ -f "$file" ] && [ -n "$proposer" ] || { echo "Usage: ./scripts/testnet.sh campaign pilot/launch-week.json proposer.testnet"; exit 1; }
    bond=$(rpc_view "$DAO" get_policy | python3 -c 'import json,sys; print(json.load(sys.stdin)["proposal_bond"])')
    # Build the same proposal the Council page files: one FunctionCall to Herald's create_campaign.
    proposal=$(python3 - "$file" "$HERALD" <<'EOF'
import base64, json, sys
spec = json.load(open(sys.argv[1]))
herald = sys.argv[2]
yocto = lambda near: str(round(float(near) * 1000) * 10**21)
presets = {
    "standard": dict(trusted_after=3, core_after=10, auto_limit_trusted=10, auto_limit_core=50, reviewer_limit=100, challenge_period_sec=86400),
    "fast": dict(trusted_after=2, core_after=5, auto_limit_trusted=4, auto_limit_core=8, reviewer_limit=15, challenge_period_sec=180),
}
p = presets[spec.get("rules", "standard")]
rules = {
    "trusted_after": p["trusted_after"], "core_after": p["core_after"],
    "auto_limit_trusted": yocto(p["auto_limit_trusted"]), "auto_limit_core": yocto(p["auto_limit_core"]),
    "reviewer_limit": yocto(p["reviewer_limit"]), "challenge_period_sec": p["challenge_period_sec"],
    "max_open_per_creator": 3, "slash_points": 3,
}
args = {
    "title": spec["title"], "brief_url": spec["brief_url"],
    "rate_card": [{"name": l["name"], "amount": yocto(l["near"])} for l in spec["rate_card"]],
    "reviewers": spec["reviewers"], "rules": rules,
}
names = ", ".join(l["name"] for l in spec["rate_card"])
print(json.dumps({"proposal": {
    "description": f"Launch “{spec['title']}”: {spec['budget_near']} NEAR for {names}. Brief: {spec['brief_url']}",
    "kind": {"FunctionCall": {"receiver_id": herald, "actions": [{
        "method_name": "create_campaign",
        "args": base64.b64encode(json.dumps(args).encode()).decode(),
        "deposit": yocto(spec["budget_near"]), "gas": str(150 * 10**12)}]}}}}))
EOF
)
    title=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["title"])' "$file")
    [ "${DRY:-}" = "1" ] && echo "$proposal"
    confirm "File a DAO proposal to launch \"$title\", as $proposer, with the $(python3 -c "print(int('$bond')/1e24)") NEAR bond (returned when the vote ends)."
    near contract call-function as-transaction "$DAO" add_proposal json-args "$proposal" \
      prepaid-gas '50.0 Tgas' attached-deposit "$(python3 -c "print(int('$bond')/1e24)") NEAR" \
      sign-as "$proposer" network-config testnet sign-with-keychain send
    ;;

  vote)
    id="${2:-}"
    voter="${3:-}"
    [[ "$id" =~ ^[0-9]+$ ]] && [ -n "$voter" ] || { echo "Usage: ./scripts/testnet.sh vote 0 voter.testnet"; exit 1; }
    kind=$(rpc_view "$DAO" get_proposal "{\"id\":$id}" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["kind"]))')
    confirm "Vote yes on proposal $id in $DAO, as $voter."
    near contract call-function as-transaction "$DAO" act_proposal \
      json-args "{\"id\":$id,\"action\":\"VoteApprove\",\"proposal\":$kind}" \
      prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' \
      sign-as "$voter" network-config testnet sign-with-keychain send
    ;;

  *)
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
