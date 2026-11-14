# Croak — app

Aplicación web instalable (PWA) de Croak. Muestra las lecturas de pH, turbidez y sólidos disueltos (TDS) que el dispositivo publica en Firebase Realtime Database, su tendencia y las alertas.

## Dos ediciones

El mismo código se compila en dos ediciones (`VITE_EDITION`, ver `src/lib/edition.ts`):

| | Demo pública | App del equipo |
|---|---|---|
| Dirección | https://fernandox89.github.io/app_croak/ (la enlaza la landing) | https://croak-monitor.web.app |
| Datos | Simulador en el navegador | Firebase, el dispositivo real |
| Acceso | Libre | Cuenta con correo y contraseña; cada cuenta solo ve sus dispositivos |
| Panel, tendencias, alertas | Sí | Sí |
| Configuración, calibración, estado del equipo | No: en su lugar, página de escenarios | Sí |
| SDK y datos de Firebase en el paquete | No (`vite.config.ts` los reemplaza por `*.stub.ts`) | Sí |

Lo que esté en desarrollo se agrega solo a la app del equipo; la demo cambia solo cuando conviene mostrarlo.

## Pantallas

- **Panel:** estado general, valor actual de cada indicador con su intervalo configurado y tendencia de 30 minutos, alertas activas con "Qué hacer", condiciones de medición y estado del mantenimiento.
- **Tendencias:** gráfica de cada indicador en 15 min, 1 h, 6 h o 24 h, con mínimo, promedio y máximo, la banda del intervalo configurado y la referencia de la NOM-127-SSA1-2021. Descarga del periodo en CSV.
- **Reporte** (`#/reporte`, desde Tendencias): resumen de 24 horas o 7 días para imprimir o guardar como PDF: mínimo, promedio, máximo y tiempo dentro del intervalo por indicador, alertas y mantenimiento registrado.
- **Alertas:** alertas activas, cada una con pasos concretos de qué hacer (`src/lib/guidance.ts`), e historial agrupado por día. Las genera el firmware cuando un valor se mantiene fuera de su intervalo durante N lecturas seguidas.
- **Dispositivo** (app del equipo):
  - estado (conexión, señal WiFi, firmware, IP, tiempo encendido);
  - calibración de cada sensor;
  - mantenimiento: limpieza de sondas (30 días), calibración de pH (90) y limpieza del tinaco (180), con registro y recordatorios compartidos por todas las cuentas del dispositivo;
  - frecuencia de medición e intervalos de alerta, que se guardan en Firebase y el dispositivo aplica en menos de un minuto;
  - notificaciones del sistema;
  - borrado del historial de lecturas y alertas (doble confirmación);
  - fuente de datos (dispositivo real o demostración) y cuenta.
- **Simulación** (demo pública, en lugar de Dispositivo): escenarios para provocar alertas, intervalos de referencia, mantenimiento de ejemplo y enlace a la landing.

## Fuente de datos

- **Dispositivo:** lee `devices/<id>/` en Realtime Database con la sesión de la cuenta. La cuenta ve los dispositivos listados en `users/<uid>/devices`. La estructura y las reglas están en el repo [croak_firmware](https://github.com/Fernandox89/croak_firmware) (`README.md` y `firebase/database.rules.json`).
- **Demostración:** un simulador en el navegador que imita al firmware: misma forma de datos, mismas reglas de alerta y escenarios (turbidez, TDS, pH ácido, falla de sensor). La app muestra un aviso permanente mientras está activo.

## Cuentas

No hay registro público. Para dar acceso a alguien (crea la cuenta si no existe y la vincula al dispositivo):

```bash
scripts/dar-acceso.sh correo@ejemplo.com croak-01
```

Pide una contraseña; si la dejas vacía, Firebase envía al correo un enlace para que la persona elija la suya (puede llegar a spam). Requiere `firebase login` y `.env.local`. Para quitar el acceso, borra `devices/<id>/members/<uid>` y `users/<uid>/devices/<id>` desde la consola de Firebase.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # llena los datos de Firebase
npm run dev                  # app del equipo, http://localhost:5173
npm run dev:demo             # demo pública
npm run build                # app del equipo en dist/
npm run build:demo           # demo pública en dist/
```

Stack: React 18, TypeScript, Vite, Tailwind CSS 4, Firebase JS SDK, lucide-react, y vite-plugin-pwa (service worker con Workbox). Usa la misma paleta y tipografías que la landing.

```text
src/
  lib/        tipos, fuentes de datos (firebase.ts, demo.ts), reglas de estado, formato
  hooks/      suscripciones a los datos
  components/ AppShell (navegación), MetricCard, TrendChart (SVG propio), AlertRow, ui
  pages/      Overview, Trends, Alerts, Device, Simulation (demo), Login (equipo)
scripts/      dar-acceso.sh
```

## Publicación

- **Demo pública:** GitHub Actions la compila con `npm run build:demo` y la publica en GitHub Pages en cada push a `main` (`.github/workflows/deploy.yml`). No necesita variables.
- **App del equipo:** `npm run deploy:app` la compila y la publica en Firebase Hosting (proyecto croak-monitor). Requiere `firebase login` y `.env.local`.

  La configuración web de Firebase es pública por diseño: la seguridad la dan el inicio de sesión y las reglas de la base de datos.

## Límites conocidos

- **Notificaciones:** solo llegan mientras la app está abierta o en segundo plano. Para avisos con la app cerrada, el firmware envía mensajes por Telegram; las notificaciones push requieren Cloud Functions (plan Blaze).
