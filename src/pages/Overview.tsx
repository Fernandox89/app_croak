import { ArrowRight, CircleAlert, CircleCheck, Clock, MapPin, Thermometer, TriangleAlert, WifiOff, Wrench } from "lucide-react";

import { AlertRow } from "../components/AlertRow";
import { href } from "../components/AppShell";
import { MetricCard } from "../components/MetricCard";
import { Card, CardHeader, EmptyState, PageHeader, cx } from "../components/ui";
import { useAlerts, useConfig, useLatest, useMaintenance, useNow, useStatus } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { formatInterval, formatRelative } from "../lib/format";
import { pendingTasks } from "../lib/maintenance";
import {
  METRICS,
  METRIC_SCALE,
  OVERALL_COPY,
  type OverallState,
  activeAlerts,
  lastContact,
  metricState,
  overallState,
} from "../lib/status";

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

const OVERALL_STYLE: Record<OverallState, { icon: typeof CircleCheck; tile: string; card: string; title: string }> = {
  ok: { icon: CircleCheck, tile: "text-ok bg-ok-soft", card: "border-line bg-surface", title: "text-ink" },
  attention: { icon: TriangleAlert, tile: "text-warn bg-surface", card: "border-warn-line bg-warn-soft", title: "text-warn" },
  fault: { icon: CircleAlert, tile: "text-danger bg-surface", card: "border-line bg-danger-soft", title: "text-danger" },
  offline: { icon: WifiOff, tile: "text-neutral bg-neutral-soft", card: "border-line bg-surface", title: "text-ink" },
  waiting: { icon: Clock, tile: "text-neutral bg-neutral-soft", card: "border-line bg-surface", title: "text-ink" },
};

export function Overview() {
  const latestRaw = useLatest();
  const statusRaw = useStatus();
  const latest = latestRaw ?? null;
  const status = statusRaw ?? null;
  const config = useConfig();
  const alerts = useAlerts(50) ?? [];
  const now = useNow();

  const loading = latestRaw === undefined && statusRaw === undefined;
  const state = loading ? "waiting" : overallState(latest, status, config.thresholds, now);
  const copy = OVERALL_COPY[state];
  const style = OVERALL_STYLE[state];
  const StateIcon = style.icon;
  const last = lastContact(status, latest);
  const interval = status?.interval_s ?? config.interval_s;
  const { source } = useApp();
  const outOfRange = METRICS.filter((m) => metricState(m.key, latest, config.thresholds) === "attention").map(
    (m) => METRIC_SCALE[m.key].label,
  );
  const detail =
    state === "attention" && outOfRange.length
      ? `${outOfRange.join(" y ")} ${outOfRange.length > 1 ? "están" : "está"} fuera de su rango normal. Si el cambio persiste, inspecciona el tinaco o la instalación.`
      : copy.detail;
  const active = activeAlerts(alerts);
  const maintenance = useMaintenance();
  const overdue = maintenance === undefined ? [] : pendingTasks(maintenance, now);
  const noRecords = maintenance !== undefined && !Object.keys(maintenance ?? {}).length;

  return (
    <>
      <PageHeader
        title={greeting(now)}
        subtitle={last ? `Última lectura ${formatRelative(last, now)}` : "Sin lecturas recibidas"}
      />

      <section
        aria-live="polite"
        className={cx("mb-6 flex flex-wrap items-center gap-4 rounded-3xl border p-5 shadow-card md:gap-5 md:p-6", style.card)}
      >
        <div className={cx("flex size-14 shrink-0 items-center justify-center rounded-2xl", style.tile)}>
          <StateIcon className="size-7" strokeWidth={1.8} />
        </div>
        <div className="min-w-[14rem] flex-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <MapPin className="size-3.5" strokeWidth={1.8} />
            {source.kind === "demo" ? "Equipo de demostración" : `Equipo ${source.deviceId}`}
          </div>
          <h2 className={cx("mt-1 font-display text-2xl font-semibold tracking-tight md:text-[26px]", style.title)}>
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{detail}</p>
        </div>
        {state === "attention" && (
          <a
            href={href("alertas")}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-warn px-4 text-sm font-medium text-white hover:opacity-90 dark:text-bg"
          >
            Qué hacer <ArrowRight className="size-4" />
          </a>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((m) => (
          <MetricCard
            key={m.key}
            metric={m.key}
            latest={latest}
            thresholds={config.thresholds}
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
