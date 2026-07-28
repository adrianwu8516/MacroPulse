#!/bin/bash
set -e

APP_NAME="MacroPulse"
BUNDLE_ID="com.adrian.macropulse"
APP_DIR=".build/$APP_NAME.app"

echo "=== 编译 $APP_NAME (debug) ==="
swift build 2>&1

echo "=== 创建 Debug App Bundle ==="
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp ".build/debug/$APP_NAME" "$APP_DIR/Contents/MacOS/"
cp "Sources/Resources/AppIcon.icns" "$APP_DIR/Contents/Resources/"

# 复制 SPM resource bundle
if [ -d ".build/debug/MacroPulse_MacroPulse.bundle" ]; then
    cp -R ".build/debug/MacroPulse_MacroPulse.bundle" "$APP_DIR/Contents/Resources/"
fi

cat > "$APP_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>MacroPulse 总经分析</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <true/>
    </dict>
</dict>
</plist>
EOF

echo "=== 启动 $APP_NAME ==="
open "$APP_DIR"
