import { Check } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { Badge, Button, Card, CardHeader, DataRow, PageHeader, Segmented, Toggle, cx } from "../components/ui";
import { useConfig, useLatest, useNow, useStatus } from "../hooks/data";
import { useApp } from "../lib/app-context";
import { DEMO_SCENARIOS, type DemoScenario, DemoSource } from "../lib/demo";
import { formatDuration, formatInterval, formatRelative, rssiQuality } from "../lib/format";
import { calibrationText, isOnline, lastContact } from "../lib/status";
import { DEFAULT_CONFIG, type Thresholds } from "../lib/types";

const INTERVALS = [10, 30, 60, 300, 900];

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <div className="mt-1.5 flex items-center rounded-xl border border-line-strong bg-surface focus-within:border-primary">
        <input
          type="number"
          inputMode="decimal"
          className="h-10 w-full min-w-0 bg-transparent px-3 font-mono text-[15px] text-ink outline-none"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        {suffix && <span className="pr-3 text-sm text-subtle">{suffix}</span>}
      </div>
    </label>
  );
}

function validate(t: Thresholds): string | null {
  if ([t.ph_min, t.ph_max, t.tds_max, t.turbidity_max, t.persist].some((v) => !Number.isFinite(v))) {
    return "Completa todos los campos.";
  }
  if (t.ph_min < 0 || t.ph_max > 14 || t.ph_min >= t.ph_max) return "El pH mínimo debe ser menor que el máximo, entre 0 y 14.";
  if (t.tds_max <= 0 || t.tds_max > 5000) return "El TDS máximo debe estar entre 1 y 5000 ppm.";
  if (t.turbidity_max <= 0 || t.turbidity_max > 100) return "La turbidez máxima debe estar entre 1 y 100 %.";
  if (t.persist < 1 || t.persist > 20 || !Number.isInteger(t.persist)) return "Las lecturas seguidas deben ser un entero entre 1 y 20.";
  return null;
}

function SavedNote({ show }: { show: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 text-sm text-ok transition-opacity", show ? "opacity-100" : "opacity-0")}>
      <Check className="size-4" /> Guardado
    </span>
  );
}

function useFlag(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), 2500);
    return () => clearTimeout(id);
  }, [on]);
  return [on, () => setOn(true)];
}

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={action} />
      {children}
    </Card>
  );
}

function ThresholdsForm() {
  const { source } = useApp();
  const config = useConfig();
  const [draft, setDraft] = useState<Thresholds>(config.thresholds);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, flagSaved] = useFlag();

  useEffect(() => {
    if (!dirty) setDraft(config.thresholds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config.thresholds)]);

  const set = (k: keyof Thresholds) => (v: number) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validate(draft);
    if (err) return setError(err);
    setSaving(true);
    try {
      await source.saveConfig({ interval_s: config.interval_s, thresholds: draft });
      setDirty(false);
      flagSaved();
    } catch {
      setError("No se pudo guardar. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Intervalos de alerta"
      description="Son valores de referencia para avisar de cambios, no límites sanitarios oficiales. El dispositivo los aplica en menos de un minuto."
    >
      <form onSubmit={submit} className="px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="pH mínimo" value={draft.ph_min} onChange={set("ph_min")} step={0.1} min={0} max={14} />
          <NumberField label="pH máximo" value={draft.ph_max} onChange={set("ph_max")} step={0.1} min={0} max={14} />
          <NumberField label="TDS máximo" value={draft.tds_max} onChange={set("tds_max")} step={10} min={1} max={5000} suffix="ppm" />
          <NumberField label="Turbidez máxima" value={draft.turbidity_max} onChange={set("turbidity_max")} step={1} min={1} max={100} suffix="%" />
          <NumberField label="Lecturas seguidas" value={draft.persist} onChange={set("persist")} step={1} min={1} max={20} />
        </div>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={!dirty || saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(DEFAULT_CONFIG.thresholds);
              setDirty(true);
              setError(null);
            }}
          >
            Restablecer valores
          </Button>
          <SavedNote show={saved} />
        </div>
      </form>
    </Section>
  );
}

function IntervalSection() {
  const { source } = useApp();
  const config = useConfig();
  const [saved, flagSaved] = useFlag();
  const [error, setError] = useState(false);

  async function choose(s: number) {
    setError(false);
    try {
      await source.saveConfig({ ...config, interval_s: s });
      flagSaved();
    } catch {
      setError(true);
    }
  }

  return (
    <Section
      title="Frecuencia de medición"
      description="Intervalos cortos sirven para pruebas y demostraciones; para uso continuo basta con 5 o 15 minutos."
      action={<SavedNote show={saved} />}
    >
      <div className="flex flex-wrap gap-2 px-5 py-4">
        {INTERVALS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => choose(s)}
            aria-pressed={config.interval_s === s}
            className={cx(
              "h-9 rounded-xl border px-3.5 text-sm font-medium transition-colors",
              config.interval_s === s
                ? "border-primary bg-primary-soft text-primary"
                : "border-line-strong text-muted hover:bg-surface-alt hover:text-ink",
            )}
          >
            {formatInterval(s)}
          </button>
        ))}
      </div>
      {error && <p className="px-5 pb-4 text-sm text-danger">No se pudo guardar. Revisa la conexión.</p>}
    </Section>
  );
}

