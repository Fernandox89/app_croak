#!/usr/bin/env bash
# Da acceso a la app del equipo: crea la cuenta (si no existe) y la vincula a un dispositivo.
#
#   scripts/dar-acceso.sh correo@ejemplo.com [croak-01]
#
# Pide la contraseña. Si la dejas vacía, se genera una al azar y Firebase envía al correo un enlace para que
# la persona elija la suya (revisa la carpeta de spam). Requiere la CLI de Firebase con sesión iniciada
# (firebase login) y el archivo .env.local con la configuración del proyecto.
set -euo pipefail

EMAIL="${1:?Uso: scripts/dar-acceso.sh correo@ejemplo.com [dispositivo]}"
DEVICE="${2:-croak-01}"
PROJECT="croak-monitor"
cd "$(dirname "$0")/.."

API_KEY="$(grep '^VITE_FIREBASE_API_KEY=' .env.local | cut -d= -f2-)"
[ -n "$API_KEY" ] || { echo "Falta VITE_FIREBASE_API_KEY en .env.local" >&2; exit 1; }

if [ -z "${CROAK_PASSWORD+x}" ]; then
  read -r -s -p "Contraseña para $EMAIL (vacía = enviar enlace por correo): " CROAK_PASSWORD
  echo
fi
SEND_RESET=0
if [ -z "$CROAK_PASSWORD" ]; then
  CROAK_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
  SEND_RESET=1
fi

json() { python3 -c 'import json,sys; print(json.dumps(dict(zip(sys.argv[1::2], sys.argv[2::2]))))' "$@"; }

RESP="$(curl -4 -s --max-time 20 -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY" \
  -H 'Content-Type: application/json' -d "$(json email "$EMAIL" password "$CROAK_PASSWORD")")"
UID_="$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("localId",""))')"

if [ -z "$UID_" ]; then
  ERR="$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error",{}).get("message",""))')"
  if [ "$ERR" != "EMAIL_EXISTS" ]; then echo "No se pudo crear la cuenta: $ERR" >&2; exit 1; fi
  echo "La cuenta ya existe; se busca su identificador."
  TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
  firebase auth:export "$TMP" --format=json --project "$PROJECT" >/dev/null
  UID_="$(python3 -c 'import json,sys; print(next((u["localId"] for u in json.load(open(sys.argv[1]))["users"] if u.get("email","").lower()==sys.argv[2].lower()),""))' "$TMP" "$EMAIL")"
  [ -n "$UID_" ] || { echo "No se encontró la cuenta." >&2; exit 1; }
  SEND_RESET=0
else
  echo "Cuenta creada."
fi

firebase database:set -f --project "$PROJECT" "/devices/$DEVICE/members/$UID_" --data true >/dev/null
firebase database:set -f --project "$PROJECT" "/users/$UID_/devices/$DEVICE" --data true >/dev/null
echo "$EMAIL ahora tiene acceso a $DEVICE."

if [ "$SEND_RESET" = 1 ]; then
  curl -4 -s --max-time 20 -X POST "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=$API_KEY" \
    -H 'Content-Type: application/json' -d "$(json requestType PASSWORD_RESET email "$EMAIL")" >/dev/null
  echo "Se envió a $EMAIL un enlace para elegir su contraseña."
fi
