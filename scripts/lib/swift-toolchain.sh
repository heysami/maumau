#!/usr/bin/env bash

resolve_maumau_swift_bin() {
  if [[ -n "${MAUMAU_SWIFT_BIN:-}" ]]; then
    printf '%s\n' "${MAUMAU_SWIFT_BIN}"
    return 0
  fi

  local xcode_swift=""
  xcode_swift="$(xcrun -f swift 2>/dev/null || true)"
  if [[ -n "${xcode_swift}" && -x "${xcode_swift}" ]]; then
    printf '%s\n' "${xcode_swift}"
    return 0
  fi

  command -v swift
}

configure_maumau_swift() {
  MAUMAU_SWIFT_BIN="$(resolve_maumau_swift_bin)"
  export MAUMAU_SWIFT_BIN
}

maumau_swift_toolchain_id() {
  local version=""
  version="$("$MAUMAU_SWIFT_BIN" --version 2>/dev/null | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/ $//')"
  printf '%s|%s\n' "${MAUMAU_SWIFT_BIN}" "${version}"
}

ensure_maumau_swift_build_cache() {
  local build_root="$1"
  shift

  local stamp_path="${build_root%/}/.maumau-swift-toolchain"
  local toolchain_id=""
  toolchain_id="$(maumau_swift_toolchain_id)"
  local reset_reason=""

  if [[ -d "${build_root}" && ! -f "${stamp_path}" ]]; then
    reset_reason="existing cache missing toolchain stamp"
  elif [[ -f "${stamp_path}" ]]; then
    local cached_toolchain=""
    cached_toolchain="$(<"${stamp_path}")"
    if [[ "${cached_toolchain}" != "${toolchain_id}" ]]; then
      reset_reason="toolchain changed"
    fi
  fi

  if [[ -n "${reset_reason}" ]]; then
    printf '🧹 Resetting Swift build cache (%s)\n' "${reset_reason}"
    rm -rf "${build_root}"
    for extra_path in "$@"; do
      rm -rf "${extra_path}"
    done
  fi

  mkdir -p "${build_root}"
  printf '%s\n' "${toolchain_id}" > "${stamp_path}"
}
