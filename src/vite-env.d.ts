/// <reference types="vite/client" />

interface Window {
  /** Vloženo Tauri – existuje jen v aplikaci (ne v náhledu v prohlížeči) */
  __TAURI_INTERNALS__?: unknown;
}
