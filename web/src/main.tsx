import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const native = typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform?.();
if (!native && "serviceWorker" in navigator && import.meta.env.PROD) {
  void import("virtual:pwa-register").then((m) => m.registerSW({ immediate: true }));
}

if (!location.hash && window.innerWidth < 768) location.hash = "/todo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
