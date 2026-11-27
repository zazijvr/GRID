// GRID nepotřebuje skoro žádné vlastní příkazy – přehrávání běží ve webové části, okno se ovládá
// přes oprávnění v capabilities/default.json. Vlastní příkazy: otevřít web ZažijVR a stránku s vydáními
// (pevné adresy – stránka nemůže nechat otevřít nic jiného) a aktualizace na počítači (updater.rs).

#[cfg(desktop)]
mod open_files;
#[cfg(desktop)]
mod updater;

#[cfg(desktop)]
const WEBSITE: &str = "https://zazijvr.cz";

#[cfg(desktop)]
#[tauri::command]
fn open_website() -> Result<(), String> {
    open_external(WEBSITE).map_err(|e| e.to_string())
}

/// Telefon: odkazy otevírá nativní část (MainActivity.kt)
#[cfg(mobile)]
#[tauri::command]
fn open_website() -> Result<(), String> {
    Err("open_website: na telefonu otevírá odkaz MainActivity".into())
}

/// Proměnné, které AppImage nastaví pro přibalené knihovny – spouštěné programy je dědit nesmí
#[cfg(all(desktop, target_os = "linux"))]
pub(crate) const APPIMAGE_ENV: &[&str] = &[
    "LD_LIBRARY_PATH", "LD_PRELOAD", "GTK_PATH", "GTK_EXE_PREFIX", "GTK_DATA_PREFIX", "GTK_IM_MODULE_FILE",
    "GTK_THEME", "GDK_PIXBUF_MODULE_FILE", "GDK_BACKEND", "GIO_MODULE_DIR", "GIO_EXTRA_MODULES",
    "GSETTINGS_SCHEMA_DIR", "GI_TYPELIB_PATH", "GST_PLUGIN_SYSTEM_PATH", "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_SCANNER", "GST_PLUGIN_PATH", "PYTHONPATH", "PYTHONHOME", "PERLLIB", "QT_PLUGIN_PATH",
    "WEBKIT_DISABLE_DMABUF_RENDERER", "WEBKIT_EXEC_PATH", "APPDIR", "APPIMAGE", "ARGV0", "OWD",
];

#[cfg(desktop)]
/// Otevře adresu v prohlížeči systému. Linux v AppImage: systémový xdg-open s očištěným
/// prostředím – prohlížeč by jinak zdědil přibalené knihovny AppImage a nespustil se.
fn open_external(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "linux")]
    if let Some(appdir) = std::env::var_os("APPDIR") {
        use std::process::{Command, Stdio};
        let appdir = appdir.to_string_lossy().to_string();
        let clean = |name: &str, fallback: &str| -> String {
            std::env::var(name)
                .ok()
                .map(|v| v.split(':').filter(|p| !p.is_empty() && !p.starts_with(&appdir)).collect::<Vec<_>>().join(":"))
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| fallback.to_string())
        };
        let opener = ["/usr/bin/xdg-open", "/usr/local/bin/xdg-open", "/bin/xdg-open"]
            .into_iter()
            .find(|p| std::path::Path::new(p).exists())
            .unwrap_or("xdg-open");
        let mut cmd = Command::new(opener);
        cmd.arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        for v in APPIMAGE_ENV {
            cmd.env_remove(v);
        }
        cmd.env("PATH", clean("PATH", "/usr/local/bin:/usr/bin:/bin"));
        cmd.env("XDG_DATA_DIRS", clean("XDG_DATA_DIRS", "/usr/local/share:/usr/share"));
        std::thread::spawn(move || {
            let _ = cmd.status();
        });
        return Ok(());
    }
    open::that_detached(url)
}

#[cfg(desktop)]
fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    updater::remember_install();
    tauri::generate_handler![
        open_website, updater::open_releases, updater::update_mode, updater::self_update, updater::restart_app,
        open_files::take_open_files, open_files::read_open_file
    ]
}

#[cfg(mobile)]
fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![open_website]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Počítač: jen jeden GRID – další spuštění (otevření souborů ze systému) předá soubory běžícímu oknu.
    // Plugin musí být zaregistrovaný jako první.
    #[cfg(desktop)]
    let builder = {
        let opened = open_files::OpenFiles::default();
        open_files::from_startup(&opened);
        #[cfg(target_os = "linux")]
        std::thread::spawn(open_files::fix_desktop_entry);
        builder
            .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| open_files::from_second_instance(app, argv, cwd)))
            .manage(opened)
    };
    builder
        .invoke_handler(handlers())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
