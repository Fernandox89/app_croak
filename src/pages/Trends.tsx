import { useMemo, useState } from "react";

import { MIN_SPAN } from "../components/MetricCard";
import { TrendChart } from "../components/TrendChart";
import { Card, PageHeader, Segmented } from "../components/ui";
import { useConfig, useHistory, useNow, useStatus } from "../hooks/data";
import { band, formatMetric, METRICS, type MetricInfo, rangeText } from "../lib/status";
import type { Reading, Thresholds } from "../lib/types";

type Range = "15m" | "1h" | "6h" | "24h";

const RANGES: { value: Range; label: string; ms: number }[] = [
  { value: "15m", label: "15 min", ms: 15 * 60_000 },
  { value: "1h", label: "1 h", ms: 60 * 60_000 },
  { value: "6h", label: "6 h", ms: 6 * 60 * 60_000 },
  { value: "24h", label: "24 h", ms: 24 * 60 * 60_000 },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] font-medium text-ink tabular">{value}</dd>
    </div>
  );
}

function MetricTrend({
  info,
  history,
  thresholds,
  from,
  to,
  gapMs,
}: {
  info: MetricInfo;
  history: Reading[];
  thresholds: Thresholds;
  from: number;
  to: number;
  gapMs: number;
}) {
  const points = useMemo(() => history.map((r) => ({ t: r.ts, v: r[info.key]?.value ?? null })), [history, info.key]);
  const stats = useMemo(() => {
    const vals = points.filter((p) => p.t >= from && p.v !== null).map((p) => p.v as number);
    if (!vals.length) return null;
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      count: vals.length,
    };
  }, [points, from]);
  const unit = info.unit ? ` ${info.unit}` : "";
  const fmt = (v: number | undefined) => (v === undefined ? "—" : formatMetric(info.key, v) + unit);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-5 pt-5">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink">{info.label}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {info.description}. Intervalo configurado: {rangeText(info.key, thresholds)}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-6">
          <Stat label="Mínimo" value={fmt(stats?.min)} />
          <Stat label="Promedio" value={fmt(stats?.avg)} />
          <Stat label="Máximo" value={fmt(stats?.max)} />
        </dl>
      </div>
      <div className="px-2 pt-4 pb-3 md:px-3">
        <TrendChart
          points={points}
          from={from}
          to={to}
          band={band(info.key, thresholds)}
          decimals={info.decimals}
          unit={info.unit}
          minSpan={MIN_SPAN[info.key]}
          gapMs={gapMs}
          label={`Tendencia de ${info.label}`}
        />
      </div>
    </Card>
  );
}

export function Trends() {
  const [range, setRange] = useState<Range>("1h");
  const windowMs = RANGES.find((r) => r.value === range)!.ms;
  const history = useHistory(windowMs);
  const config = useConfig();
  const status = useStatus() ?? null;
  const now = useNow(range === "15m" ? 1000 : 10_000);
  const interval = status?.interval_s ?? config.interval_s;
  // En rangos largos el historial puede venir promediado; la línea solo se corta en huecos reales.
  const gapMs = Math.max(interval * 3000, windowMs / 60, 180_000);

  return (
    <>
      <PageHeader
        title="Tendencias"
        subtitle={
          history === undefined
            ? "Cargando historial"
            : `${history.length.toLocaleString("es-MX")} lecturas en el periodo. La banda sombreada es el intervalo configurado.`
        }
        action={
          <Segmented
            label="Periodo"
            value={range}
            onChange={setRange}
            options={RANGES.map(({ value, label }) => ({ value, label }))}
          />
        }
      />
      <div className="flex flex-col gap-4">
        {METRICS.map((m) => (
          <MetricTrend
            key={m.key}
            info={m}
            history={history ?? []}
            thresholds={config.thresholds}
            from={now - windowMs}
            to={now}
            gapMs={gapMs}
          />
        ))}
      </div>
    </>
  );
}
