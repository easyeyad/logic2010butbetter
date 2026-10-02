#!/bin/bash
# Starts the editor with admin rights (macOS requires them to open another app's memory).
set -euo pipefail
cd "$(dirname "$0")/.."
APP="build/FM Mac Editor.app"
if [[ ! -d "$APP" ]]; then ./scripts/build.sh; fi
echo "Asking for your Mac password to let the editor access Football Manager's memory…"
exec sudo "$APP/Contents/MacOS/FMMacEditor"
