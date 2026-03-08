#!/bin/bash
#
# Downloads MapLibre dSYM files for App Store distribution.
# Reads the pinned version from Package.resolved and fetches the matching
# dSYM from the maplibre-native GitHub releases.
#
# Usage: ./scripts/fetch-maplibre-dsyms.sh
#
# The dSYM is cached in .maplibre-dsyms/<version>/ so repeated runs are free.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PACKAGE_RESOLVED="$PROJECT_DIR/dbv-nfc-games.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
DSYM_CACHE_DIR="$PROJECT_DIR/.maplibre-dsyms"

if [ ! -f "$PACKAGE_RESOLVED" ]; then
    echo "ERROR: Package.resolved not found at $PACKAGE_RESOLVED"
    exit 1
fi

# Read MapLibre version from Package.resolved
MAPLIBRE_VERSION=$(python3 -c "
import json, sys
with open('$PACKAGE_RESOLVED') as f:
    data = json.load(f)
for pin in data['pins']:
    if pin['identity'] == 'maplibre-gl-native-distribution':
        print(pin['state']['version'])
        sys.exit(0)
print('ERROR: maplibre-gl-native-distribution not found in Package.resolved', file=sys.stderr)
sys.exit(1)
")

echo "MapLibre version: $MAPLIBRE_VERSION"

DSYM_DIR="$DSYM_CACHE_DIR/$MAPLIBRE_VERSION"

# Check if already cached
if [ -d "$DSYM_DIR" ] && find "$DSYM_DIR" -name "*.dSYM" -maxdepth 1 | grep -q .; then
    echo "dSYM already cached:"
    find "$DSYM_DIR" -name "*.dSYM" -maxdepth 1
    exit 0
fi

# Download from GitHub releases
RELEASE_TAG="ios-v$MAPLIBRE_VERSION"
ASSET_NAME="MapLibre_ios_device.framework.dSYM.zip"
DOWNLOAD_URL="https://github.com/maplibre/maplibre-native/releases/download/$RELEASE_TAG/$ASSET_NAME"

echo "Downloading dSYM from $DOWNLOAD_URL..."
mkdir -p "$DSYM_DIR"

TEMP_ZIP=$(mktemp /tmp/maplibre-dsym-XXXXXX.zip)
trap "rm -f '$TEMP_ZIP'" EXIT

if ! curl -L -f -o "$TEMP_ZIP" "$DOWNLOAD_URL" 2>&1; then
    echo "ERROR: Failed to download dSYM. Check that release $RELEASE_TAG exists at:"
    echo "  https://github.com/maplibre/maplibre-native/releases/tag/$RELEASE_TAG"
    rm -rf "$DSYM_DIR"
    exit 1
fi

unzip -o "$TEMP_ZIP" -d "$DSYM_DIR"

# Verify extraction produced a dSYM
DSYM_COUNT=$(find "$DSYM_DIR" -name "*.dSYM" -maxdepth 1 | wc -l)
if [ "$DSYM_COUNT" -eq 0 ]; then
    echo "ERROR: No .dSYM found after extraction. Contents:"
    ls -la "$DSYM_DIR"
    exit 1
fi

echo ""
echo "dSYM cached successfully:"
find "$DSYM_DIR" -name "*.dSYM" -maxdepth 1

# Print UUID for verification
echo ""
echo "dSYM UUIDs:"
find "$DSYM_DIR" -name "*.dSYM" -maxdepth 1 -exec dwarfdump --uuid {} \;
