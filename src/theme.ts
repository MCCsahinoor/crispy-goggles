import * as FileSystem from "expo-file-system/legacy";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

export type ThemeColors = {
  bg: string;
  bgElevated: string;
  card: string;
  cardAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  blue: string;
  blueSoft: string;
  purple: string;
  purpleSoft: string;
  inputBg: string;
  inputBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  success: string;
  successBg: string;
  successBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  overlay: string;
};

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const darkColors: ThemeColors = {
  bg: "#07080D",
  bgElevated: "#0C0E15",
  card: "#12141C",
  cardAlt: "#161822",
  border: "#232633",
  borderStrong: "#2C3040",
  text: "#F4F6FB",
  textMuted: "#9AA0B4",
  textDim: "#6B7186",
  blue: "#3B82F6",
  blueSoft: "#4F8CFF",
  purple: "#A855F7",
  purpleSoft: "#C084FC",
  inputBg: "#0E1018",
  inputBorder: "#262A38",
  danger: "#F87171",
  dangerBg: "#2A1216",
  dangerBorder: "#7F1D1D",
  success: "#34D399",
  successBg: "#0F291E",
  successBorder: "#14532D",
  warning: "#FBBF24",
  warningBg: "#2A2108",
  warningBorder: "#854D0E",
  overlay: "rgba(5, 6, 12, 0.72)",
};

export const lightColors: ThemeColors = {
  bg: "#F1F5F9",
  bgElevated: "#FFFFFF",
  card: "#FFFFFF",
  cardAlt: "#F8FAFC",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  text: "#0F172A",
  textMuted: "#64748B",
  textDim: "#94A3B8",
  blue: "#3B82F6",
  blueSoft: "#2563EB",
  purple: "#A855F7",
  purpleSoft: "#7C3AED",
  inputBg: "#F8FAFC",
  inputBorder: "#CBD5E1",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  success: "#047857",
  successBg: "#ECFDF5",
  successBorder: "#A7F3D0",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",
  overlay: "rgba(15, 23, 42, 0.45)",
};

export const gradients = {
  connect: ["#3B82F6", "#A855F7"] as const,
  logo: ["#2563EB", "#4F8CFF"] as const,
  globe: ["#60A5FA", "#2563EB"] as const,
  router: ["#312E81", "#1E1B4B"] as const,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  full: 999,
} as const;

const THEME_STORE = `${FileSystem.documentDirectory ?? ""}filedrop-theme.txt`;

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ColorScheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function parseThemeMode(value: string): ThemeMode | null {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }
  return null;
}

async function loadStoredThemeMode(): Promise<ThemeMode> {
  try {
    const info = await FileSystem.getInfoAsync(THEME_STORE);
    if (!info.exists) {
      return "system";
    }
    return parseThemeMode((await FileSystem.readAsStringAsync(THEME_STORE)).trim()) ?? "system";
  } catch {
    return "system";
  }
}

async function saveThemeMode(mode: ThemeMode) {
  try {
    await FileSystem.writeAsStringAsync(THEME_STORE, mode);
  } catch {
    // Ignore persistence errors; the in-memory choice still applies.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let cancelled = false;
    loadStoredThemeMode().then((stored) => {
      if (cancelled) {
        return;
      }
      setModeState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scheme: ColorScheme = mode === "system"
    ? systemScheme === "light" ? "light" : "dark"
    : mode;

  const colors = scheme === "light" ? lightColors : darkColors;

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    saveThemeMode(next);
  }, []);

  const value = useMemo(
    () => ({ mode, scheme, colors, setMode }),
    [mode, scheme, colors, setMode],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function useThemedStyles<T extends NamedStyles<T>>(factory: (colors: ThemeColors) => T) {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create(factory(colors)), [colors, factory]);
}
