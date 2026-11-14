import { CircleCheck, CircleAlert, TriangleAlert } from "lucide-react";

import { formatRelative, formatTime } from "../lib/format";
import { guidanceFor } from "../lib/guidance";
import { ALERT_PARAM_LABEL } from "../lib/status";
import type { AlertEvent } from "../lib/types";
import { cx } from "./ui";

export function AlertRow({
  alert,
  now,
  showTime,
  showGuidance,
}: {
  alert: AlertEvent;
  now: number;
  showTime?: boolean;
  showGuidance?: boolean;
}) {
  const guidance = showGuidance ? guidanceFor(alert) : [];
  const isSensor = alert.param.startsWith("sensor_");
  const Icon = !alert.active ? CircleCheck : isSensor ? CircleAlert : TriangleAlert;
  const tone = !alert.active ? "text-ok bg-ok-soft" : isSensor ? "text-danger bg-danger-soft" : "text-warn bg-warn-soft";
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <div className={cx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="size-4" strokeWidth={1.9} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink">
            {ALERT_PARAM_LABEL[alert.param] ?? alert.param}
            <span className="ml-2 font-normal text-muted">{alert.active ? "Alerta" : "Normalizado"}</span>
          </p>
          <time className="shrink-0 font-mono text-xs text-subtle" dateTime={new Date(alert.ts).toISOString()}>
            {showTime ? formatTime(alert.ts) : formatRelative(alert.ts, now)}
          </time>
        </div>
        <p className="mt-0.5 text-sm leading-snug text-muted">{alert.message}</p>
        {guidance.length > 0 && (
          <div className="mt-2.5 rounded-xl bg-surface-alt px-3.5 py-2.5">
            <p className="text-xs font-medium tracking-wide text-ink uppercase">Qué hacer</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-snug text-muted marker:text-subtle">
              {guidance.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}
