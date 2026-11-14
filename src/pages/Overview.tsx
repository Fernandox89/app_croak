import { ArrowRight, CircleAlert, CircleCheck, Clock, Thermometer, TriangleAlert, WifiOff, Wrench } from "lucide-react";

import { AlertRow } from "../components/AlertRow";
import { href } from "../components/AppShell";
import { MetricCard } from "../components/MetricCard";
import { Card, CardHeader, EmptyState, PageHeader, cx } from "../components/ui";
import { useAlerts, useConfig, useHistory, useLatest, useMaintenance, useNow, useStatus } from "../hooks/data";
import { formatInterval, formatRelative } from "../lib/format";
import { pendingTasks } from "../lib/maintenance";
import { METRICS, OVERALL_COPY, type OverallState, activeAlerts, lastContact, overallState } from "../lib/status";

const WINDOW_MS = 30 * 60 * 1000;

const OVERALL_STYLE: Record<OverallState, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: "text-ok bg-ok-soft" },
  attention: { icon: TriangleAlert, className: "text-warn bg-warn-soft" },
  fault: { icon: CircleAlert, className: "text-danger bg-danger-soft" },
  offline: { icon: WifiOff, className: "text-neutral bg-neutral-soft" },
  waiting: { icon: Clock, className: "text-neutral bg-neutral-soft" },
};

export function Overview() {
  const latestRaw = useLatest();
  const statusRaw = useStatus();
  const latest = latestRaw ?? null;
  const status = statusRaw ?? null;
  const config = useConfig();
  const history = useHistory(WINDOW_MS) ?? [];
  const alerts = useAlerts(50) ?? [];
  const now = useNow();

  const loading = latestRaw === undefined && statusRaw === undefined;
  const state = loading ? "waiting" : overallState(latest, status, config.thresholds, now);
  const copy = OVERALL_COPY[state];
  const { icon: StateIcon, className: stateClass } = OVERALL_STYLE[state];
  const last = lastContact(status, latest);
  const interval = status?.interval_s ?? config.interval_s;
  const gapMs = Math.max(interval * 3000, 180_000);
  const active = activeAlerts(alerts);
  const maintenance = useMaintenance();
  const overdue = maintenance === undefined ? [] : pendingTasks(maintenance, now);
  const noRecords = maintenance !== undefined && !Object.keys(maintenance ?? {}).length;

  return (
    <>
      <PageHeader
        title="Panel"
        subtitle={last ? `Última lectura ${formatRelative(last, now)}` : "Sin lecturas recibidas"}
      />

      <Card className="mb-6">
        <div className="flex items-start gap-4 p-5">
          <div className={cx("flex size-11 shrink-0 items-center justify-center rounded-xl", stateClass)}>
            <StateIcon className="size-[22px]" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink">{copy.title}</h2>
            <p className="mt-1 text-sm text-muted">{copy.detail}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((m) => (
          <MetricCard
            key={m.key}
            metric={m.key}
            latest={latest}
            history={history}
            thresholds={config.thresholds}
            now={now}
            windowMs={WINDOW_MS}
            gapMs={gapMs}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Alertas activas"
            action={
              <a href={href("alertas")} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Ver historial <ArrowRight className="size-4" />
              </a>
            }
          />
          {active.length ? (
            <ul className="divide-y divide-line">
              {active.map((a) => (
                <AlertRow key={a.id} alert={a} now={now} showGuidance />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CircleCheck className="size-5" strokeWidth={1.8} />} title="Sin alertas activas">
              Se avisará cuando un indicador se mantenga fuera de su intervalo durante {config.thresholds.persist}{" "}
              lecturas seguidas.
            </EmptyState>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Condiciones de medición" />
          <dl className="divide-y divide-line">
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Thermometer className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} />
              <div className="text-sm">
                {latest?.temp_source === "ds18b20" && latest.temp_c !== null ? (
                  <>
                    <dt className="text-ink">Temperatura del agua: {latest.temp_c.toFixed(1)} °C</dt>
                    <dd className="text-muted">Se usa para compensar pH y TDS.</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-ink">Sin sensor de temperatura</dt>
                    <dd className="text-muted">pH y TDS se compensan suponiendo 25 °C.</dd>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} />
              <div className="text-sm">
                <dt className="text-ink">Una lectura cada {formatInterval(interval)}</dt>
                <dd className="text-muted">Cada lectura promedia 64 muestras por sensor.</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Wrench className={cx("mt-0.5 size-4 shrink-0", overdue.length ? "text-warn" : "text-muted")} strokeWidth={1.8} />
              <div className="text-sm">
                <dt className="text-ink">
                  {overdue.length
                    ? `Mantenimiento pendiente: ${overdue.map((t) => t.label.toLowerCase()).join(", ")}`
                    : noRecords
                      ? "Sin mantenimiento registrado"
                      : "Mantenimiento al día"}
                </dt>
                <dd className="text-muted">
                  <a href={href("dispositivo")} className="font-medium text-primary hover:underline">
                    Ver recordatorios
                  </a>
                </dd>
              </div>
            </div>
          </dl>
        </Card>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-subtle">
        Croak monitorea pH, turbidez y sólidos disueltos. Estos indicadores ayudan a detectar cambios, pero no
        determinan si el agua es potable ni detectan microorganismos. Ante una alerta persistente, considera un
        análisis de laboratorio.
      </p>
    </>
  );
}
