import { Check, Moon, Sun } from "lucide-react";

import { Card, CardHeader, PageHeader, cx } from "../components/ui";
import { type Theme, useTheme } from "../lib/theme";

const OPTIONS: { value: Theme; label: string; detail: string; icon: typeof Sun; swatch: [string, string, string] }[] = [
  { value: "light", label: "Claro", detail: "Fondo blanco, ideal de día.", icon: Sun, swatch: ["#f4f8fb", "#ffffff", "#0b7a4f"] },
  { value: "dark", label: "Oscuro", detail: "Fondo oscuro, descansa la vista de noche.", icon: Moon, swatch: ["#0b1117", "#121a21", "#3ccf8e"] },
];

export function Settings() {
  const [theme, setTheme] = useTheme();

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Preferencias de esta app en este navegador." />

      <Card className="max-w-2xl">
        <CardHeader title="Apariencia" description="Elige cómo se ve Croak." />
        <div role="radiogroup" aria-label="Tema" className="grid gap-3 p-5 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const selected = theme === o.value;
            const [bg, card, accent] = o.swatch;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(o.value)}
                className={cx(
                  "rounded-2xl border p-3 text-left transition-colors",
                  selected ? "border-primary ring-1 ring-primary" : "border-line hover:border-line-strong",
                )}
              >
                <div className="flex h-20 gap-2 rounded-xl p-2.5" style={{ background: bg }} aria-hidden>
                  <div className="flex-1 rounded-lg p-2" style={{ background: card }}>
                    <div className="h-1.5 w-8 rounded-full" style={{ background: accent }} />
                    <div className="mt-2 h-1.5 w-14 rounded-full opacity-25" style={{ background: accent }} />
                  </div>
                  <div className="w-1/3 rounded-lg" style={{ background: card }} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Icon className="size-4 text-muted" strokeWidth={1.8} />
                  <span className="flex-1 text-sm font-medium text-ink">{o.label}</span>
                  {selected && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-on-primary">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">{o.detail}</p>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}
