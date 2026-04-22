#!/bin/bash
set -e

echo "=========================================================="
echo "🎧 Začínám bleskovou instalaci aplikace ZazijVR GRID"
echo "=========================================================="

APP_DIR="$HOME/ZazijVR"
APP_PATH="$APP_DIR/GRID.AppImage"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

mkdir -p "$APP_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"

# Pokud uživatel pošle export GITHUB_TOKEN=xxxx, použijeme ho
AUTH_HEADER=""
if [ -n "$GITHUB_TOKEN" ]; then
    AUTH_HEADER="-H \"Authorization: token $GITHUB_TOKEN\""
fi

echo "🔍 Zjišťuji poslední verzi balíčku (AppImage)..."
# API URL pro poslední release. Protože to může být Draft (při automatickém buildu), nenačteme /latest ale první možný.
API_URL="https://api.github.com/repos/zazijvr/GRID/releases"

# Získáme API URL přímo na asset (nikoliv browser_download, to pod private repo failuje na AWS)
ASSET_ID=$(curl -s $(eval echo $AUTH_HEADER) "$API_URL" | grep -m 1 -oP '"url": "\Khttps://api.github.com/repos/zazijvr/GRID/releases/assets/[^"]*' | head -n 1 || true)

if [ -z "$ASSET_ID" ]; then
    # Zkusíme to ještě najít přes normální download (kdyby bylo repo public)
    ASSET_URL=$(curl -s $(eval echo $AUTH_HEADER) "$API_URL" | grep -m 1 -oP '"browser_download_url": "\K[^"]*\.AppImage' || true)
    if [ -z "$ASSET_URL" ]; then
        echo "❌ Selhalo stahování! Buď neexistuje žádný build, nebo je repo Private a tys neposkytl GITHUB_TOKEN."
        exit 1
    fi
    echo "📥 Stahuji veřejný AppImage z $ASSET_URL ..."
    curl -L --progress-bar "$ASSET_URL" -o "$APP_PATH"
else
    echo "📥 Stahuji chráněný AppImage objekt z $ASSET_ID ..."
    curl -L --progress-bar -H "Accept: application/octet-stream" $(eval echo $AUTH_HEADER) "$ASSET_ID" -o "$APP_PATH"
fi

echo "⚙️ Nastavuji spustitelnost..."
chmod +x "$APP_PATH"

echo "🎨 Stahuji a nastavuji ikonu pro Linux..."
# Stáhne naši čtvercovou desktop ikonu přímo ze source kódu
curl -L -s $(eval echo $AUTH_HEADER) "https://raw.githubusercontent.com/zazijvr/GRID/main/public/GRID_icon_desktop.png" -o "$ICON_DIR/zvr-grid.png"

echo "📝 Vytvářím zástupce (Launcher) pro Start menu..."
cat <<EOF > "$DESKTOP_DIR/zvr-grid.desktop"
[Desktop Entry]
Name=Zažij VR GRID
Comment=Hudební přehrávač GRID
Exec=$APP_PATH
Icon=zvr-grid
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
Keywords=music;player;vr;grid;
StartupNotify=true
EOF

update-desktop-database "$DESKTOP_DIR" || true

echo "=========================================================="
echo "✅ HOTOVO! GRID máš nainstalovaný a připravený."
echo "▶️ Najdeš ho v menu aplikací na svém Linuxu, nebo spusť zástupce přes hledání (Win/Super klávesa -> GRID)."
echo "=========================================================="
