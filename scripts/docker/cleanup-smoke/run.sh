#!/usr/bin/env bash
set -euo pipefail

cd /repo

export MAUMAU_STATE_DIR="/tmp/maumau-test"
export MAUMAU_CONFIG_PATH="${MAUMAU_STATE_DIR}/maumau.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${MAUMAU_STATE_DIR}/credentials"
mkdir -p "${MAUMAU_STATE_DIR}/agents/main/sessions"
echo '{}' >"${MAUMAU_CONFIG_PATH}"
echo 'creds' >"${MAUMAU_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${MAUMAU_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm maumau reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${MAUMAU_CONFIG_PATH}"
test ! -d "${MAUMAU_STATE_DIR}/credentials"
test ! -d "${MAUMAU_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${MAUMAU_STATE_DIR}/credentials"
echo '{}' >"${MAUMAU_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm maumau uninstall --state --yes --non-interactive

test ! -d "${MAUMAU_STATE_DIR}"

echo "OK"
