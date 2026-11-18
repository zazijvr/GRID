import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Linux (WebKitGTK): okno je neprůhledné (tauri.linux.conf.json) – stránka dostane tmavé pozadí,
// jinak by prázdné místo (zvětšené / maximalizované okno) bylo bílé a nepřekreslovalo se
if (/Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)) {
  document.documentElement.classList.add("opaque-window");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
