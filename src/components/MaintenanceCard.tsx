import { useState } from "react";

import { useMaintenance, useNow } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { formatRelative } from "../lib/format";
import { dueInfo, MAINTENANCE_TASKS, type DueState } from "../lib/maintenance";
import type { MaintenanceKey } from "../lib/types";
import { Badge, Button, Card, CardHeader } from "./ui";

const BADGE: Record<DueState, { tone: "ok" | "warn" | "danger" | "neutral"; text: (days?: number) => string }> = {
  ok: { tone: "ok", text: (d) => `Faltan ${d} días` },
  soon: { tone: "warn", text: (d) => (d === 0 ? "Toca hoy" : `Faltan ${d} días`) },
  overdue: { tone: "danger", text: (d) => `Vencida hace ${Math.abs(d ?? 0)} días` },
  never: { tone: "neutral", text: () => "Sin registro" },
};

// Recordatorios de mantenimiento: cuándo se hizo cada tarea y cuándo toca la siguiente. Registrar una tarea
// guarda la fecha en el dispositivo, así que todas las cuentas que lo comparten ven lo mismo.
export function MaintenanceCard() {
  const { source } = useApp();
  const m = useMaintenance();
  const now = useNow(60_000);
  const [busy, setBusy] = useState<MaintenanceKey | null>(null);
  const [error, setError] = useState(false);

  async function mark(key: MaintenanceKey) {
    setBusy(key);
    setError(false);
    try {
      await source.markMaintenance(key);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Mantenimiento"
        description="Registra cada tarea al hacerla y la app te avisará cuándo toca la siguiente."
      />
      <ul className="divide-y divide-line">
        {MAINTENANCE_TASKS.map((t) => {
          const info = dueInfo(t, m, now);
          const badge = BADGE[info.state];
          return (
            <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{t.label}</span>
                  <Badge tone={badge.tone}>{badge.text(info.days)}</Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {info.last ? `Última: ${formatRelative(info.last, now)}. ` : ""}Cada {t.everyDays} días. {t.hint}
                </p>
              </div>
              <Button onClick={() => mark(t.key)} disabled={busy !== null}>
                {busy === t.key ? "Guardando…" : "Registrar hoy"}
              </Button>
            </li>
          );
        })}
      </ul>
      {error && <p className="px-5 pb-4 text-sm text-danger">No se pudo guardar. Revisa la conexión.</p>}
    </Card>
  );
}
