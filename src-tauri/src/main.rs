// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux (WebKitGTK) + Nvidia:
    // - X11 / XWayland: DMA-BUF renderer nevykresluje → vypnout.
    // - nativní Wayland: DMA-BUF funguje a je nutný pro výkon – bez něj se každý snímek kopíruje
    //   přes paměť procesoru (na ultrawide 5000 × 1400 jen ~23 FPS, s DMA-BUF 60 FPS).
    // Kdo si proměnnou nastaví sám (WEBKIT_DISABLE_DMABUF_RENDERER=1 / 0), má přednost.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        let x11 = std::env::var_os("WAYLAND_DISPLAY").is_none()
            || std::env::var("GDK_BACKEND").map(|b| b.starts_with("x11")).unwrap_or(false);
        if x11 {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    zvr_grid_lib::run()
}
