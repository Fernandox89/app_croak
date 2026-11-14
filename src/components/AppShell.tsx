import { Bell, ChartLine, CircleAlert, Cpu, FlaskConical, LayoutDashboard, LogOut, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { useAlerts, useLatest, useNow, useSourceError, useStatus } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { useAuth } from "../lib/auth";
import { IS_DEMO, LANDING_URL } from "../lib/edition";
import { activeAlerts, isOnline } from "../lib/status";
import { cx } from "./ui";

export type Route = "panel" | "tendencias" | "alertas" | "dispositivo";

const NAV: { route: Route; label: string; icon: typeof Bell }[] = [
  { route: "panel", label: "Panel", icon: LayoutDashboard },
  { route: "tendencias", label: "Tendencias", icon: ChartLine },
  { route: "alertas", label: "Alertas", icon: Bell },
  IS_DEMO
    ? { route: "dispositivo", label: "Simulación", icon: SlidersHorizontal }
    : { route: "dispositivo", label: "Dispositivo", icon: Cpu },
];

export const href = (r: Route) => (r === "panel" ? "#/" : `#/${r}`);

function DeviceIndicator({ className }: { className?: string }) {
  const { source } = useApp();
  const latest = useLatest() ?? null;
  const status = useStatus() ?? null;
  const now = useNow(5000);
  const online = isOnline(status, latest, now);
  if (source.kind === "demo") {
    return (
      <div className={cx("flex items-center gap-2 text-sm", className)}>
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        <span className="text-ink">Datos simulados</span>
      </div>
    );
  }
  return (
    <div className={cx("flex items-center gap-2 text-sm", className)}>
      <span
        className={cx("size-2 rounded-full", online ? "bg-ok" : "bg-subtle")}
        aria-hidden
      />
      <span className="font-mono text-[13px] text-ink">{source.deviceId}</span>
      <span className="text-muted">{online ? "En línea" : "Sin conexión"}</span>
    </div>
  );
}

function Wordmark() {
  return (
    <a href="#/" className="flex items-center gap-2.5">
      <img src="icons/logo.png" alt="" className="size-8 rounded-lg" />
      <span className="font-display text-lg font-bold tracking-tight text-ink">Croak</span>
    </a>
  );
}

function AccountBox() {
  const auth = useAuth();
  if (!auth) return null;
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-subtle">Sesión</div>
        <div className="truncate text-[13px] text-ink" title={auth.user.email ?? undefined}>
          {auth.user.email}
        </div>
      </div>
      <button
        type="button"
        onClick={() => auth.signOut()}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-alt hover:text-ink"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut className="size-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}

function DemoBanner() {
  if (IS_DEMO) {
    return (
      <span>
        <span className="font-medium text-ink">Demostración.</span> Los datos son simulados para mostrar cómo
        funciona Croak.{" "}
        <a href={href("dispositivo")} className="font-medium text-primary underline-offset-2 hover:underline">
          Probar escenarios
        </a>
        <span className="hidden sm:inline">
          {" · "}
          <a href={LANDING_URL} className="font-medium text-primary underline-offset-2 hover:underline">
            Conocer el proyecto
          </a>
        </span>
      </span>
    );
  }
  return (
    <span>
      <span className="font-medium text-ink">Modo demostración.</span> Los datos son simulados y no provienen de un
      dispositivo.{" "}
      <a href={href("dispositivo")} className="font-medium text-primary underline-offset-2 hover:underline">
        Cambiar fuente de datos
      </a>
    </span>
  );
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { source } = useApp();
  const alerts = useAlerts(100) ?? [];
  const error = useSourceError();
  const activeCount = activeAlerts(alerts).length;

  const navItem = (item: (typeof NAV)[number], variant: "side" | "tab") => {
    const Icon = item.icon;
    const current = item.route === route;
    const count = item.route === "alertas" && activeCount > 0 ? activeCount : 0;
    if (variant === "side") {
      return (
        <a
          key={item.route}
          href={href(item.route)}
          aria-current={current ? "page" : undefined}
          className={cx(
            "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
            current ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-alt hover:text-ink",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.8} />
          <span className="flex-1">{item.label}</span>
          {count > 0 && (
            <span className="rounded-full bg-warn px-1.5 text-[11px] font-semibold leading-5 text-white">{count}</span>
          )}
        </a>
      );
    }
    return (
      <a
        key={item.route}
        href={href(item.route)}
        aria-current={current ? "page" : undefined}
        className={cx(
          "relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-medium",
          current ? "text-primary" : "text-subtle",
        )}
      >
        <Icon className="size-[22px]" strokeWidth={current ? 2 : 1.7} />
        {item.label}
        {count > 0 && <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-warn" aria-label={`${count} activas`} />}
      </a>
    );
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <Wordmark />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
          {NAV.map((n) => navItem(n, "side"))}
        </nav>
        <div className="mt-auto rounded-xl border border-line px-3 py-2.5">
          <div className="text-xs text-subtle">{source.kind === "demo" ? "Fuente" : "Dispositivo"}</div>
          <DeviceIndicator className="mt-1 flex-wrap gap-x-2 gap-y-0.5" />
          <AccountBox />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (celular) */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur lg:hidden">
          <Wordmark />
          <DeviceIndicator className="text-xs" />
        </header>

        {source.kind === "demo" && (
          <div className="border-b border-line bg-surface-alt px-4 py-2.5 lg:px-10">
            <div className="mx-auto flex max-w-6xl items-center gap-2.5 text-[13px] text-muted">
              <FlaskConical className="size-4 shrink-0 text-primary" strokeWidth={1.8} />
              <DemoBanner />
            </div>
          </div>
        )}
        {error && (
          <div className="border-b border-line bg-danger-soft px-4 py-2.5 lg:px-10" role="alert">
            <div className="mx-auto flex max-w-6xl items-center gap-2.5 text-[13px] text-danger">
              <CircleAlert className="size-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Barra de pestañas (celular) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map((n) => navItem(n, "tab"))}
      </nav>
    </div>
  );
}
