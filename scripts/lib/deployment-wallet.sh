#!/usr/bin/env bash

load_deployment_env() {
  local project_root="$1"
  if [[ -f "$project_root/.env.production.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$project_root/.env.production.local"
    set +a
  fi
  if [[ -f "$project_root/.env.attestors.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$project_root/.env.attestors.local"
    set +a
  fi
}

prepare_foundry_wallet() {
  local role="$1"
  local address_name="${role}_DEPLOYER_ADDRESS"
  local keystore_name="${role}_DEPLOYER_KEYSTORE"
  local address="${!address_name:-}"
  local keystore="${!keystore_name:-}"

  : "${address:?$address_name is required}"
  : "${keystore:?$keystore_name is required}"
  [[ -f "$keystore" ]] || { echo "$keystore_name does not exist" >&2; return 1; }

  local password_file="${DEPLOYER_PASSWORD_FILE:-}"
  if [[ -z "$password_file" ]]; then
    : "${CAST_PASSWORD:?Set CAST_PASSWORD or DEPLOYER_PASSWORD_FILE for the encrypted keystore}"
    password_file="$(mktemp)"
    chmod 600 "$password_file"
    printf '%s' "$CAST_PASSWORD" > "$password_file"
    DEPLOYMENT_TEMP_PASSWORD_FILE="$password_file"
  fi

  [[ -f "$password_file" ]] || { echo "Password file does not exist" >&2; return 1; }
  FORGE_WALLET_ARGS=(--sender "$address" --keystore "$keystore" --password-file "$password_file")
}

cleanup_foundry_wallet() {
  if [[ -n "${DEPLOYMENT_TEMP_PASSWORD_FILE:-}" ]]; then
    rm -f "$DEPLOYMENT_TEMP_PASSWORD_FILE"
  fi
}
