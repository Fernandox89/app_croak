import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./App";
import { AppProvider } from "./lib/app-context";
import { AuthGate } from "./lib/auth";
import { IS_DEMO } from "./lib/edition";
import "./styles.css";

registerSW({ immediate: true });

const app = (
  <AppProvider>
    <App />
  </AppProvider>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{IS_DEMO ? app : <AuthGate>{app}</AuthGate>}</StrictMode>,
);
