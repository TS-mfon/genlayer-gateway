#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/deployment-wallet.sh"
load_deployment_env "$PROJECT_ROOT"
prepare_foundry_wallet HUB
trap cleanup_foundry_wallet EXIT
node scripts/validate-deployment-env.mjs hubOwnership
forge script contracts/script/TransferHubOwnership.s.sol:TransferHubOwnership --root contracts --rpc-url "$HUB_RPC_URL" --broadcast "${FORGE_WALLET_ARGS[@]}" -vvvv
