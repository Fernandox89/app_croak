import { useEffect, useMemo, useRef, useState } from "react";

import { formatDateTime, formatNumber, formatTime, formatTimeSec } from "../lib/format";

export interface Point {
  t: number;
  v: number | null;
}

interface Props {
  points: Point[];
  from: number;
  to: number;
  band?: { min?: number; max?: number };
  decimals: number;
  unit: string;
  /** Rango mínimo del eje Y, para que el ruido no parezca un cambio grande. */
  minSpan: number;
  /** Separación entre lecturas a partir de la cual la línea se corta (dispositivo apagado). */
  gapMs: number;
  height?: number;
  compact?: boolean;
  label: string;
}

const PAD_FULL = { top: 12, right: 12, bottom: 26, left: 44 };
const PAD_COMPACT = { top: 4, right: 2, bottom: 4, left: 2 };

function niceStep(span: number, count: number) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

// Promedia en cubetas para no dibujar miles de puntos en una pantalla de 400 px.
function downsample(points: Point[], buckets: number, from: number, to: number): Point[] {
  if (points.length <= buckets * 1.5) return points;
  const size = (to - from) / buckets;
  const out: Point[] = [];
  let i = 0;
  for (let b = 0; b < buckets; b++) {
    const end = from + (b + 1) * size;
    let sum = 0;
    let n = 0;
    let tSum = 0;
    let sawNull = false;
    while (i < points.length && points[i].t < end) {
      const p = points[i++];
      if (p.v === null) sawNull = true;
      else {
        sum += p.v;
        tSum += p.t;
        n++;
      }
    }
    if (n) out.push({ t: tSum / n, v: sum / n });
    else if (sawNull) out.push({ t: from + (b + 0.5) * size, v: null });
  }
  return out;
}

export function TrendChart({ points, from, to, band, decimals, unit, minSpan, gapMs, height = 220, compact, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Point | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = compact ? PAD_COMPACT : PAD_FULL;
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const data = useMemo(() => {
    const visible = points.filter((p) => p.t >= from && p.t <= to);
    return downsample(visible, Math.max(40, Math.floor(innerW / 2)), from, to);
  }, [points, from, to, innerW]);

  const domain = useMemo(() => {
    const vals = data.filter((p) => p.v !== null).map((p) => p.v as number);
    if (!vals.length) return null;
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const span = Math.max(hi - lo, minSpan);
    // Incluye un límite configurado solo si los datos se acercan a él; si no, aplastaría la línea.
    for (const edge of [band?.min, band?.max]) {
      if (edge === undefined) continue;
      if (edge > hi && edge - hi < span * 1.5) hi = edge;
      if (edge < lo && lo - edge < span * 1.5) lo = edge;
    }
    const mid = (lo + hi) / 2;
    const half = Math.max(hi - lo, minSpan) / 2;
    return { lo: mid - half * 1.15, hi: mid + half * 1.15 };
  }, [data, band?.min, band?.max, minSpan]);

  const x = (t: number) => pad.left + ((t - from) / (to - from)) * innerW;
  const y = (v: number) => (domain ? pad.top + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * innerH : 0);

  const path = useMemo(() => {
    if (!domain || !innerW) return "";
    let d = "";
    let prev: Point | null = null;
    for (const p of data) {
      if (p.v === null) {
        prev = null;
        continue;
      }
      const cmd = !prev || p.t - prev.t > gapMs ? "M" : "L";
      d += `${cmd}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      prev = p;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, domain, innerW, height, gapMs, from, to]);

  const yTicks = useMemo(() => {
    if (!domain || compact) return [];
    const step = niceStep(domain.hi - domain.lo, 4);
    const ticks: number[] = [];
    for (let v = Math.ceil(domain.lo / step) * step; v <= domain.hi; v += step) ticks.push(v);
    return ticks;
  }, [domain, compact]);

  const xTicks = useMemo(() => {
    if (compact || !innerW) return [];
    const n = innerW < 360 ? 3 : 5;
    return Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 0.5)) / n);
  }, [compact, innerW, from, to]);

  const tickDecimals = yTicks.length > 1 ? Math.max(0, -Math.floor(Math.log10(yTicks[1] - yTicks[0]))) : 0;
  const shortRange = to - from <= 30 * 60 * 1000;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (compact || !data.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = from + ((e.clientX - rect.left - pad.left) / innerW) * (to - from);
    let best: Point | null = null;
    for (const p of data) {
      if (p.v === null) continue;
      if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    }
    setHover(best);
  }

  const bandTop = band?.max !== undefined && domain ? y(Math.min(band.max, domain.hi)) : pad.top;
  const bandBottom = band?.min !== undefined && domain ? y(Math.max(band.min, domain.lo)) : pad.top + innerH;
  const fmt = (v: number) => `${formatNumber(v, decimals)}${unit ? ` ${unit}` : ""}`;

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          className="block touch-pan-y"
        >
          {domain && band && !compact && bandBottom > bandTop && (
            <rect x={pad.left} y={bandTop} width={innerW} height={bandBottom - bandTop} fill="var(--c-band)" />
          )}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={pad.left + innerW} y1={y(v)} y2={y(v)} stroke="var(--c-border)" />
              <text x={pad.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-subtle font-mono text-[11px]">
                {formatNumber(v, tickDecimals)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="fill-subtle font-mono text-[11px]">
              {formatTime(t)}
            </text>
          ))}
          {domain && band && !compact &&
            [band.min, band.max].map(
              (edge) =>
                edge !== undefined &&
                edge >= domain.lo &&
                edge <= domain.hi && (
                  <line
                    key={edge}
                    x1={pad.left}
                    x2={pad.left + innerW}
                    y1={y(edge)}
                    y2={y(edge)}
                    stroke="var(--c-primary)"
                    strokeOpacity={0.45}
                    strokeDasharray="4 4"
                  />
                ),
            )}
          <path
            d={path}
            fill="none"
            stroke="var(--c-chart)"
            strokeWidth={compact ? 1.75 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover && hover.v !== null && domain && (
            <g>
              <line x1={x(hover.t)} x2={x(hover.t)} y1={pad.top} y2={pad.top + innerH} stroke="var(--c-border-strong)" />
              <circle cx={x(hover.t)} cy={y(hover.v)} r={4} fill="var(--c-surface)" stroke="var(--c-chart)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {!compact && hover && hover.v !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-card"
          style={{ left: Math.min(Math.max(x(hover.t) - 60, 0), width - 130) }}
        >
          <div className="font-mono font-medium text-ink">{fmt(hover.v)}</div>
          <div className="text-subtle">{shortRange ? formatTimeSec(hover.t) : formatDateTime(hover.t)}</div>
        </div>
      )}
      {!domain && width > 0 && !compact && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-subtle">
          Sin lecturas en este periodo
        </div>
      )}
    </div>
  );
}
