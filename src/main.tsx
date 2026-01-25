import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { Provider } from "@/provider";
import { initialize_capacitor } from "@/native/capacitor_bridge";
import "@/styles/fonts.css";
import "@/styles/globals.css";

initialize_capacitor().catch(console.error);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });

      registration.addEventListener("updatefound", () => {
        const new_worker = registration.installing;

        if (!new_worker) return;

        new_worker.addEventListener("statechange", () => {
          if (
            new_worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            window.dispatchEvent(
              new CustomEvent("astermail:sw-update-available"),
            );
          }
        });
      });

      if (registration.waiting) {
        window.dispatchEvent(new CustomEvent("astermail:sw-update-available"));
      }

      setInterval(
        () => {
          registration.update().catch(() => {});
        },
        60 * 60 * 1000,
      );
    } catch {
      window.dispatchEvent(new CustomEvent("astermail:service-worker-failed"));
    }
  });

  let refresh_pending = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refresh_pending) return;
    refresh_pending = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Provider>
        <App />
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
);
