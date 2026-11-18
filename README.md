# Zažij VR GRID

Hudební přehrávač ZažijVR (Tauri 2 + React + TypeScript) pro Linux, Windows a Android:
playlist, 10pásmový ekvalizér s presety a 3D Visualizer Studio.

## Vývoj

```bash
bun install
bun run dev:linux      # Linux (WebKitGTK – X11 a bez DMA-BUF)
bun run tauri dev      # ostatní systémy
```

## Struktura

- `src/audio/audioGraph.ts` – zvukový graf Web Audio: zdroj → ekvalizér → analyser → hlasitost
- `src/audio/trackStore.ts` – playlist v IndexedDB (soubory skladeb jako Blob, každý uložený jednou)
- `src/hooks/useAudioPlayer.ts` – přehrávání, playlist, opakování, náhodné pořadí
- `src/components/` – ekvalizér, spektrum a Visualizer Studio (three.js)

## Sestavení

GitHub Actions (spuštění ručně):

- **Build Desktop** – AppImage/deb (Ubuntu 22.04) a Windows instalátor jako GitHub Release
- **Build Android APK** – podepsané APK; podpisový klíč v secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`

Linuxovou verzi nesestavujte lokálně na CachyOS (balíčky pro x86-64-v3/v4) – AppImage přibalí
systémové knihovny a na jiných procesorech by spadl na „Illegal instruction“.

Instalace na Linuxu: `install-linux.sh`.
