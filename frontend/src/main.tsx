import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (
  "serviceWorker" in navigator &&
  (import.meta.env.PROD || window.location.hostname === "localhost")
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[sw]", e));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
