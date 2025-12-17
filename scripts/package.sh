#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/extension"
OUT_DIR="$ROOT_DIR/dist"

if [[ ! -f "$EXT_DIR/manifest.json" ]]; then
  echo "Missing $EXT_DIR/manifest.json" >&2
  exit 1
fi

VERSION="$(python3 - <<'PY'
import json, pathlib
manifest = json.loads(pathlib.Path("extension/manifest.json").read_text(encoding="utf-8"))
print(manifest.get("version", "0.0.0"))
PY
)"

NAME="zhihu-ai-summary-${VERSION}.zip"
mkdir -p "$OUT_DIR"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# Put extension files at the zip root, so users can directly "Load unpacked".
rsync -a --delete \
  --exclude ".DS_Store" \
  --exclude "*.pem" \
  --exclude "dist/" \
  --exclude ".git/" \
  "$EXT_DIR/" "$TMP_DIR/"

(
  cd "$TMP_DIR"
  /usr/bin/zip -qr "$OUT_DIR/$NAME" .
)

echo "Built: $OUT_DIR/$NAME"

