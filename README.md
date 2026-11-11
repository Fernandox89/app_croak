# Croak · demo de la app

Simulación web de la app de Croak: muestra pH, turbidez y TDS de un dispositivo, con alertas cuando algo sale de rango. Las lecturas son de ejemplo; no se conecta a un dispositivo real.

Publicada en: https://fernandox89.github.io/app_croak/

## Correrla en local

Es HTML, CSS y JavaScript sin dependencias ni build. Solo necesita un servidor estático (el service worker no funciona abriendo el archivo directo):

```bash
python3 -m http.server 5180
```

y abrir http://localhost:5180

## Qué incluye

- **Estado único**: Inicio, Análisis, Bitácora y Configuración leen las mismas lecturas, así que nunca se contradicen.
- **Rangos configurables**: en Configuración → Tus rangos. Al moverlos cambia el estado en Inicio.
- **Escenarios** (botón "Escenario" en Inicio): líneas de tiempo comprimidas que mueven las lecturas.
  - Llueve y sube la turbidez · El filtro se satura · Contaminación en la cisterna · El sensor pierde conexión.
  - Se definen en `SCENARIOS` (`app.js`): valores objetivo por segundo, que se interpolan.
- **Bitácora**: registra cada cambio de estado, desconexiones, válvula y mantenimiento. Se abre con la campana.
- **Mantenimiento**: calibrar pH, limpiar turbidez y cambiar el filtro, con recordatorios (`MAINTENANCE` en `app.js`).
- **Análisis → En vivo**: los últimos 60 s de lecturas de la sesión.
- **Válvula**: marcada como "Próximamente"; en la demo se simula.
- Todo lo que configura la persona se guarda en su navegador (`localStorage`, clave `croak-demo-v1`). "Reiniciar demo" lo borra.

## Modo presentación

En pantallas de 1100 px o más aparece un panel junto al teléfono para quien presenta:

- Botones de escenarios y atajos de teclado: **0** día normal, **1–4** escenarios.
- "Qué está pasando": explica en una frase lo que se ve en la app y qué mostrar después.
- Se puede ocultar ("Ocultar panel") y volver a mostrar con el botón "Modo presentación".

## App instalable (PWA)

- `manifest.webmanifest` + `icons/` permiten instalarla en Android, iPhone y escritorio.
- `sw.js` guarda la app para abrirla **sin internet**. Con internet siempre intenta traer primero la versión más nueva.
- **Si agregas archivos** a la app, súmalos a `APP_SHELL` en `sw.js` y cambia el nombre de `CACHE`.

## Notificaciones

Configuración → Notificaciones → "En este celular". Envían un aviso del sistema cuando una lectura sale de rango o el dispositivo se desconecta; al tocarlo se abre la bitácora.

- Android y escritorio: funcionan desde el navegador.
- iPhone: solo con la app instalada en la pantalla de inicio (iOS 16.4 o posterior).
- "Probar una notificación" (en Configuración → Demo) manda una de ejemplo.

## Archivos

- `index.html`: pantallas y modales.
- `app.js`: estado, escenarios, bitácora, mantenimiento, notificaciones y modo presentación.
- `styles.css`: estilos.
- `sw.js`, `manifest.webmanifest`, `icons/`: app instalable.
- `croak-app.html`: versión anterior en un solo archivo (ya no se usa).
