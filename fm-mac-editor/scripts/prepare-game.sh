#!/bin/bash
# One-time (and after every game update): re-signs your local copy of Football Manager 26 so macOS
# allows the editor to read and write its memory. It keeps the game's own entitlements, adds
# get-task-allow, and drops Apple's "hardened runtime" flag, which is what blocks memory access.
#
# This only changes the code signature of the copy on this Mac. Steam "Verify integrity of game files"
# undoes it; just run this script again afterwards.
set -euo pipefail

APP="${1:-}"
if [[ -z "$APP" ]]; then
  for candidate in \
    "$HOME/Library/Application Support/Steam/steamapps/common/Football Manager 26/fm.app" \
    "$HOME/Library/Application Support/Steam/steamapps/common/Football Manager 26/Football Manager 26.app" \
    "/Applications/Football Manager 26.app"; do
    if [[ -d "$candidate" ]]; then APP="$candidate"; break; fi
  done
fi
if [[ -z "$APP" ]]; then
  # Fall back to any .app inside the Steam game folder.
  APP="$(find "$HOME/Library/Application Support/Steam/steamapps/common/Football Manager 26" -maxdepth 2 -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "Couldn't find Football Manager 26. Pass the .app path:" >&2
  echo "  ./scripts/prepare-game.sh \"/path/to/Football Manager 26.app\"" >&2
  echo "(In Steam: right-click the game > Manage > Browse local files.)" >&2
  exit 1
fi

if pgrep -f "$APP/Contents/MacOS" >/dev/null; then
  echo "Quit Football Manager first." >&2
  exit 1
fi

echo "Game: $APP"
WORK="$(mktemp -d)"
ENT="$WORK/game.entitlements"

# Keep whatever the game already needs (e.g. JIT / unsigned memory for the engine).
if ! codesign -d --entitlements - --xml "$APP" > "$ENT" 2>/dev/null || [[ ! -s "$ENT" ]]; then
  cat > "$ENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict></dict></plist>
PLIST
fi
/usr/libexec/PlistBuddy -c "Delete :com.apple.security.get-task-allow" "$ENT" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :com.apple.security.get-task-allow bool true" "$ENT"

# Sign nested code first (frameworks, plugins, helpers), then the app itself. No --options runtime,
# so the hardened runtime is off and library validation won't reject the re-signed frameworks.
find "$APP/Contents" \( -name '*.dylib' -o -name '*.framework' -o -name '*.bundle' -o -name '*.so' \) -prune -print0 2>/dev/null |
  while IFS= read -r -d '' item; do
    codesign --force --deep --sign - "$item" >/dev/null 2>&1 || echo "  (skipped $item)"
  done
codesign --force --sign - --entitlements "$ENT" "$APP"

xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
rm -rf "$WORK"

echo
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q get-task-allow && echo "Done. Start the game, load your career, then run ./scripts/run.sh"
