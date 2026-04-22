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

# Pokud uživatel pošle TOKEN přes environment, použijeme Array pro bezpečný pass argumentů do curl
AUTH_ARGS=()
if [ -n "$GITHUB_TOKEN" ]; then
    AUTH_ARGS=(-H "Authorization: token $GITHUB_TOKEN")
fi

echo "🔍 Zjišťuji poslední verzi balíčku (AppImage)..."
# API URL pro poslední release. Protože to může být Draft (při automatickém buildu), nenačteme /latest ale list.
API_URL="https://api.github.com/repos/zazijvr/GRID/releases"

# Získáme API URL přímo na asset stabilně přes Python3 (pokud je systém vybaven)
ASSET_ID=$(curl -s "${AUTH_ARGS[@]}" "$API_URL" | python3 -c '
import sys, json
try:
    for release in json.load(sys.stdin):
        for asset in release.get("assets", []):
            if asset.get("name", "").endswith(".AppImage"):
                print(asset["url"])
                sys.exit(0)
except Exception:
    pass
')

if [ -z "$ASSET_ID" ]; then
    # Zkusíme to ještě najít přes normální download pomocí prostého grepu
    ASSET_URL=$(curl -s "${AUTH_ARGS[@]}" "$API_URL" | grep -m 1 -oP '"browser_download_url": "\K[^"]*\.AppImage' || true)
    if [ -z "$ASSET_URL" ]; then
        echo "❌ Selhalo stahování! Buď neexistuje žádný build, nebo je repo Private a tys nenastavil GITHUB_TOKEN."
        exit 1
    fi
    echo "📥 Stahuji veřejný AppImage z $ASSET_URL ..."
    curl -L --progress-bar "$ASSET_URL" -o "$APP_PATH"
else
    echo "📥 Stahuji chráněný AppImage objekt z $ASSET_ID ..."
    curl -L --progress-bar -H "Accept: application/octet-stream" "${AUTH_ARGS[@]}" "$ASSET_ID" -o "$APP_PATH"
fi

echo "⚙️ Nastavuji spustitelnost..."
chmod +x "$APP_PATH"

echo "🎨 Stahuji a nastavuji ikonu pro Linux..."
# Stáhne naši čtvercovou desktop ikonu přímo ze source kódu
curl -sL "${AUTH_ARGS[@]}" "https://raw.githubusercontent.com/zazijvr/GRID/main/public/GRID_icon_desktop.png" -o "$ICON_DIR/zvr-grid.png"

echo "📝 Vytvářím zástupce (Launcher) pro Start menu..."
cat <<EOF > "$DESKTOP_DIR/zvr-grid.desktop"
[Desktop Entry]
Name=Zažij VR GRID
Comment=Hudební přehrávač GRID
Exec=env WEBKIT_DISABLE_DMABUF_RENDERER=1 $APP_PATH
Icon=$ICON_DIR/zvr-grid.png
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
Keywords=music;player;vr;grid;
StartupNotify=true
EOF

echo "🔄 Aktualizuji systémové ikony a tvořím cache..."
touch "$HOME/.local/share/icons/hicolor" || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
update-desktop-database "$DESKTOP_DIR" || true
if command -v kbuildsycoca6 >/dev/null 2>&1; then kbuildsycoca6 2>/dev/null || true; fi
if command -v kbuildsycoca5 >/dev/null 2>&1; then kbuildsycoca5 2>/dev/null || true; fi

echo "=========================================================="
echo "✅ HOTOVO! GRID máš nainstalovaný a připravený."
echo "▶️ Najdeš ho v menu aplikací na svém Linuxu, nebo spusť zástupce přes hledání (Win/Super klávesa -> GRID)."
echo "=========================================================="
