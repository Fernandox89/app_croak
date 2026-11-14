import { ArrowUpRight } from "lucide-react";

import { ScenarioPicker } from "../components/ScenarioPicker";
import { Card, CardHeader, DataRow, PageHeader } from "../components/ui";
import { useConfig } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { DemoSource } from "../lib/demo";
import { LANDING_URL } from "../lib/edition";
import { formatInterval } from "../lib/format";
import { METRICS, rangeText } from "../lib/status";

// Página de la edición demo en lugar de "Dispositivo": aquí no hay hardware que administrar.
export function Simulation() {
  const { source } = useApp();
  const config = useConfig();

  return (
    <>
      <PageHeader
        title="Simulación"
        subtitle="Elige una situación y observa cómo responden el panel, las tendencias y las alertas."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Escenarios"
            description="Cada escenario cambia gradualmente las lecturas simuladas, como ocurriría en una instalación real."
          />
          <div className="px-5 py-4">{source instanceof DemoSource && <ScenarioPicker source={source} />}</div>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Intervalos de alerta"
              description="Valores de referencia que usa la simulación. No son límites sanitarios oficiales."
            />
            <dl className="divide-y divide-line">
              {METRICS.map((m) => (
                <DataRow key={m.key} label={m.label} value={rangeText(m.key, config.thresholds)} />
              ))}
              <DataRow
                label="Lecturas seguidas para alertar"
                value={<span className="font-mono">{config.thresholds.persist}</span>}
              />
              <DataRow label="Frecuencia simulada" value={formatInterval(config.interval_s)} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Acerca de esta demostración" />
            <div className="space-y-2 px-5 py-4 text-sm leading-relaxed text-muted">
              <p>
                Croak es un monitor de pH, turbidez y sólidos disueltos para la línea de agua de una vivienda. Esta
                demostración usa datos simulados con el mismo formato y las mismas reglas de alerta que el
                prototipo.
              </p>
              <p>
                No determina si el agua es potable ni detecta microorganismos, metales u otros contaminantes
                específicos.
              </p>
              <a
                href={LANDING_URL}
                className="inline-flex items-center gap-1 pt-1 font-medium text-primary hover:underline"
              >
                Conocer el proyecto <ArrowUpRight className="size-4" />
              </a>
              <p className="pt-1 font-mono text-xs text-subtle">Demo {__APP_VERSION__}</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
