// Otevření skladeb ze systému („Otevřít v GRID“, dvojklik v souborech, GRID jako výchozí přehrávač).
// - Cesty přicházejí v argumentech programu: při startu (take_open_files) i z dalšího spuštění –
//   to se díky single-instance neotevře podruhé, jen pošle cesty běžícímu GRIDu (událost OPEN_EVENT).
// - Stránka smí přečíst jen soubory, které takhle přišly ze systému (ALLOWED) – jiné cesty odmítne.
// - Složka v argumentu = zvukové soubory přímo v ní (bez podsložek), seřazené podle názvu.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPEN_EVENT: &str = "grid://open-files";
const AUDIO_EXT: &[&str] = &["wav", "mp3", "flac", "ogg", "oga", "opus", "m4a", "aac", "wma", "weba", "webm"];
/** Nejvíc souborů z jednoho otevření (složka s celou diskografií by zahltila paměť) */
const MAX_FILES: usize = 500;

#[derive(Clone, Serialize)]
pub struct OpenedFile {
    path: String,
    name: String,
}

#[derive(Default)]
pub struct OpenFiles {
    /** Cesty ze startu programu – stránka si je vyzvedne, až bude připravená */
    pending: Mutex<Vec<OpenedFile>>,
    allowed: Mutex<HashSet<PathBuf>>,
}

fn is_audio(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// file:///home/a%20b.mp3 → /home/a b.mp3 (správce souborů může poslat adresu místo cesty)
fn from_uri(arg: &str) -> Option<PathBuf> {
    let rest = arg.strip_prefix("file://")?;
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    let bytes = rest.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(b) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Some(PathBuf::from(std::ffi::OsString::from_vec(out)))
    }
    #[cfg(not(unix))]
    {
        let s = String::from_utf8(out).ok()?;
        // file:///C:/Hudba/a.mp3 → C:/Hudba/a.mp3
        Some(PathBuf::from(s.trim_start_matches('/')))
    }
}

/// Argumenty programu (bez názvu programu) → zvukové soubory, které existují
fn audio_paths(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for arg in args {
        if arg.starts_with('-') && !Path::new(arg).exists() {
            continue; // přepínače (--appimage-…, -psn_… apod.)
        }
        let p = from_uri(arg).unwrap_or_else(|| PathBuf::from(arg));
        let p = if p.is_absolute() { p } else { cwd.join(p) };
        if p.is_dir() {
            let mut inside: Vec<PathBuf> = std::fs::read_dir(&p)
                .map(|rd| rd.filter_map(|e| e.ok().map(|e| e.path())).filter(|f| f.is_file() && is_audio(f)).collect())
                .unwrap_or_default();
            inside.sort_by_key(|f| f.file_name().map(|n| n.to_string_lossy().to_lowercase()));
            out.extend(inside);
        } else if p.is_file() && is_audio(&p) {
            out.push(p);
        }
        if out.len() >= MAX_FILES {
            out.truncate(MAX_FILES);
            break;
        }
    }
    out
}

fn register(state: &OpenFiles, paths: Vec<PathBuf>) -> Vec<OpenedFile> {
    let mut allowed = state.allowed.lock().unwrap();
    paths
        .into_iter()
        .map(|p| {
            let p = p.canonicalize().unwrap_or(p);
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let path = p.to_string_lossy().to_string();
            allowed.insert(p);
            OpenedFile { path, name }
        })
        .collect()
}

/// Start programu: soubory z příkazové řádky
pub fn from_startup(state: &OpenFiles) {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    let files = register(state, audio_paths(&args, &cwd));
    state.pending.lock().unwrap().extend(files);
}

/// Další spuštění GRIDu (už běží): pošle soubory do okna a okno vytáhne dopředu
pub fn from_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let files = register(&app.state::<OpenFiles>(), audio_paths(argv.get(1..).unwrap_or_default(), Path::new(&cwd)));
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    if !files.is_empty() {
        let _ = app.emit(OPEN_EVENT, files);
    }
}

