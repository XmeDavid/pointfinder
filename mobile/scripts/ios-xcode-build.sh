#!/bin/sh
set -eu

# Xcode launched from Finder does not inherit the terminal's toolchain PATH.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
PF_MOBILE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PF_MOBILE_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: Bun is unavailable. Install Bun and run bun install at the PointFinder repository root." >&2
  exit 1
fi

exec bun tauri ios xcode-script "$@"
