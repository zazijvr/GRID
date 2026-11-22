// Aktualizace na počítači. Stránka si sama zjistí na GitHubu, jestli je nová verze (veřejné API vydání),
// a podle způsobu instalace nabídne:
//  - "appimage": spuštěno z AppImage → stáhne nový AppImage a nahradí ten spuštěný,
//  - "binary":   rozbalený program (install-linux.sh, ~/ZazijVR/zvr-grid) → stáhne AppImage,
//                rozbalí z něj program a nahradí ten spuštěný,
//  - "manual":   Windows, balíček .deb/.rpm nebo složka bez práva zápisu → otevře stránku s vydáními.
// Stahuje se jen z vydání repozitáře zazijvr/GRID (adresa se kontroluje) a přes systémový curl.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const RELEASES: &str = "https://github.com/zazijvr/GRID/releases/latest";
const DOWNLOAD_PREFIX: &str = "https://github.com/zazijvr/GRID/releases/download/";

/// Spuštěný program (nebo AppImage) – zjištěno hned při startu, než ho aktualizace nahradí
static INSTALL: OnceLock<(String, Option<PathBuf>)> = OnceLock::new();

pub fn remember_install() {
    INSTALL.get_or_init(detect);
}

fn writable_dir(p: &Path) -> bool {
    let Some(dir) = p.parent() else { return false };
    let probe = dir.join(".grid-write-test");
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

fn detect() -> (String, Option<PathBuf>) {
    #[cfg(target_os = "linux")]
    {
        if let Some(img) = std::env::var_os("APPIMAGE").map(PathBuf::from) {
            if img.is_file() && writable_dir(&img) {
                return ("appimage".into(), Some(img));
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            // Z balíčku (/usr/bin) aktualizuje správce balíčků, ne aplikace
            let system = exe.starts_with("/usr") || exe.starts_with("/opt") || exe.starts_with("/bin");
            if !system && std::env::var_os("APPDIR").is_none() && writable_dir(&exe) {
                return ("binary".into(), Some(exe));
            }
        }
    }
    ("manual".into(), None)
}

#[tauri::command]
pub fn update_mode() -> String {
    INSTALL.get_or_init(detect).0.clone()
}

#[tauri::command]
pub fn open_releases() -> Result<(), String> {
    crate::open_external(RELEASES).map_err(|e| e.to_string())
}

/// Stáhne a nainstaluje novou verzi (jen Linux, režim appimage / binary). Po úspěchu stačí restart.
#[tauri::command]
pub async fn self_update(url: String) -> Result<(), String> {
    if !url.starts_with(DOWNLOAD_PREFIX) || !url.ends_with(".AppImage") || url.contains("..") {
        return Err("Neplatná adresa aktualizace".into());
    }
    let (mode, target) = INSTALL.get_or_init(detect).clone();
    let target = target.ok_or("Tuhle instalaci nejde aktualizovat z aplikace")?;
    tauri::async_runtime::spawn_blocking(move || install(&mode, &url, &target))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "linux")]
fn install(mode: &str, url: &str, target: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    use std::process::{Command, Stdio};

    let dir = target.parent().ok_or("Neznámá složka aplikace")?;
    let work = dir.join(format!(".grid-update-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let cleanup = || { let _ = std::fs::remove_dir_all(&work); };

    let run = |cmd: &mut Command, what: &str| -> Result<(), String> {
        for v in crate::APPIMAGE_ENV {
            cmd.env_remove(v);
        }
        let out = cmd.stdin(Stdio::null()).output().map_err(|e| format!("{what}: {e}"))?;
        if out.status.success() { Ok(()) } else {
            Err(format!("{what}: {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("chyba")))
        }
    };

    let image = work.join("GRID.AppImage");
    let result = (|| {
        run(Command::new("curl").args(["-fsSL", "--retry", "2", "--max-time", "600", "-o"]).arg(&image).arg(url), "Stažení")?;
        std::fs::set_permissions(&image, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;

        let new_file = if mode == "appimage" {
            image.clone()
        } else {
            run(Command::new(&image).arg("--appimage-extract").current_dir(&work), "Rozbalení")?;
            let bin = work.join("squashfs-root/usr/bin/zvr-grid");
            if !bin.is_file() { return Err("V balíčku chybí program zvr-grid".into()); }
            bin
        };
        // Nový soubor vedle starého a pak přejmenovat – spuštěný program se tím nepoškodí
        let staged = dir.join(format!(".{}.new", target.file_name().and_then(|n| n.to_str()).unwrap_or("zvr-grid")));
        std::fs::copy(&new_file, &staged).map_err(|e| e.to_string())?;
        std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
        std::fs::rename(&staged, target).map_err(|e| e.to_string())
    })();
    cleanup();
    result
}

#[cfg(not(target_os = "linux"))]
fn install(_mode: &str, _url: &str, _target: &Path) -> Result<(), String> {
    Err("Aktualizace z aplikace je jen na Linuxu".into())
}

/// Spustí (už aktualizovaný) program znovu a tuhle instanci ukončí
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    let (_, target) = INSTALL.get_or_init(detect).clone();
    let exe = match target {
        Some(t) => t,
        None => std::env::current_exe().map_err(|e| e.to_string())?,
    };
    let mut cmd = std::process::Command::new(&exe);
    #[cfg(target_os = "linux")]
    for v in crate::APPIMAGE_ENV {
        // DMA-BUF nastavení z prostředí (zástupce na ploše) zachovat – ostatní proměnné AppImage ne
        if *v != "WEBKIT_DISABLE_DMABUF_RENDERER" {
            cmd.env_remove(v);
        }
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}
