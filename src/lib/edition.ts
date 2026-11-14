// Edición que se compila. Vite reemplaza VITE_EDITION al construir, así que el código de la otra edición
// queda fuera del paquete.
//   demo: demostración pública que enlaza la landing. Solo datos simulados, sin servidor ni configuración.
//   full: app del equipo. Inicio de sesión, datos reales de Firebase y configuración del dispositivo.
export const IS_DEMO = import.meta.env.VITE_EDITION === "demo";

/** Landing del proyecto. */
export const LANDING_URL = "https://santiagocachoo.github.io/croak_webpage/";
