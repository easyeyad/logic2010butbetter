#!/bin/bash
# Builds FM Mac Editor.app in ./build and signs it locally (ad-hoc) with the debugger entitlement.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v swift >/dev/null; then
  echo "Swift not found. Install Xcode (App Store) or run: xcode-select --install" >&2
  exit 1
fi

swift build -c release
BIN="$(swift build -c release --show-bin-path)/FMMacEditor"

APP="build/FM Mac Editor.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/FMMacEditor"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key><string>FMMacEditor</string>
	<key>CFBundleIdentifier</key><string>local.fmmaceditor</string>
	<key>CFBundleName</key><string>FM Mac Editor</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>0.1</string>
	<key>LSMinimumSystemVersion</key><string>14.0</string>
	<key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

codesign --force --sign - --entitlements scripts/editor.entitlements "$APP"
echo "Built: $APP"
