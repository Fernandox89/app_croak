import { BellOff, CircleCheck } from "lucide-react";
import { useMemo } from "react";

import { AlertRow } from "../components/AlertRow";
import { Card, CardHeader, EmptyState, PageHeader } from "../components/ui";
import { useAlerts, useConfig, useNow } from "../hooks/data";
import { formatDay } from "../lib/format";
import { activeAlerts } from "../lib/status";
import type { AlertEvent } from "../lib/types";

export function Alerts() {
  const alerts = useAlerts(200);
  const config = useConfig();
  const now = useNow(10_000);
  const active = activeAlerts(alerts ?? []);

  const byDay = useMemo(() => {
    const groups: { day: string; items: AlertEvent[] }[] = [];
    for (const a of alerts ?? []) {
      const day = formatDay(a.ts, now);
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.items.push(a);
      else groups.push({ day, items: [a] });
    }
    return groups;
  }, [alerts, now]);

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle={`Se genera una alerta cuando un indicador se mantiene fuera de su intervalo durante ${config.thresholds.persist} lecturas seguidas, y se normaliza con el mismo criterio.`}
      />

      <Card className="mb-6">
        <CardHeader title="Activas" description={active.length ? undefined : "Ningún indicador está fuera de su intervalo."} />
        {active.length > 0 ? (
          <ul className="divide-y divide-line">
            {active.map((a) => (
              <AlertRow key={a.id} alert={a} now={now} showGuidance />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<CircleCheck className="size-5" strokeWidth={1.8} />} title="Sin alertas activas" />
        )}
      </Card>

      <Card>
        <CardHeader title="Historial" />
        {alerts === undefined ? (
          <p className="px-5 py-8 text-sm text-muted">Cargando…</p>
        ) : byDay.length === 0 ? (
          <EmptyState icon={<BellOff className="size-5" strokeWidth={1.8} />} title="Todavía no hay eventos">
            Aquí aparecerá cada alerta y su normalización.
          </EmptyState>
        ) : (
          byDay.map((g) => (
            <div key={g.day}>
              <h3 className="border-b border-line bg-surface-alt px-5 py-2 text-xs font-medium tracking-wide text-muted uppercase">
                {g.day}
              </h3>
              <ul className="divide-y divide-line">
                {g.items.map((a) => (
                  <AlertRow key={a.id} alert={a} now={now} showTime />
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
