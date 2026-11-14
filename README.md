# Croak — app

Aplicación web instalable (PWA) de Croak. Muestra las lecturas de pH, turbidez y sólidos disueltos (TDS) que el dispositivo publica en Firebase Realtime Database, su tendencia y las alertas.

Publicada en: https://fernandox89.github.io/app_croak/

## Pantallas

- **Panel:** estado general, valor actual de cada indicador con su intervalo configurado y tendencia de 30 minutos, alertas activas y condiciones de medición (temperatura e intervalo).
- **Tendencias:** gráfica de cada indicador en 15 min, 1 h, 6 h o 24 h, con mínimo, promedio y máximo. La banda sombreada es el intervalo configurado.
- **Alertas:** alertas activas e historial agrupado por día. Las genera el firmware cuando un valor se mantiene fuera de su intervalo durante N lecturas seguidas.
- **Dispositivo:**
  - estado (conexión, señal WiFi, firmware, IP, tiempo encendido);
  - calibración de cada sensor;
  - frecuencia de medición e intervalos de alerta, que se guardan en Firebase y el dispositivo aplica en menos de un minuto;
  - notificaciones del sistema;
  - fuente de datos.

## Fuente de datos

- **Dispositivo:** lee `devices/<id>/` en Realtime Database con una sesión anónima de Firebase. La estructura y las reglas están en el repo [croak_firmware](https://github.com/Fernandox89/croak_firmware) (`README.md` y `firebase/database.rules.json`).
- **Demostración:** un simulador en el navegador que imita al firmware: misma forma de datos, mismas reglas de alerta y escenarios (turbidez, TDS, pH ácido, falla de sensor). La app muestra un aviso permanente mientras está activo.

Sin las variables de Firebase, la app solo ofrece la demostración.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # llena los datos de Firebase
npm run dev                  # http://localhost:5173
npm run build                # verifica tipos y genera dist/
```

Stack: React 18, TypeScript, Vite, Tailwind CSS 4, Firebase JS SDK, lucide-react, y vite-plugin-pwa (service worker con Workbox). Usa la misma paleta y tipografías que la landing.

```text
src/
  lib/        tipos, fuentes de datos (firebase.ts, demo.ts), reglas de estado, formato
  hooks/      suscripciones a los datos
  components/ AppShell (navegación), MetricCard, TrendChart (SVG propio), AlertRow, ui
  pages/      Overview, Trends, Alerts, Device
```

## Publicación

GitHub Actions compila y publica en GitHub Pages en cada push a `main` (`.github/workflows/deploy.yml`). Configuración necesaria en el repo:

1. En Settings → Pages → Source, elige **GitHub Actions**.
2. En Settings → Secrets and variables → Actions → **Variables**, agrega:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_DEFAULT_DEVICE_ID`

   La configuración web de Firebase es pública por diseño: la seguridad la dan las reglas de la base de datos.

## Límites conocidos

- **Notificaciones:** solo llegan mientras la app está abierta o en segundo plano. Para avisos con la app cerrada, el firmware envía mensajes por Telegram; las notificaciones push requieren Cloud Functions (plan Blaze).
- **Escritura de configuración:** cualquier sesión puede cambiar la configuración del dispositivo (reglas del MVP). Antes de un piloto hay que asociar cada dispositivo a una cuenta.
