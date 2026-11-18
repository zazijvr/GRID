// GRID nepotřebuje žádné vlastní příkazy ani pluginy – přehrávání běží ve webové části,
// okno se ovládá přes oprávnění v capabilities/default.json.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
