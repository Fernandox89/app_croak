import { useEffect, useRef, useState } from "react";

import { AppShell, type Route } from "./components/AppShell";
import { useAlerts } from "./hooks/data";
import { useApp } from "./lib/app-context";
import { ALERT_PARAM_LABEL } from "./lib/status";
import { Alerts } from "./pages/Alerts";
import { Device } from "./pages/Device";
import { Overview } from "./pages/Overview";
import { Trends } from "./pages/Trends";

const ROUTES: Record<string, Route> = {
  "": "panel",
  tendencias: "tendencias",
  alertas: "alertas",
  dispositivo: "dispositivo",
};

const TITLES: Record<Route, string> = {
  panel: "Panel",
  tendencias: "Tendencias",
  alertas: "Alertas",
  dispositivo: "Dispositivo",
};

function readRoute(): Route {
  const key = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES[key] ?? "panel";
}

function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = route === "panel" ? "Croak" : `${TITLES[route]} · Croak`;
  }, [route]);
  return route;
}

// Notificación del sistema por cada alerta nueva (no por las que ya existían al abrir la app).
function useAlertNotifications() {
  const { prefs, source } = useApp();
  const alerts = useAlerts(20);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    seen.current = null;
  }, [source]);

  useEffect(() => {
    if (!alerts) return;
    if (!seen.current) {
      seen.current = new Set(alerts.map((a) => a.id));
      return;
    }
    const fresh = alerts.filter((a) => !seen.current!.has(a.id));
    fresh.forEach((a) => seen.current!.add(a.id));
    if (!prefs.notifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of fresh.reverse()) {
      const title = `${ALERT_PARAM_LABEL[a.param] ?? "Croak"}: ${a.active ? "alerta" : "normalizado"}`;
      const options: NotificationOptions = {
        body: a.message,
        icon: "icons/icon-192.png",
        badge: "icons/badge-72.png",
        tag: a.param,
      };
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification(title, { ...options, data: { url: "#/alertas" } }))
        .catch(() => new Notification(title, options));
    }
  }, [alerts, prefs.notifications]);
}

export function App() {
  const route = useRoute();
  useAlertNotifications();
  return (
    <AppShell route={route}>
      {route === "panel" && <Overview />}
      {route === "tendencias" && <Trends />}
      {route === "alertas" && <Alerts />}
      {route === "dispositivo" && <Device />}
    </AppShell>
  );
}
