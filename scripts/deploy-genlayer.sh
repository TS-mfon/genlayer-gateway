#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$PROJECT_ROOT/.env.production.local"
set +a

: "${GENLAYER_SUBMITTER_ADDRESS:?GENLAYER_SUBMITTER_ADDRESS is required}"
: "${BASE_GATEWAY_ROUTER_ADDRESS:?BASE_GATEWAY_ROUTER_ADDRESS is required}"
: "${GENLAYER_PROTOCOL_OWNER_ADDRESS:?GENLAYER_PROTOCOL_OWNER_ADDRESS is required}"
: "${GENLAYER_ACCOUNT_NAME:=gateway-bradbury}"
: "${GENLAYER_ACCOUNT_PASSWORD:=${CAST_PASSWORD:-}}"
: "${GENLAYER_ACCOUNT_PASSWORD:?GENLAYER_ACCOUNT_PASSWORD or CAST_PASSWORD is required}"

genlayer network set testnet-bradbury
genlayer account use "$GENLAYER_ACCOUNT_NAME"
printf '%s\n' "$GENLAYER_ACCOUNT_PASSWORD" | genlayer deploy \
  --contract genlayer/contracts/gateway_adjudicator.py \
  --args "$GENLAYER_SUBMITTER_ADDRESS" "$BASE_GATEWAY_ROUTER_ADDRESS" "$GENLAYER_PROTOCOL_OWNER_ADDRESS"
