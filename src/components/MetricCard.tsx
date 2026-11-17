import { ChevronDown } from "lucide-react";

import type { MetricKey, Reading, Thresholds } from "../lib/types";
import {
  METRIC_SCALE,
  band,
  calibrationText,
  formatMetric,
  metricInfo,
  metricState,
  outOfRangeSide,
  rangeText,
} from "../lib/status";
import { Card, StatePill, cx } from "./ui";

const MIN_SPAN: Record<MetricKey, number> = { ph: 0.4, turbidity: 4, tds: 40 };

const pct = (v: number, [lo, hi]: [number, number]) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));

/** Barra horizontal con la zona normal sombreada y un punto en el valor actual. */
function RangeBar({ metric, value, thresholds, warn }: { metric: MetricKey; value: number | null | undefined; thresholds: Thresholds; warn: boolean }) {
  const scale = METRIC_SCALE[metric];
  const domain = scale.domain(thresholds);
  const b = band(metric, thresholds);
  const zoneFrom = pct(b.min ?? domain[0], domain);
  const zoneTo = pct(b.max ?? domain[1], domain);
  const has = value !== null && value !== undefined && !Number.isNaN(value);

  return (
    <div>
      <div className="relative mt-4 h-2 rounded-full bg-surface-alt" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-ok-soft ring-1 ring-ok/15" style={{ left: `${zoneFrom}%`, width: `${zoneTo - zoneFrom}%` }} />
        {has && (
          <div
            className={cx(
              "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-sm transition-[left] duration-500",
              warn ? "bg-warn" : "bg-water",
            )}
            style={{ left: `${pct(value, domain)}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-xs text-muted">
        <span>{scale.low}</span>
        <span className="text-ink">Normal: {rangeText(metric, thresholds)}</span>
        <span>{scale.high}</span>
      </div>
    </div>
  );
}

export function MetricCard({ metric, latest, thresholds }: { metric: MetricKey; latest: Reading | null; thresholds: Thresholds }) {
  const info = metricInfo(metric);
  const scale = METRIC_SCALE[metric];
  const state = metricState(metric, latest, thresholds);
  const side = outOfRangeSide(metric, latest, thresholds);
  const channel = latest?.[metric];
  const feminine = metric === "turbidity";
  const pillLabel = side === "high" ? (feminine ? "Alta" : "Alto") : side === "low" ? (feminine ? "Baja" : "Bajo") : undefined;

  return (
    <Card className={cx("flex flex-col", state === "attention" && "border-warn-line")}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">{scale.label}</h3>
          <StatePill state={state} label={pillLabel} />
        </div>
      </div>

      <div className="flex items-baseline gap-1.5 px-5 pt-3">
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

      <div className="px-5 pb-4">
        <RangeBar metric={metric} value={state === "fault" ? null : channel?.value} thresholds={thresholds} warn={state === "attention"} />
      </div>

      <details className="group mt-auto border-t border-line text-xs text-muted">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 hover:text-ink [&::-webkit-details-marker]:hidden">
          Detalles técnicos
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.8} />
        </summary>
        <dl className="space-y-1.5 px-5 pb-4">
          <div className="flex justify-between gap-3">
            <dt>Qué mide</dt>
            <dd className="text-right text-ink">{info.description}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Calibración</dt>
            <dd className="text-right text-ink">{calibrationText(metric, channel?.calibration)}</dd>
          </div>
          {channel && (
            <div className="flex justify-between gap-3">
              <dt>Voltaje del sensor</dt>
              <dd className="font-mono text-ink">{channel.sensor_v.toFixed(3)} V</dd>
            </div>
          )}
        </dl>
      </details>
    </Card>
  );
}

export { MIN_SPAN };
