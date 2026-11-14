import { useMemo } from "react";

import type { MetricKey, Reading, Thresholds } from "../lib/types";
import { band, calibrationText, formatMetric, metricInfo, metricState, rangeText } from "../lib/status";
import { TrendChart } from "./TrendChart";
import { Card, StatePill, cx } from "./ui";

const MIN_SPAN: Record<MetricKey, number> = { ph: 0.4, turbidity: 4, tds: 40 };

export function MetricCard({
  metric,
  latest,
  history,
  thresholds,
  now,
  windowMs,
  gapMs,
}: {
  metric: MetricKey;
  latest: Reading | null;
  history: Reading[];
  thresholds: Thresholds;
  now: number;
  windowMs: number;
  gapMs: number;
}) {
  const info = metricInfo(metric);
  const state = metricState(metric, latest, thresholds);
  const channel = latest?.[metric];
  const points = useMemo(() => history.map((r) => ({ t: r.ts, v: r[metric]?.value ?? null })), [history, metric]);
  // Si el dispositivo lleva poco tiempo enviando, la mini gráfica empieza en la primera lectura en vez de
  // dejar la línea apretada en el borde derecho.
  const from = Math.max(now - windowMs, Math.min(points[0]?.t ?? now, now - 60_000));

  return (
    <Card className="flex flex-col">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">{info.label}</h3>
          <StatePill state={state} />
        </div>
        <p className="mt-1 text-xs text-muted">{info.description}</p>
      </div>

      <div className="flex items-baseline gap-1.5 px-5 pt-4">
        <span
          className={cx(
            "font-mono text-[40px] leading-none font-medium tracking-tight tabular",
            state === "attention" ? "text-warn" : state === "fault" ? "text-subtle" : "text-ink",
          )}
        >
          {formatMetric(metric, channel?.value)}
        </span>
        {info.unit && <span className="text-base text-muted">{info.unit}</span>}
      </div>
      <p className="px-5 pt-1.5 text-xs text-muted">
        Intervalo configurado: <span className="text-ink">{rangeText(metric, thresholds)}</span>
      </p>

      <div className="mt-4 px-3">
        <TrendChart
          compact
          points={points}
          from={from}
          to={now}
          band={band(metric, thresholds)}
          decimals={info.decimals}
          unit={info.unit}
          minSpan={MIN_SPAN[metric]}
          gapMs={gapMs}
          height={56}
          label={`Tendencia de ${info.label} en los últimos 30 minutos`}
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-muted">
        <span>{calibrationText(metric, channel?.calibration)}</span>
        {channel && <span className="font-mono whitespace-nowrap text-subtle">{channel.sensor_v.toFixed(3)} V</span>}
      </div>
    </Card>
  );
}

export { MIN_SPAN };