function NotificationsSection() {
  const { prefs, setPrefs } = useApp();
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState(supported ? Notification.permission : "denied");

  async function toggle(on: boolean) {
    if (!on) return setPrefs({ notifications: false });
    if (!supported) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    setPrefs({ notifications: p === "granted" });
  }

  return (
    <Section
      title="Notificaciones en este dispositivo"
      description="Avisos del sistema cuando se genera una alerta, mientras la app esté abierta o en segundo plano. Para recibir avisos con la app cerrada, configura el bot de Telegram del firmware."
      action={<Toggle checked={prefs.notifications && permission === "granted"} onChange={toggle} label="Notificaciones" />}
    >
      {!supported && <p className="px-5 py-3 text-sm text-muted">Este navegador no admite notificaciones.</p>}
      {supported && permission === "denied" && (
        <p className="px-5 py-3 text-sm text-muted">
          Las notificaciones están bloqueadas para este sitio. Actívalas en la configuración del navegador.
        </p>
      )}
    </Section>
  );
}

function SourceSection() {
  const { prefs, setPrefs, source, firebaseConfigured } = useApp();
  const [deviceId, setDeviceId] = useState(prefs.deviceId);
  const [scenario, setScenario] = useState<DemoScenario | null>(
    source instanceof DemoSource ? source.getScenario() : null,
  );

  useEffect(() => {
    if (!(source instanceof DemoSource)) return setScenario(null);
    setScenario(source.getScenario());
    return source.subscribeScenario(setScenario);
  }, [source]);

  return (
    <Section title="Fuente de datos">
      <div className="space-y-4 px-5 py-4">
        <Segmented
          label="Fuente de datos"
          value={prefs.mode}
          onChange={(mode) => setPrefs({ mode })}
          options={
            firebaseConfigured
              ? [
                  { value: "device", label: "Dispositivo" },
                  { value: "demo", label: "Demostración" },
                ]
              : [{ value: "demo", label: "Demostración" }]
          }
        />
        {!firebaseConfigured && (
          <p className="text-sm text-muted">
            Esta versión de la app no tiene configurado un servidor de datos, así que solo puede mostrar la
            demostración.
          </p>
        )}
        {prefs.mode === "device" && firebaseConfigured && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const id = deviceId.trim();
              if (id) setPrefs({ deviceId: id });
            }}
          >
            <label className="block">
              <span className="text-sm text-muted">Identificador del dispositivo</span>
              <input
                className="mt-1.5 h-10 w-56 rounded-xl border border-line-strong bg-surface px-3 font-mono text-[15px] text-ink outline-none focus:border-primary"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <Button type="submit" disabled={deviceId.trim() === prefs.deviceId}>
              Aplicar
            </Button>
          </form>
        )}
      </div>

      {source instanceof DemoSource && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="text-sm font-medium text-ink">Escenario de demostración</h3>
          <p className="mt-0.5 text-sm text-muted">Simula situaciones para mostrar cómo responde la app.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
        </div>
      )}
    </Section>
  );
}

export function Device() {
  const { source } = useApp();
  const latest = useLatest() ?? null;
  const status = useStatus() ?? null;
  const now = useNow(5000);
  const online = isOnline(status, latest, now);
  const last = lastContact(status, latest);

  return (
    <>
      <PageHeader title="Dispositivo" subtitle={<span className="font-mono">{source.deviceId}</span>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Section title="Estado">
            <dl className="divide-y divide-line">
              <DataRow
                label="Conexión"
                value={<Badge tone={online ? "ok" : "neutral"}>{online ? "En línea" : "Sin conexión"}</Badge>}
                hint={last ? `Última comunicación ${formatRelative(last, now)}` : "Sin comunicación registrada"}
              />
              <DataRow
                label="Señal WiFi"
                value={status ? `${rssiQuality(status.rssi)}` : "—"}
                hint={status ? `${status.rssi} dBm` : undefined}
              />
              <DataRow label="Firmware" value={<span className="font-mono">{status?.fw ?? latest?.fw ?? "—"}</span>} />
              <DataRow label="Dirección IP" value={<span className="font-mono">{status?.ip ?? "—"}</span>} />
              <DataRow label="Tiempo encendido" value={status ? formatDuration(status.uptime_s) : "—"} />
              <DataRow
                label="Lecturas pendientes de envío"
                value={<span className="font-mono">{status?.pending_readings ?? "—"}</span>}
              />
            </dl>
          </Section>

          <Section
            title="Calibración"
            description="La calibración se realiza desde la consola serial del dispositivo y viaja con cada lectura."
          >
            <dl className="divide-y divide-line">
              <DataRow label="pH" value={calibrationText("ph", latest?.ph.calibration)} />
              <DataRow label="Turbidez" value={calibrationText("turbidity", latest?.turbidity.calibration)} />
              <DataRow label="Sólidos disueltos" value={calibrationText("tds", latest?.tds.calibration)} />
              <DataRow
                label="Compensación de temperatura"
                value={latest?.temp_source === "ds18b20" ? "Sensor DS18B20" : "Supuesta a 25 °C"}
              />
            </dl>
          </Section>

          <SourceSection />
        </div>

        <div className="flex flex-col gap-4">
          <IntervalSection />
          <ThresholdsForm />
          <NotificationsSection />
          <Section title="Acerca de Croak">
            <div className="space-y-2 px-5 py-4 text-sm leading-relaxed text-muted">
              <p>
                Croak mide pH, turbidez y sólidos disueltos totales en la línea de agua de tu instalación y avisa
                cuando un indicador cambia.
              </p>
              <p>
                No determina si el agua es potable ni detecta microorganismos, metales u otros contaminantes
                específicos. La turbidez se reporta como índice relativo, no en NTU.
              </p>
              <p className="pt-1 font-mono text-xs text-subtle">App {__APP_VERSION__}</p>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
