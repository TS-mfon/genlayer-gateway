#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/deployment-wallet.sh"
load_deployment_env "$PROJECT_ROOT"
prepare_foundry_wallet BASE
trap cleanup_foundry_wallet EXIT
node scripts/validate-deployment-env.mjs common baseDeploy
forge script contracts/script/DeployBaseSepolia.s.sol:DeployBaseSepolia --root contracts --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast "${FORGE_WALLET_ARGS[@]}" -vvvv
