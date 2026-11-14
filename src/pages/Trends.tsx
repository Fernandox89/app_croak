import { Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { MIN_SPAN } from "../components/MetricCard";
import { TrendChart } from "../components/TrendChart";
import { Button, Card, PageHeader, Segmented } from "../components/ui";
import { useConfig, useHistory, useNow, useStatus } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { NOM127 } from "../lib/guidance";
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
          <p className="mt-0.5 text-xs text-subtle">Referencia {NOM127[info.key]}.</p>
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

// Historial del periodo en CSV: sirve para comparar contra un análisis de laboratorio o integrarlo a una
// bitácora. Separado por comas, con punto decimal y hora local en ISO.
function downloadCsv(history: Reading[], deviceId: string, range: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "" : String(v));
  const rows = [
    ["fecha_hora_local", "ph", "estado_ph", "turbidez_rel_pct", "estado_turbidez", "tds_ppm", "estado_tds", "temp_c", "fuente_temp"],
    ...history.map((r) => [
      local(r.ts),
      num(r.ph?.value),
      r.ph?.status ?? "",
      num(r.turbidity?.value),
      r.turbidity?.status ?? "",
      num(r.tds?.value),
      r.tds?.status ?? "",
      num(r.temp_c),
      r.temp_source ?? "",
    ]),
  ];
  const csv = rows.map((r) => r.join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  const d = new Date();
  a.href = url;
  a.download = `${deviceId.startsWith("croak") ? deviceId : `croak-${deviceId}`}-${range}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Trends() {
  const { source } = useApp();
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
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Periodo"
              value={range}
              onChange={setRange}
              options={RANGES.map(({ value, label }) => ({ value, label }))}
            />
            <Button
              onClick={() => downloadCsv(history ?? [], source.deviceId, range)}
              disabled={!history?.length}
              title="Descargar las lecturas del periodo en CSV"
            >
              <Download className="size-4" strokeWidth={1.8} /> CSV
            </Button>
            <a
              href="#/reporte"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt"
            >
              <FileText className="size-4" strokeWidth={1.8} /> Reporte
            </a>
          </div>
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
