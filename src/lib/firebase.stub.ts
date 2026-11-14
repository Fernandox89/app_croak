// Sustituye a firebase.ts en la edición demo (ver vite.config.ts): la demo pública no incluye el SDK ni los
// datos del proyecto, así que no puede leer ni escribir nada del servidor.
import type { DataSource } from "./source";

export const firebaseConfigured = false;

function unavailable(): never {
  throw new Error("La edición demo no tiene servidor de datos");
}

export const watchUser = unavailable;
export const signIn = unavailable;
export const signOut = unavailable;
export const resetPassword = unavailable;
export const authErrorMessage = (): string => "";
export const subscribeMyDevices = unavailable;
export const createFirebaseSource = (_deviceId: string): DataSource => unavailable();
