import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Overlay } from "./components/Overlay";
import "./index.css";

const native = typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform?.();
if (!native && "serviceWorker" in navigator && import.meta.env.PROD) {
  void import("virtual:pwa-register").then((m) => m.registerSW({ immediate: true }));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.hash.startsWith("#/overlay") ? <Overlay /> : <App />}
  </StrictMode>,
);
