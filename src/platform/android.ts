// Most do nativní části Androidu (MainActivity.kt / MediaPlaybackService.kt).
// window.GridAndroid vkládá aplikace jen do vlastní stránky (tauri.localhost) – jinde neexistuje.

interface GridAndroidBridge {
  postMessage(message: string): void;
}

declare global {
  interface Window {
    GridAndroid?: GridAndroidBridge;
    /** Povel z oznámení / zamykací obrazovky / sluchátek: play | pause | toggle | next | prev | seek:<ms> */
    __gridMedia?: (command: string) => void;
    /** Tlačítko Zpět: true = aplikace ho zpracovala (zavřela panel), jinak se aplikace schová */
    __gridBack?: () => boolean;
  }
}

const bridge = () => window.GridAndroid;
export const isAndroidApp = () => !!window.GridAndroid;

const send = (msg: Record<string, unknown>) => bridge()?.postMessage(JSON.stringify(msg));

/** Stav přehrávání → oznámení, zamykací obrazovka, hraní na pozadí */
export const postPlaybackState = (s: { playing: boolean; title: string; positionMs: number; durationMs: number }) =>
  send({ type: 'state', playing: s.playing, title: s.title, position: Math.round(s.positionMs), duration: Math.round(s.durationMs) });

/** Visualizer přes celou obrazovku – schová systémové lišty */
export const setImmersive = (on: boolean) => send({ type: 'immersive', on });

/** zazijvr.cz v prohlížeči (adresu určuje nativní část) */
export const openWebsiteAndroid = () => send({ type: 'openWebsite' });
