import type { User } from "firebase/auth";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { Login } from "../pages/Login";
import { firebaseConfigured, signOut, watchUser } from "./firebase";

interface AuthValue {
  user: User;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <img src="icons/logo.png" alt="Croak" className="size-12 animate-pulse rounded-xl" />
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-lg font-semibold text-ink">Falta configurar el servidor</h1>
        <p className="mt-2 text-sm text-muted">
          Esta compilación no tiene los datos del proyecto de Firebase. Revisa el archivo .env.local.
        </p>
      </div>
    </div>
  );
}

// La app del equipo solo se muestra con una sesión abierta. Al cerrar sesión se desmonta todo lo de adentro,
// incluidas las conexiones a la base de datos.
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(firebaseConfigured ? undefined : null);
  useEffect(() => (firebaseConfigured ? watchUser(setUser) : undefined), []);

  if (!firebaseConfigured) return <NotConfigured />;
  if (user === undefined) return <Splash />;
  if (user === null) return <Login />;
  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}

/** Sesión actual. Fuera de AuthGate (edición demo) es null. */
export function useAuth() {
  return useContext(AuthContext);
}
