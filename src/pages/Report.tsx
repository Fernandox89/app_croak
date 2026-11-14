import { Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, Card, PageHeader, Segmented } from "../components/ui";
import { useAlerts, useConfig, useHistory, useMaintenance, useNow } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { NOM127 } from "../lib/guidance";
import { MAINTENANCE_TASKS } from "../lib/maintenance";
import { ALERT_PARAM_LABEL, formatMetric, METRICS, metricState, rangeText } from "../lib/status";
import type { AlertParam } from "../lib/types";

type Period = "24h" | "7d";
const PERIODS: { value: Period; label: string; ms: number }[] = [
  { value: "24h", label: "24 horas", ms: 24 * 3600_000 },
  { value: "7d", label: "7 días", ms: 7 * 24 * 3600_000 },
];

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

// Reporte del periodo para imprimir o guardar como PDF (Imprimir → Guardar como PDF). Pensado como evidencia
// para negocios: resumen por indicador, tiempo dentro del intervalo, alertas y mantenimiento.
export function Report() {
  const { source } = useApp();
  const [period, setPeriod] = useState<Period>("24h");
  const ms = PERIODS.find((p) => p.value === period)!.ms;
  const history = useHistory(ms);
  const alerts = useAlerts(200);
  const config = useConfig();
  const maintenance = useMaintenance();
  const now = useNow(60_000);
  const from = now - ms;

  const rows = useMemo(() => {
    const inPeriod = (history ?? []).filter((r) => r.ts >= from);
    return METRICS.map((m) => {
      const valid = inPeriod.filter((r) => r[m.key]?.status === "ok" && r[m.key]?.value !== null);
      const vals = valid.map((r) => r[m.key].value as number);
      const inside = valid.filter((r) => metricState(m.key, r, config.thresholds) === "ok").length;
      return {
        info: m,
        count: vals.length,
        min: vals.length ? Math.min(...vals) : undefined,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined,
        max: vals.length ? Math.max(...vals) : undefined,
        insidePct: vals.length ? (inside / vals.length) * 100 : undefined,
      };
    });
  }, [history, from, config.thresholds]);

  const total = (history ?? []).filter((r) => r.ts >= from);
  const firstTs = total[0]?.ts;
  const periodAlerts = (alerts ?? []).filter((a) => a.ts >= from && a.active);
  const byParam = periodAlerts.reduce<Partial<Record<AlertParam, number>>>((acc, a) => {
    acc[a.param] = (acc[a.param] ?? 0) + 1;
    return acc;
  }, {});
  const fmt = (key: (typeof METRICS)[number]["key"], v: number | undefined, unit: string) =>
    v === undefined ? "—" : `${formatMetric(key, v)}${unit ? ` ${unit}` : ""}`;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reporte"
          subtitle="Resumen del periodo para imprimir o guardar como PDF."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Periodo" value={period} onChange={setPeriod} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
              <Button variant="primary" onClick={() => window.print()} disabled={!total.length}>
                <Printer className="size-4" strokeWidth={1.8} /> Imprimir o PDF
              </Button>
            </div>
          }
        />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <div className="space-y-6 p-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <img src="icons/logo.png" alt="" className="size-10 rounded-lg" />
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Reporte de calidad del agua</h2>
                <p className="text-sm text-muted">
                  Dispositivo <span className="font-mono">{source.deviceId}</span> · últimas{" "}
                  {PERIODS.find((p) => p.value === period)!.label}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-subtle">
              <div>Generado: {dateTime.format(now)}</div>
              <div>
                {total.length.toLocaleString("es-MX")} lecturas
                {firstTs ? ` desde ${dateTime.format(firstTs)}` : ""}
              </div>
            </div>
          </header>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Indicadores</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-subtle">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">Indicador</th>
                    <th className="py-2 pr-3 font-medium">Mínimo</th>
                    <th className="py-2 pr-3 font-medium">Promedio</th>
                    <th className="py-2 pr-3 font-medium">Máximo</th>
                    <th className="py-2 pr-3 font-medium">Dentro del intervalo</th>
                    <th className="py-2 font-medium">Intervalo configurado</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {rows.map((r) => (
                    <tr key={r.info.key} className="border-b border-line align-top">
                      <td className="py-2 pr-3 text-ink">
                        {r.info.label}
                        <div className="text-[11px] text-subtle">Referencia {NOM127[r.info.key]}</div>
                      </td>
                      <td className="py-2 pr-3 font-mono">{fmt(r.info.key, r.min, r.info.unit)}</td>
                      <td className="py-2 pr-3 font-mono">{fmt(r.info.key, r.avg, r.info.unit)}</td>
                      <td className="py-2 pr-3 font-mono">{fmt(r.info.key, r.max, r.info.unit)}</td>
                      <td className="py-2 pr-3 font-mono">
                        {r.insidePct === undefined ? "—" : `${r.insidePct.toFixed(1)} %`}
                      </td>
                      <td className="py-2">{rangeText(r.info.key, config.thresholds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Alertas en el periodo</h3>
              {periodAlerts.length ? (
                <ul className="space-y-1 text-sm text-muted">
                  {Object.entries(byParam).map(([param, n]) => (
                    <li key={param}>
                      {ALERT_PARAM_LABEL[param as AlertParam] ?? param}: {n} {n === 1 ? "alerta" : "alertas"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Sin alertas.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Mantenimiento registrado</h3>
              <ul className="space-y-1 text-sm text-muted">
                {MAINTENANCE_TASKS.map((t) => {
                  const last = maintenance?.[t.key];
                  return (
                    <li key={t.key}>
                      {t.label}: {last ? dateOnly.format(last) : "sin registro"}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <p className="border-t border-line pt-4 text-xs leading-relaxed text-subtle">
            Croak monitorea pH, turbidez relativa y sólidos disueltos de forma continua. No determina si el agua es
            potable ni detecta microorganismos, metales u otros contaminantes; para eso se requiere un análisis de
            laboratorio acreditado. La turbidez es un índice relativo, no UNT.
          </p>
        </div>
      </Card>
    </>
  );
}
