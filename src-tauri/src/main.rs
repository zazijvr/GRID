// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux (WebKitGTK): DMA-BUF renderer s ovladači Nvidia nevykresluje / padá. Nastaví se tady,
    // aby to platilo při jakémkoli spuštění (menu, terminál, AppImage). X11 se NEvynucuje – přes
    // XWayland s Nvidia WebKitGTK vykresloval jen kousky okna.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    zvr_grid_lib::run()
}
