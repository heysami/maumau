#!/usr/bin/env bash
set -euo pipefail

# Build and bundle Maumau into a minimal .app we can open.
# Outputs to dist/Maumau.app

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/swift-toolchain.sh"
configure_maumau_swift
APP_ROOT="$ROOT_DIR/dist/Maumau.app"
# Keep packaging on its own SwiftPM build root so stale local `.build` artifacts
# from a different toolchain cannot poison the bundled app build.
BUILD_ROOT="${MAUMAU_MAC_PACKAGE_BUILD_ROOT:-$ROOT_DIR/apps/macos/.build-package}"
PRODUCT="Maumau"
BUNDLE_ID="${BUNDLE_ID:-ai.maumau.mac.debug}"
PKG_VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"
BUILD_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(cd "$ROOT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BUILD_NUMBER=$(cd "$ROOT_DIR" && git rev-list --count HEAD 2>/dev/null || echo "0")
APP_VERSION="${APP_VERSION:-$PKG_VERSION}"
APP_BUILD="${APP_BUILD:-}"
BUILD_CONFIG="${BUILD_CONFIG:-debug}"
if [[ -n "${BUILD_ARCHS:-}" ]]; then
  BUILD_ARCHS_VALUE="${BUILD_ARCHS}"
elif [[ "$BUILD_CONFIG" == "release" ]]; then
  # Release packaging should be universal unless explicitly overridden.
  BUILD_ARCHS_VALUE="all"
else
  BUILD_ARCHS_VALUE="$(uname -m)"
fi
if [[ "${BUILD_ARCHS_VALUE}" == "all" ]]; then
  BUILD_ARCHS_VALUE="arm64 x86_64"
fi
IFS=' ' read -r -a BUILD_ARCHS <<< "$BUILD_ARCHS_VALUE"
PRIMARY_ARCH="${BUILD_ARCHS[0]}"
SPARKLE_PUBLIC_ED_KEY="${SPARKLE_PUBLIC_ED_KEY:-AGCY8w5vHirVfGGDGc8Szc5iuOqupZSh9pMj/Qs67XI=}"
SPARKLE_FEED_URL="${SPARKLE_FEED_URL:-https://raw.githubusercontent.com/maumau/maumau/main/appcast.xml}"
AUTO_CHECKS=true
if [[ "$BUNDLE_ID" == *.debug ]]; then
  SPARKLE_FEED_URL=""
  AUTO_CHECKS=false
fi

current_macos_sdk_major() {
  local version
  version="$(xcrun --sdk macosx --show-sdk-version 2>/dev/null || true)"
  version="${version%%.*}"
  if [[ "$version" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$version"
  fi
}

run_with_node_heap() {
  local heap_mb="$1"
  shift
  local node_options="${NODE_OPTIONS:-}"
  if [[ "$node_options" != *"--max-old-space-size="* ]]; then
    node_options="${node_options:+${node_options} }--max-old-space-size=${heap_mb}"
  fi
  NODE_OPTIONS="$node_options" "$@"
}

workspace_deps_ready() {
  [[ -d "$ROOT_DIR/node_modules/.pnpm" ]] || return 1
  [[ -f "$ROOT_DIR/node_modules/typescript/bin/tsc" ]] || return 1
  [[ -e "$ROOT_DIR/node_modules/.bin/tsdown" ]] || return 1
}

has_codesigning_identity() {
  security find-identity -p codesigning -v 2>/dev/null | grep -Eq '"'
}

maybe_disable_peekaboo_bridge() {
  if [[ -n "${MAUMAU_DISABLE_PEEKABOO_BRIDGE:-}" ]]; then
    return 0
  fi

  local sdk_major
  sdk_major="$(current_macos_sdk_major)"
  if [[ "$sdk_major" =~ ^[0-9]+$ ]] && (( sdk_major >= 26 )); then
    export MAUMAU_DISABLE_PEEKABOO_BRIDGE=1
    echo "🪄 macOS SDK ${sdk_major} detected; disabling Peekaboo bridge for this build"
  fi
}

maybe_configure_swift_build_jobs() {
  if [[ -n "${SWIFT_BUILD_JOBS:-}" ]]; then
    return 0
  fi

  local sdk_major
  sdk_major="$(current_macos_sdk_major)"
  if [[ "$sdk_major" =~ ^[0-9]+$ ]] && (( sdk_major >= 26 )); then
    export SWIFT_BUILD_JOBS=1
    echo "🪄 macOS SDK ${sdk_major} detected; forcing serial Swift builds to avoid toolchain crashes"
  fi
}

maybe_use_default_swiftpm_layout() {
  if [[ -n "${USE_DEFAULT_SWIFTPM_LAYOUT:-}" ]]; then
    return 0
  fi

  local sdk_major
  sdk_major="$(current_macos_sdk_major)"
  if [[ "$sdk_major" =~ ^[0-9]+$ ]] && (( sdk_major >= 26 )) && [[ "${#BUILD_ARCHS[@]}" -eq 1 ]]; then
    export USE_DEFAULT_SWIFTPM_LAYOUT=1
    echo "🪄 macOS SDK ${sdk_major} detected; using default SwiftPM build layout for app packaging"
  fi
}

maybe_enable_adhoc_signing_for_debug() {
  if [[ -n "${SIGN_IDENTITY:-}" || -n "${ALLOW_ADHOC_SIGNING:-}" ]]; then
    return 0
  fi

  if [[ "$BUNDLE_ID" == *.debug ]] && ! has_codesigning_identity; then
    export ALLOW_ADHOC_SIGNING=1
    echo "🪄 No signing identity found for debug bundle; falling back to ad-hoc signing"
  fi
}

sparkle_canonical_build_from_version() {
  node --import tsx "$ROOT_DIR/scripts/sparkle-build.ts" canonical-build "$1"
}

swiftpm_target_triple() {
  echo "$1-apple-macosx"
}

build_path_for_arch() {
  if [[ "${USE_DEFAULT_SWIFTPM_LAYOUT:-}" == "1" ]]; then
    echo "$BUILD_ROOT/$(swiftpm_target_triple "$1")"
    return 0
  fi
  echo "$BUILD_ROOT/$1"
}

bin_for_arch() {
  echo "$(build_path_for_arch "$1")/$BUILD_CONFIG/$PRODUCT"
}

sparkle_framework_for_arch() {
  echo "$(build_path_for_arch "$1")/$BUILD_CONFIG/Sparkle.framework"
}

merge_framework_machos() {
  local primary="$1"
  local dest="$2"
  shift 2
  local others=("$@")

  archs_for() {
    /usr/bin/lipo -info "$1" | /usr/bin/sed -E 's/.*are: //; s/.*architecture: //'
  }

  arch_in_list() {
    local needle="$1"
    shift
    for item in "$@"; do
      if [[ "$item" == "$needle" ]]; then
        return 0
      fi
    done
    return 1
  }

  while IFS= read -r -d '' file; do
    if /usr/bin/file "$file" | /usr/bin/grep -q "Mach-O"; then
      local rel="${file#$primary/}"
      local primary_archs
      primary_archs=$(archs_for "$file")
      IFS=' ' read -r -a primary_arch_array <<< "$primary_archs"

      local missing_files=()
      local tmp_dir
      tmp_dir=$(mktemp -d)
      for fw in "${others[@]}"; do
        local other_file="$fw/$rel"
        if [[ ! -f "$other_file" ]]; then
          echo "ERROR: Missing $rel in $fw" >&2
          rm -rf "$tmp_dir"
          exit 1
        fi
        if /usr/bin/file "$other_file" | /usr/bin/grep -q "Mach-O"; then
          local other_archs
          other_archs=$(archs_for "$other_file")
          IFS=' ' read -r -a other_arch_array <<< "$other_archs"
          for arch in "${other_arch_array[@]}"; do
            if ! arch_in_list "$arch" "${primary_arch_array[@]}"; then
              local thin_file="$tmp_dir/$(echo "$rel" | tr '/' '_')-$arch"
              /usr/bin/lipo -thin "$arch" "$other_file" -output "$thin_file"
              missing_files+=("$thin_file")
              primary_arch_array+=("$arch")
            fi
          done
        fi
      done

      if [[ "${#missing_files[@]}" -gt 0 ]]; then
        /usr/bin/lipo -create "$file" "${missing_files[@]}" -output "$dest/$rel"
      fi
      rm -rf "$tmp_dir"
    fi
  done < <(find "$primary" -type f -print0)
}

ensure_binary_rpath() {
  local binary="$1"
  local rpath="$2"
  if /usr/bin/otool -l "$binary" | /usr/bin/grep -Fq "$rpath"; then
    return 0
  fi
  /usr/bin/install_name_tool -add_rpath "$rpath" "$binary"
}

if [[ "${SKIP_PNPM_INSTALL:-0}" != "1" ]]; then
  if [[ "${FORCE_PNPM_INSTALL:-0}" == "1" ]] || ! workspace_deps_ready; then
    echo "📦 Ensuring deps (pnpm install)"
    (cd "$ROOT_DIR" && run_with_node_heap 4096 pnpm install --no-frozen-lockfile --config.node-linker=hoisted)
  else
    echo "📦 Reusing existing deps (set FORCE_PNPM_INSTALL=1 to reinstall)"
  fi
else
  echo "📦 Skipping pnpm install (SKIP_PNPM_INSTALL=1)"
fi

echo "🧰 Using Swift toolchain: $MAUMAU_SWIFT_BIN"

maybe_disable_peekaboo_bridge
maybe_configure_swift_build_jobs
maybe_use_default_swiftpm_layout
maybe_enable_adhoc_signing_for_debug
ensure_maumau_swift_build_cache "$BUILD_ROOT" "$ROOT_DIR/apps/macos/.swiftpm"

if [[ -z "${APP_BUILD:-}" ]]; then
  APP_BUILD="$GIT_BUILD_NUMBER"
  if [[ "$APP_VERSION" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}([.-].*)?$ ]]; then
    CANONICAL_BUILD="$(sparkle_canonical_build_from_version "$APP_VERSION")" || {
      echo "ERROR: Failed to derive canonical Sparkle APP_BUILD from APP_VERSION '$APP_VERSION'." >&2
      exit 1
    }
    if [[ "$CANONICAL_BUILD" =~ ^[0-9]+$ ]] && (( CANONICAL_BUILD > APP_BUILD )); then
      APP_BUILD="$CANONICAL_BUILD"
    fi
  fi
fi

if [[ "$AUTO_CHECKS" == "true" && ! "$APP_BUILD" =~ ^[0-9]+$ ]]; then
  echo "ERROR: APP_BUILD must be numeric for Sparkle compare (CFBundleVersion). Got: $APP_BUILD" >&2
  exit 1
fi

if [[ "${SKIP_TSC:-0}" != "1" ]]; then
  echo "📦 Building JS (pnpm build)"
  (cd "$ROOT_DIR" && pnpm build)
else
  echo "📦 Skipping JS build (SKIP_TSC=1)"
fi

if [[ "${SKIP_UI_BUILD:-0}" != "1" ]]; then
  echo "🖥  Building Control UI (ui:build)"
  (cd "$ROOT_DIR" && node scripts/ui.js build)
else
  echo "🖥  Skipping Control UI build (SKIP_UI_BUILD=1)"
fi

cd "$ROOT_DIR/apps/macos"

echo "🔨 Building $PRODUCT ($BUILD_CONFIG) [${BUILD_ARCHS[*]}]"
if [[ "${SKIP_SWIFT_BUILD:-0}" == "1" ]]; then
  echo "🔨 Reusing existing Swift build products (SKIP_SWIFT_BUILD=1)"
else
  for arch in "${BUILD_ARCHS[@]}"; do
    if [[ "${USE_DEFAULT_SWIFTPM_LAYOUT:-}" == "1" ]]; then
      SWIFT_BUILD_ARGS=(-c "$BUILD_CONFIG" --product "$PRODUCT" --scratch-path "$BUILD_ROOT")
    else
      BUILD_PATH="$(build_path_for_arch "$arch")"
      SWIFT_BUILD_ARGS=(-c "$BUILD_CONFIG" --product "$PRODUCT" --build-path "$BUILD_PATH" --arch "$arch")
    fi
    if [[ -n "${SWIFT_BUILD_JOBS:-}" ]]; then
      SWIFT_BUILD_ARGS+=(--jobs "$SWIFT_BUILD_JOBS")
    fi
    SWIFT_BUILD_ARGS+=(-Xlinker -rpath -Xlinker @executable_path/../Frameworks)
    "$MAUMAU_SWIFT_BIN" build "${SWIFT_BUILD_ARGS[@]}"
  done
fi

BIN_PRIMARY="$(bin_for_arch "$PRIMARY_ARCH")"
if [[ ! -f "$BIN_PRIMARY" ]]; then
  echo "ERROR: Expected Swift build product missing at $BIN_PRIMARY" >&2
  exit 1
fi
echo "pkg: binary $BIN_PRIMARY" >&2
echo "🧹 Cleaning old app bundle"
rm -rf "$APP_ROOT"
mkdir -p "$APP_ROOT/Contents/MacOS"
mkdir -p "$APP_ROOT/Contents/Resources"
mkdir -p "$APP_ROOT/Contents/Frameworks"

echo "📄 Copying Info.plist template"
INFO_PLIST_SRC="$ROOT_DIR/apps/macos/Sources/Maumau/Resources/Info.plist"
if [ ! -f "$INFO_PLIST_SRC" ]; then
  echo "ERROR: Info.plist template missing at $INFO_PLIST_SRC" >&2
  exit 1
fi
cp "$INFO_PLIST_SRC" "$APP_ROOT/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "$APP_ROOT/Contents/Info.plist" || true
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${APP_VERSION}" "$APP_ROOT/Contents/Info.plist" || true
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${APP_BUILD}" "$APP_ROOT/Contents/Info.plist" || true
/usr/libexec/PlistBuddy -c "Set :MaumauBuildTimestamp ${BUILD_TS}" "$APP_ROOT/Contents/Info.plist" || true
/usr/libexec/PlistBuddy -c "Set :MaumauGitCommit ${GIT_COMMIT}" "$APP_ROOT/Contents/Info.plist" || true
/usr/libexec/PlistBuddy -c "Set :SUFeedURL ${SPARKLE_FEED_URL}" "$APP_ROOT/Contents/Info.plist" \
  || /usr/libexec/PlistBuddy -c "Add :SUFeedURL string ${SPARKLE_FEED_URL}" "$APP_ROOT/Contents/Info.plist" || true
/usr/libexec/PlistBuddy -c "Set :SUPublicEDKey ${SPARKLE_PUBLIC_ED_KEY}" "$APP_ROOT/Contents/Info.plist" \
  || /usr/libexec/PlistBuddy -c "Add :SUPublicEDKey string ${SPARKLE_PUBLIC_ED_KEY}" "$APP_ROOT/Contents/Info.plist" || true
if /usr/libexec/PlistBuddy -c "Set :SUEnableAutomaticChecks ${AUTO_CHECKS}" "$APP_ROOT/Contents/Info.plist"; then
  true
else
  /usr/libexec/PlistBuddy -c "Add :SUEnableAutomaticChecks bool ${AUTO_CHECKS}" "$APP_ROOT/Contents/Info.plist" || true
fi

echo "🚚 Copying binary"
cp "$BIN_PRIMARY" "$APP_ROOT/Contents/MacOS/Maumau"
if [[ "${#BUILD_ARCHS[@]}" -gt 1 ]]; then
  BIN_INPUTS=()
  for arch in "${BUILD_ARCHS[@]}"; do
    BIN_INPUTS+=("$(bin_for_arch "$arch")")
  done
  /usr/bin/lipo -create "${BIN_INPUTS[@]}" -output "$APP_ROOT/Contents/MacOS/Maumau"
fi
chmod +x "$APP_ROOT/Contents/MacOS/Maumau"
# SwiftPM outputs ad-hoc signed binaries; strip the signature before install_name_tool to avoid warnings.
/usr/bin/codesign --remove-signature "$APP_ROOT/Contents/MacOS/Maumau" 2>/dev/null || true
ensure_binary_rpath "$APP_ROOT/Contents/MacOS/Maumau" "@executable_path/../Frameworks"

SPARKLE_FRAMEWORK_PRIMARY="$(sparkle_framework_for_arch "$PRIMARY_ARCH")"
if [ -d "$SPARKLE_FRAMEWORK_PRIMARY" ]; then
  echo "✨ Embedding Sparkle.framework"
  cp -R "$SPARKLE_FRAMEWORK_PRIMARY" "$APP_ROOT/Contents/Frameworks/"
  if [[ "${#BUILD_ARCHS[@]}" -gt 1 ]]; then
    OTHER_FRAMEWORKS=()
    for arch in "${BUILD_ARCHS[@]}"; do
      if [[ "$arch" == "$PRIMARY_ARCH" ]]; then
        continue
      fi
      OTHER_FRAMEWORKS+=("$(sparkle_framework_for_arch "$arch")")
    done
    merge_framework_machos "$SPARKLE_FRAMEWORK_PRIMARY" "$APP_ROOT/Contents/Frameworks/Sparkle.framework" "${OTHER_FRAMEWORKS[@]}"
  fi
  chmod -R a+rX "$APP_ROOT/Contents/Frameworks/Sparkle.framework"
fi

echo "📦 Copying Swift 6.2 compatibility libraries"
SWIFT_COMPAT_LIB="$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2/macosx/libswiftCompatibilitySpan.dylib"
if [ -f "$SWIFT_COMPAT_LIB" ]; then
  cp "$SWIFT_COMPAT_LIB" "$APP_ROOT/Contents/Frameworks/"
  chmod +x "$APP_ROOT/Contents/Frameworks/libswiftCompatibilitySpan.dylib"
else
  echo "WARN: Swift compatibility library not found at $SWIFT_COMPAT_LIB (continuing)" >&2
fi

echo "🖼  Copying app icon"
cp "$ROOT_DIR/apps/macos/Sources/Maumau/Resources/Maumau.icns" "$APP_ROOT/Contents/Resources/Maumau.icns"

echo "📦 Copying device model resources"
rm -rf "$APP_ROOT/Contents/Resources/DeviceModels"
cp -R "$ROOT_DIR/apps/macos/Sources/Maumau/Resources/DeviceModels" "$APP_ROOT/Contents/Resources/DeviceModels"

echo "📦 Copying model catalog"
MODEL_CATALOG_SRC="$ROOT_DIR/node_modules/@mariozechner/pi-ai/dist/models.generated.js"
MODEL_CATALOG_DEST="$APP_ROOT/Contents/Resources/models.generated.js"
if [ -f "$MODEL_CATALOG_SRC" ]; then
  cp "$MODEL_CATALOG_SRC" "$MODEL_CATALOG_DEST"
else
  echo "WARN: model catalog missing at $MODEL_CATALOG_SRC (continuing)" >&2
fi

echo "📦 Copying Control UI assets"
CONTROL_UI_SRC="$ROOT_DIR/dist/control-ui"
CONTROL_UI_DEST="$APP_ROOT/Contents/Resources/control-ui"
if [ -d "$CONTROL_UI_SRC" ] && [ -f "$CONTROL_UI_SRC/index.html" ]; then
  rm -rf "$CONTROL_UI_DEST"
  cp -R "$CONTROL_UI_SRC" "$CONTROL_UI_DEST"
else
  echo "ERROR: Control UI assets missing at $CONTROL_UI_SRC. Run pnpm ui:build first." >&2
  exit 1
fi

echo "📦 Copying MaumauKit resources"
MAUMAUKIT_BUNDLE="$(build_path_for_arch "$PRIMARY_ARCH")/$BUILD_CONFIG/MaumauKit_MaumauKit.bundle"
if [ -d "$MAUMAUKIT_BUNDLE" ]; then
  rm -rf "$APP_ROOT/Contents/Resources/MaumauKit_MaumauKit.bundle"
  cp -R "$MAUMAUKIT_BUNDLE" "$APP_ROOT/Contents/Resources/MaumauKit_MaumauKit.bundle"
else
  echo "WARN: MaumauKit resource bundle not found at $MAUMAUKIT_BUNDLE (continuing)" >&2
fi

echo "📦 Copying Textual resources"
TEXTUAL_BUNDLE_DIR="$(build_path_for_arch "$PRIMARY_ARCH")/$BUILD_CONFIG"
TEXTUAL_BUNDLE=""
for candidate in \
  "$TEXTUAL_BUNDLE_DIR/textual_Textual.bundle" \
  "$TEXTUAL_BUNDLE_DIR/Textual_Textual.bundle"
do
  if [ -d "$candidate" ]; then
    TEXTUAL_BUNDLE="$candidate"
    break
  fi
done
if [ -z "$TEXTUAL_BUNDLE" ]; then
  TEXTUAL_BUNDLE="$(find "$BUILD_ROOT" -type d \( -name "textual_Textual.bundle" -o -name "Textual_Textual.bundle" \) -print -quit)"
fi
if [ -n "$TEXTUAL_BUNDLE" ] && [ -d "$TEXTUAL_BUNDLE" ]; then
  rm -rf "$APP_ROOT/Contents/Resources/$(basename "$TEXTUAL_BUNDLE")"
  cp -R "$TEXTUAL_BUNDLE" "$APP_ROOT/Contents/Resources/"
else
  if [[ "${ALLOW_MISSING_TEXTUAL_BUNDLE:-0}" == "1" ]]; then
    echo "WARN: Textual resource bundle not found (continuing due to ALLOW_MISSING_TEXTUAL_BUNDLE=1)" >&2
  else
    echo "ERROR: Textual resource bundle not found. Set ALLOW_MISSING_TEXTUAL_BUNDLE=1 to bypass." >&2
    exit 1
  fi
fi

echo "⏹  Stopping any running Maumau"
killall -q Maumau 2>/dev/null || true
if launchctl print gui/"$UID" 2>/dev/null | grep -Fq 'ai.maumau.gateway'; then
  launchctl bootout gui/"$UID"/ai.maumau.gateway 2>/dev/null || true
fi

echo "🔏 Signing bundle (auto-selects signing identity if SIGN_IDENTITY is unset)"
"$ROOT_DIR/scripts/codesign-mac-app.sh" "$APP_ROOT"

echo "✅ Bundle ready at $APP_ROOT"
