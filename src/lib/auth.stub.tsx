// Sustituye a auth.tsx en la edición demo (ver vite.config.ts): no hay cuentas ni inicio de sesión.
import type { ReactNode } from "react";

export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth(): { user: { uid: string; email: string | null }; signOut: () => Promise<void> } | null {
  return null;
}
