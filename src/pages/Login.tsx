import { ArrowLeft } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "../components/ui";
import { authErrorMessage, resetPassword, signIn } from "../lib/firebase";

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] text-ink outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}

export function Login() {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await resetPassword(email);
        setNotice("Si el correo tiene una cuenta, recibirás un enlace para crear una contraseña nueva.");
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (mode === "reset" && code === "auth/user-not-found") {
        setNotice("Si el correo tiene una cuenta, recibirás un enlace para crear una contraseña nueva.");
      } else {
        setError(authErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "signin" | "reset") {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <img src="icons/logo.png" alt="" className="size-9 rounded-lg" />
          <span className="font-display text-xl font-bold tracking-tight text-ink">Croak</span>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card">
          {mode === "signin" ? (
            <>
              <h1 className="font-display text-xl font-semibold text-ink">Inicia sesión</h1>
              <p className="mt-1 text-sm text-muted">Usa la cuenta que te dio el equipo de Croak.</p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
              >
                <ArrowLeft className="size-4" /> Volver
              </button>
              <h1 className="font-display text-xl font-semibold text-ink">Restablecer contraseña</h1>
              <p className="mt-1 text-sm text-muted">Te enviaremos un enlace al correo de tu cuenta.</p>
            </>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate={false}>
            <Field label="Correo" type="email" value={email} onChange={setEmail} autoComplete="username" />
            {mode === "signin" && (
              <Field
                label="Contraseña"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            )}
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-ok" role="status">
                {notice}
              </p>
            )}
            <Button type="submit" variant="primary" className="h-11 w-full" disabled={busy}>
              {busy ? "Un momento…" : mode === "signin" ? "Entrar" : "Enviar enlace"}
            </Button>
          </form>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-subtle">Acceso restringido al equipo y a usuarios del piloto.</p>
      </div>
    </div>
  );
}
