import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshedForUpdate = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || refreshedForUpdate) {
        return;
      }
      refreshedForUpdate = true;
      window.location.reload();
    });

    void navigator.serviceWorker.register("/sw.js").then((registration) => registration.update());
  });
}
