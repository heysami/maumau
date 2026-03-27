#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/swift-toolchain.sh"
configure_maumau_swift

cd "$ROOT_DIR/apps/macos"

BUILD_PATH=".build-local"
PRODUCT="Maumau"
BIN="$BUILD_PATH/debug/$PRODUCT"

printf "\n▶️  Building $PRODUCT (debug, build path: $BUILD_PATH)\n"
printf "🧰 Using Swift toolchain: %s\n" "$MAUMAU_SWIFT_BIN"
ensure_maumau_swift_build_cache "$BUILD_PATH"
"$MAUMAU_SWIFT_BIN" build -c debug --product "$PRODUCT" --build-path "$BUILD_PATH"

printf "\n⏹  Stopping existing $PRODUCT...\n"
killall -q "$PRODUCT" 2>/dev/null || true

printf "\n🚀 Launching $BIN ...\n"
nohup "$BIN" >/tmp/maumau.log 2>&1 &
PID=$!
printf "Started $PRODUCT (PID $PID). Logs: /tmp/maumau.log\n"
