import { useState } from "react";

import { href } from "./AppShell";
import { useApp } from "../lib/app-context";
import { Button, Card, CardHeader } from "./ui";

// Borrado del historial a petición del usuario (ETSI EN 303 645, disposición 5.11). Pide confirmación en dos
// pasos porque no se puede deshacer, y sugiere descargar el CSV antes.
export function ClearHistoryCard() {
  const { source } = useApp();
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");

  async function clear() {
    setStep("busy");
    try {
      await source.clearHistory();
      setStep("done");
    } catch {
      setStep("error");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Tus datos"
        description="Puedes borrar el historial de lecturas y alertas de este dispositivo. La configuración y el mantenimiento se conservan."
      />
      <div className="space-y-3 px-5 py-4">
        {step === "confirm" || step === "busy" ? (
          <div className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3">
            <p className="text-sm font-medium text-danger">¿Borrar todo el historial? No se puede deshacer.</p>
            <p className="mt-1 text-[13px] text-muted">
              Si lo necesitas, primero{" "}
              <a href={href("tendencias")} className="font-medium text-primary hover:underline">
                descarga el CSV en Tendencias
              </a>
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clear}
                disabled={step === "busy"}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-bg"
              >
                {step === "busy" ? "Borrando…" : "Sí, borrar historial"}
              </button>
              <Button onClick={() => setStep("idle")} disabled={step === "busy"}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setStep("confirm")}>Borrar historial</Button>
        )}
        {step === "done" && <p className="text-sm text-ok">Historial borrado. Las lecturas nuevas seguirán llegando.</p>}
        {step === "error" && <p className="text-sm text-danger">No se pudo borrar. Revisa la conexión.</p>}
      </div>
    </Card>
  );
}
