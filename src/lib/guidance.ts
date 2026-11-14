import type { AlertEvent, AlertParam, MetricKey } from "./types";

// Qué hacer ante cada alerta. Son recomendaciones prácticas, no un diagnóstico: Croak no determina si el
// agua es potable. Revisadas contra la NOM-127-SSA1-2021 y las recomendaciones de los organismos operadores.
const GUIDANCE: Record<AlertParam, string[]> = {
  turbidity: [
    "Mientras dure, usa agua purificada para beber y cocinar. Hervir no elimina el sedimento.",
    "Revisa si hay cortes, reparaciones o lluvias recientes: en temporada de lluvias las presas arrastran lodo.",
    "Si sigue así después de que se normaliza el servicio, revisa y limpia el tinaco o la cisterna.",
  ],
  tds: [
    "Un aumento sostenido suele indicar un cambio en la fuente de suministro o sales acumuladas en el tinaco.",
    "La NOM-127-SSA1-2021 fija 1000 mg/L como límite. Si se mantiene arriba, solicita un análisis de laboratorio.",
    "Por sí solo no indica contaminación microbiológica.",
  ],
  ph: [
    "Confirma la lectura con tiras de pH o un medidor, y revisa cuándo se calibró el sensor.",
    "Un pH bajo puede corroer tuberías y liberar metales; uno alto favorece el sarro y reduce la eficacia del cloro.",
    "Si se mantiene fuera de 6.5 a 8.5, solicita un análisis de laboratorio y repórtalo al organismo operador.",
  ],
  sensor_ph: [
    "Verifica que el electrodo esté sumergido y que el conector BNC esté firme.",
    "Si el problema sigue, recalibra el sensor o reemplaza el electrodo: su vida útil es de meses, no de años.",
  ],
  sensor_tds: ["Verifica que la sonda esté sumergida y su cable conectado.", "Limpia la sonda si tiene sarro."],
  sensor_turbidity: [
    "Verifica que el sensor esté sumergido, limpio y protegido de la luz directa.",
    "Si la lectura no se recupera, recalibra el punto de agua de referencia.",
  ],
};

export function guidanceFor(alert: AlertEvent): string[] {
  return alert.active ? GUIDANCE[alert.param] ?? [] : [];
}

// Límites de la NOM-127-SSA1-2021 (DOF 2 de mayo de 2022) para comparar en las gráficas.
export const NOM127: Record<MetricKey, string> = {
  ph: "NOM-127-SSA1-2021: 6.5 a 8.5",
  tds: "NOM-127-SSA1-2021: hasta 1000 mg/L",
  turbidity: "NOM-127-SSA1-2021: hasta 3 UNT. Este sensor reporta un índice relativo, no UNT",
};
