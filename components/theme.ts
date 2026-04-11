export type ThemeMode = "dark" | "light";

const darkColors = {
  background: "#081a2f",
  card: "#0f2238",
  cardSoft: "#16263d",
  border: "#223552",

  text: "#ffffff",
  textMuted: "#94a3b8",
  textSecondary: "#cbd5e1",

  primary: "#2563EB",
  secondary: "#0ea5e9",
  purple: "#8b5cf6",

  warning: "#f59e0b",
  success: "#16a34a",
  danger: "#b91c1c",

  statusAguardando: "#0ea5e9",
  statusChegou: "#8b5cf6",
  statusClienteCaminho: "#f97361",
  statusClienteChegou: "#a855f7",

  whatsapp: "#16a34a",
  neutralButton: "#0f1b2d",

  overlay: "rgba(0,0,0,0.55)",
  mapInfoCard: "rgba(15, 23, 42, 0.92)",
};

const lightColors = {
  background: "#f8fafc",
  card: "#ffffff",
  cardSoft: "#eef3f7",
  border: "#e2e8f0",

  text: "#0f172a",
  textMuted: "#64748b",
  textSecondary: "#334155",

  primary: "#2563EB",
  secondary: "#0ea5e9",
  purple: "#8b5cf6",

  warning: "#d97706",
  success: "#16a34a",
  danger: "#dc2626",

  statusAguardando: "#0ea5e9",
  statusChegou: "#8b5cf6",
  statusClienteCaminho: "#f97361",
  statusClienteChegou: "#a855f7",

  whatsapp: "#16a34a",
  neutralButton: "#e2e8f0",

  overlay: "rgba(0,0,0,0.35)",
  mapInfoCard: "rgba(255,255,255,0.96)",
};

const baseTheme = {
  radius: {
    sm: 14,
    md: 18,
    lg: 22,
    xl: 28,
    pill: 999,
  },

  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 28,
  },

  text: {
    title: 28,
    subtitle: 14,
    section: 20,
    body: 16,
    small: 13,
    button: 16,
  },

  borderWidth: {
    thin: 1,
    medium: 1.5,
    strong: 2,
  },
};

export function createTheme(mode: ThemeMode) {
  return {
    ...baseTheme,
    colors: mode === "dark" ? darkColors : lightColors,
  };
}
