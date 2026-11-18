#!/usr/bin/env bash
# Sestavení podepsaného APK pro Android (telefony ARM64).
#
#   scripts/android.sh   → release/android/GRID_<verze>_arm64.apk
#
# Podpisový klíč: ~/.tauri/zvr-grid-android.jks (alias zvrgrid), heslo v ~/.tauri/zvr-grid-android.pass.
# Všechna APK musí být podepsaná STEJNÝM klíčem, jinak je Android nenainstaluje jako aktualizaci
# (uživatel by musel odinstalovat a přišel by o playlist) – klíč i heslo zálohujte.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export NDK_HOME="${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* | sort -V | tail -n 1)}"
# Gradle potřebuje plné JDK (s javac)
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/javac" ]; then
  for jdk in /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-17-openjdk /usr/lib/jvm/*; do
    if [ -x "$jdk/bin/javac" ]; then export JAVA_HOME="$jdk"; break; fi
  done
fi
[ -x "${JAVA_HOME:-}/bin/javac" ] || { echo "❌ Chybí JDK s javac: sudo pacman -S jdk21-openjdk" >&2; exit 1; }
KEYSTORE="${ANDROID_KEYSTORE:-$HOME/.tauri/zvr-grid-android.jks}"
KEYPASS_FILE="${ANDROID_KEYPASS_FILE:-$HOME/.tauri/zvr-grid-android.pass}"
[ -f "$KEYSTORE" ] && [ -f "$KEYPASS_FILE" ] || { echo "❌ Chybí podpisový klíč $KEYSTORE nebo heslo $KEYPASS_FILE." >&2; exit 1; }

VERSION=$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
BUILD_TOOLS=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)

# Ikony aplikace do Android projektu
cp -r src-tauri/icons/android/* src-tauri/gen/android/app/src/main/res/

echo "🛠️  Sestavuji APK $VERSION (arm64)…"
bunx tauri android build --apk --target aarch64

UNSIGNED=$(ls -t src-tauri/gen/android/app/build/outputs/apk/*/release/*-release-unsigned.apk | head -n 1)
OUT=release/android
mkdir -p "$OUT"
APK="$OUT/GRID_${VERSION}_arm64.apk"

echo "✍️  Podepisuji…"
"$BUILD_TOOLS/zipalign" -f -p 4 "$UNSIGNED" "$OUT/aligned.apk"
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias zvrgrid \
  --ks-pass "file:$KEYPASS_FILE" --out "$APK" "$OUT/aligned.apk"
rm -f "$OUT/aligned.apk" "$APK.idsig"
"$BUILD_TOOLS/apksigner" verify "$APK"

echo "✅ $APK ($(du -h "$APK" | cut -f1))"
