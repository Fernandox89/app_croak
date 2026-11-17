import { useEffect, useState } from "react";

// Tema de la interfaz. Se guarda en el navegador; index.html lo aplica antes de pintar para evitar un destello.
export type Theme = "light" | "dark";

const STORAGE_KEY = "croak-theme";
const THEME_COLOR: Record<Theme, string> = { light: "#f4f8fb", dark: "#0b1117" };
const listeners = new Set<(t: Theme) => void>();

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sin almacenamiento (modo privado): el tema dura la sesión.
  }
  listeners.forEach((l) => l(theme));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState(getTheme);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return [theme, setTheme];
}