/// Soubory ze startu (jednou – další volání vrátí prázdný seznam)
#[tauri::command]
pub fn take_open_files(state: tauri::State<'_, OpenFiles>) -> Vec<OpenedFile> {
    std::mem::take(&mut *state.pending.lock().unwrap())
}

/// Obsah souboru, který přišel ze systému (jiné cesty odmítne)
#[tauri::command]
pub async fn read_open_file(path: String, state: tauri::State<'_, OpenFiles>) -> Result<tauri::ipc::Response, String> {
    let p = PathBuf::from(&path);
    if !state.allowed.lock().unwrap().contains(&p) {
        return Err("Soubor nebyl otevřen ze systému".into());
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(p))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Soubor nejde přečíst: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Typy souborů pro zástupce v menu (stejné jako v install-linux.sh)
#[cfg(target_os = "linux")]
const DESKTOP_MIME: &str = "audio/mpeg;audio/mp3;audio/x-mp3;audio/x-mpeg;audio/flac;audio/x-flac;audio/ogg;audio/vorbis;audio/x-vorbis;audio/x-vorbis+ogg;audio/opus;audio/x-opus+ogg;audio/wav;audio/x-wav;audio/vnd.wave;audio/mp4;audio/x-m4a;audio/aac;audio/x-aac;audio/webm;audio/x-ms-wma;";

/// Linux, instalace přes install-linux.sh: starší zástupce (~/.local/share/applications/zvr-grid.desktop)
/// neměl typy souborů ani %F – systém pak hlásil, že GRID typ neumí, a spouštěl ho pro každý soubor zvlášť
/// bez cesty. Zástupce se jednou opraví (jen když spouští právě tento program).
#[cfg(target_os = "linux")]
pub fn fix_desktop_entry() {
    if std::env::var_os("APPDIR").is_some() {
        return;
    }
    let Ok(exe) = std::env::current_exe() else { return };
    let dir = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .map(|d| d.join("applications"));
    let Some(dir) = dir else { return };
    let file = dir.join("zvr-grid.desktop");
    let Ok(text) = std::fs::read_to_string(&file) else { return };

    let mut changed = false;
    let mut has_mime = false;
    let mut lines: Vec<String> = Vec::new();
    for line in text.lines() {
        if let Some(cmd) = line.strip_prefix("Exec=") {
            let target = cmd.trim().trim_matches('"');
            if !cmd.contains('%') {
                if Path::new(target) != exe {
                    return; // zástupce na jiný program – nesahat
                }
                lines.push(format!("Exec=\"{target}\" %F"));
                changed = true;
                continue;
            }
        }
        if line.starts_with("MimeType=") {
            has_mime = true;
        }
        lines.push(line.to_string());
    }
    if !has_mime {
        let at = lines.iter().position(|l| l.starts_with("Categories=")).map(|i| i + 1).unwrap_or(lines.len());
        lines.insert(at, format!("MimeType={DESKTOP_MIME}"));
        changed = true;
    }
    if !changed || std::fs::write(&file, lines.join("\n") + "\n").is_err() {
        return;
    }
    // Obnovit seznam typů (když nástroj chybí, systém si zástupce načte sám později)
    let _ = std::process::Command::new("update-desktop-database")
        .arg(&dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_and_paths() {
        assert_eq!(from_uri("file:///home/a%20b%25.mp3"), Some(PathBuf::from("/home/a b%.mp3")));
        assert_eq!(from_uri("file:///home/%C5%BElu%C5%A5ou%C4%8Dk%C3%BD.mp3"), Some(PathBuf::from("/home/žluťoučký.mp3")));
        assert_eq!(from_uri("/home/a.mp3"), None);
        let dir = std::env::temp_dir().join("grid-open-test");
        let _ = std::fs::create_dir_all(&dir);
        for f in ["b.MP3", "a.flac", "x.txt"] {
            std::fs::write(dir.join(f), b"").unwrap();
        }
        let got = audio_paths(&[dir.to_string_lossy().into(), "--flag".into(), "x.txt".into()], &dir);
        assert_eq!(got, vec![dir.join("a.flac"), dir.join("b.MP3")]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
