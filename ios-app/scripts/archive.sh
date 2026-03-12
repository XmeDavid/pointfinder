#!/bin/bash
#
# Builds an Xcode archive ready for App Store upload.
# Fetches MapLibre dSYMs, runs xcodebuild archive, then exports.
#
# Usage: ./scripts/archive.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCHEME="dbv-nfc-games"
PROJECT="$PROJECT_DIR/dbv-nfc-games.xcodeproj"
ARCHIVE_DIR="$PROJECT_DIR/build"
ARCHIVE_PATH="$ARCHIVE_DIR/$SCHEME.xcarchive"

# Step 1: Fetch MapLibre dSYMs
echo "==> Fetching MapLibre dSYMs..."
"$SCRIPT_DIR/fetch-maplibre-dsyms.sh"

# Step 2: Archive
echo ""
echo "==> Archiving $SCHEME..."
xcodebuild archive \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -archivePath "$ARCHIVE_PATH" \
    -destination "generic/platform=iOS" \
    | tail -5

# Step 3: Copy MapLibre dSYMs into the archive
# Build phases run before the archive is assembled, so we copy after xcodebuild.
DSYM_CACHE="$PROJECT_DIR/.maplibre-dsyms"
if [ -d "$DSYM_CACHE" ]; then
    find "$DSYM_CACHE" -name '*.dSYM' -maxdepth 2 -exec cp -R {} "$ARCHIVE_PATH/dSYMs/" \;
    echo "==> Copied MapLibre dSYMs into archive"
fi

# Step 4: Verify dSYMs
echo ""
echo "==> dSYMs in archive:"
ls "$ARCHIVE_PATH/dSYMs/"
echo ""
for dsym in "$ARCHIVE_PATH/dSYMs/"*.dSYM; do
    dwarfdump --uuid "$dsym"
done

echo ""
echo "==> Archive ready at: $ARCHIVE_PATH"
echo "    Open in Xcode: open \"$ARCHIVE_PATH\""
