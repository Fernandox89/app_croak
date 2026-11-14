import { useEffect, useState } from "react";

import { DEMO_SCENARIOS, type DemoScenario, DemoSource } from "../lib/demo";
import { cx } from "./ui";

/** Botones para cambiar el escenario del simulador. */
export function ScenarioPicker({ source }: { source: DemoSource }) {
  const [scenario, setScenario] = useState<DemoScenario>(source.getScenario());

  useEffect(() => {
    setScenario(source.getScenario());
    return source.subscribeScenario(setScenario);
  }, [source]);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {DEMO_SCENARIOS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => source.setScenario(s.id)}
          aria-pressed={scenario === s.id}
          className={cx(
            "rounded-xl border px-4 py-3 text-left transition-colors",
            scenario === s.id ? "border-primary bg-primary-soft" : "border-line hover:bg-surface-alt",
          )}
        >
          <div className={cx("text-sm font-medium", scenario === s.id ? "text-primary" : "text-ink")}>{s.label}</div>
          <div className="mt-0.5 text-xs text-muted">{s.description}</div>
        </button>
      ))}
    </div>
  );
}
