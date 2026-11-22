#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
if [ -f "$SDK/platforms/android-35/android.jar" ]; then
  PLATFORM="$SDK/platforms/android-35/android.jar"
else
  PLATFORM="$(find "$SDK/platforms" -name android.jar | sort -V | tail -n1)"
fi
BT="$(find "$SDK/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
: "${PLATFORM:?Android SDK platform is required}"
: "${BT:?Android SDK build tools are required}"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/classes" "$TEMP/dex" "$BASE/dist"
"$BT/aapt2" compile --dir "$BASE/res" -o "$TEMP/res.zip"
"$BT/aapt2" link -I "$PLATFORM" --manifest "$BASE/AndroidManifest.xml"   -o "$TEMP/resources.apk" "$TEMP/res.zip"
javac -source 8 -target 8 -cp "$PLATFORM" -d "$TEMP/classes"   "$BASE/src/app/duroodibrahimi/online/MainActivity.java"
jar cf "$TEMP/classes.jar" -C "$TEMP/classes" .
"$BT/d8" --min-api 24 --lib "$PLATFORM" --output "$TEMP/dex" "$TEMP/classes.jar"
(cd "$TEMP/dex" && zip -q "$TEMP/resources.apk" classes.dex)
"$BT/zipalign" -P 16 -f 4 "$TEMP/resources.apk" "$TEMP/aligned.apk"
mkdir -p "$HOME/.android"
KEY="$HOME/.android/debug.keystore"
if [ ! -f "$KEY" ]; then
  keytool -genkeypair -noprompt -keystore "$KEY" -storepass android -keypass android     -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000     -dname "CN=Durood Online Build" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEY" --ks-key-alias androiddebugkey   --ks-pass pass:android --key-pass pass:android   --out "$BASE/dist/Durood-Ibrahimi-Online-4.4-Compact-Bars-Test.apk" "$TEMP/aligned.apk"
"$BT/apksigner" verify --verbose "$BASE/dist/Durood-Ibrahimi-Online-4.4-Compact-Bars-Test.apk"
"$BT/aapt2" dump badging "$BASE/dist/Durood-Ibrahimi-Online-4.4-Compact-Bars-Test.apk"  | grep -E 'package:|launchable-activity:|sdkVersion:|targetSdkVersion:'
test -s "$BASE/dist/Durood-Ibrahimi-Online-4.4-Compact-Bars-Test.apk"
echo "Built signed real APK at $BASE/dist/Durood-Ibrahimi-Online-4.4-Compact-Bars-Test.apk"
