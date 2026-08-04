#!/bin/bash
# Builds a standalone macOS app for the DelCargo Tracker agent.
# Run this ON A MAC (PyInstaller cannot cross-compile from Windows/Linux to
# macOS). The GitHub Actions workflow in
# .github/workflows/build-tracker-agent.yml does this automatically on a
# macos-latest runner if you don't want to build locally.
#
# Note: the resulting .app is unsigned. On first launch, macOS Gatekeeper
# will warn "cannot be opened because the developer cannot be verified" —
# the employee needs to right-click the app -> Open (once) to allow it, or
# System Settings -> Privacy & Security -> "Open Anyway". Proper code
# signing/notarization requires an active Apple Developer account and is a
# good next step before wider rollout.

set -e
python3 -m pip install --upgrade pip
pip3 install -r requirements.txt

# Regenerates icon.icns / icon.png from "Tracker Icon.png" if present —
# safe to skip (build still works, just without a custom icon) if you
# haven't added a brand icon file yet.
if [ -f "Tracker Icon.png" ]; then python3 generate_icons.py; fi

ICON_FLAG=""
if [ -f "icon.icns" ]; then ICON_FLAG='--icon icon.icns'; fi

# --add-data bundles icon.png inside the app so the in-app window icon and
# tray/menu-bar icon can find it at runtime via sys._MEIPASS (see
# _app_icon_path() in agent_gui.py). Skipped if icon.png doesn't exist.
DATA_FLAG=""
if [ -f "icon.png" ]; then DATA_FLAG='--add-data icon.png:.'; fi

# Create Info.plist keys for native macOS Screen Recording & Privacy prompts
cat << 'EOF' > mac_info.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>DelCargo Tracker</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>us.delcargo.tracker</string>
    <key>CFBundleName</key>
    <string>DelCargo Tracker</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.9</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © DelCargo. All rights reserved.</string>
    <key>NSScreenCaptureUsageDescription</key>
    <string>DelCargo Tracker requires Screen Recording permission to take periodic workspace screenshots during active shifts.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>DelCargo Tracker requires background permissions to verify active workspace shifts.</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

PLIST_FLAG="--options-to-add mac_info.plist"

# Package Python agent into standalone native macOS executable bundle (.app)
pyinstaller --onedir --windowed --name "DelCargo Tracker" $ICON_FLAG $DATA_FLAG agent_gui.py

# Create native Apple .dmg installer (Drag-to-Applications container)
echo "Packaging native macOS .dmg installer..."
cd dist
rm -f "DelCargo_Tracker_Setup.dmg" "DelCargo-Tracker-Mac.zip"

if command -v create-dmg &> /dev/null; then
    create-dmg \
      --volname "DelCargo Tracker Installer" \
      --volicon "../icon.icns" \
      --window-pos 200 120 \
      --window-size 600 400 \
      --icon-size 100 \
      --icon "DelCargo Tracker.app" 175 190 \
      --hide-extension "DelCargo Tracker.app" \
      --app-drop-link 425 190 \
      "DelCargo_Tracker_Setup.dmg" \
      "DelCargo Tracker.app"
else
    # Fallback to native hdiutil if create-dmg utility is not installed
    hdiutil create -volname "DelCargo Tracker" -srcfolder "DelCargo Tracker.app" -ov -format UDZO "DelCargo_Tracker_Setup.dmg"
fi

# Package as a standalone ZIP archive too for direct extraction
zip -r "DelCargo-Tracker-Mac.zip" "DelCargo Tracker.app"
cd ..

echo ""
echo "=========================================================="
echo "macOS Installer Build Complete!"
echo "Find your native Mac installer at:"
echo "  1) tracker-agent/dist/DelCargo_Tracker_Setup.dmg (Visual Mac DMG Installer)"
echo "  2) tracker-agent/dist/DelCargo-Tracker-Mac.zip (Direct Application Archive)"
echo "=========================================================="
