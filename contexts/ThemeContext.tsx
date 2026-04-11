import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance } from "react-native";
import { createTheme, type ThemeMode } from "../components/theme";
import { handleError } from "../lib/errorHandler";

type ThemeContextType = {
  themeMode: ThemeMode;
  theme: ReturnType<typeof createTheme>;
  carregandoTema: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  recarregarTema: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "@nexo_theme_mode";

type ThemeProviderAppProps = {
  children: ReactNode;
};

function getDefaultThemeMode(): ThemeMode {
  const systemScheme = Appearance.getColorScheme();
  return systemScheme === "light" ? "light" : "dark";
}

export function ThemeProviderApp({ children }: ThemeProviderAppProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getDefaultThemeMode);
  const [carregandoTema, setCarregandoTema] = useState(true);

  const recarregarTema = useCallback(async () => {
    try {
      setCarregandoTema(true);

      const valorSalvo = await AsyncStorage.getItem(STORAGE_KEY);

      if (valorSalvo === "dark" || valorSalvo === "light") {
        setThemeModeState(valorSalvo);
        return;
      }

      setThemeModeState(getDefaultThemeMode());
    } catch (error) {
      handleError(error, "ThemeContext.recarregarTema");
      setThemeModeState(getDefaultThemeMode());
    } finally {
      setCarregandoTema(false);
    }
  }, []);

  useEffect(() => {
    recarregarTema();
  }, [recarregarTema]);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
      setThemeModeState(mode);
    } catch (error) {
      handleError(error, "ThemeContext.setThemeMode");
    }
  }, []);

  const toggleTheme = useCallback(async () => {
    const novoModo: ThemeMode = themeMode === "dark" ? "light" : "dark";
    await setThemeMode(novoModo);
  }, [themeMode, setThemeMode]);

  const theme = useMemo(() => createTheme(themeMode), [themeMode]);

  const value = useMemo<ThemeContextType>(
    () => ({
      themeMode,
      theme,
      carregandoTema,
      setThemeMode,
      toggleTheme,
      recarregarTema,
    }),
    [themeMode, theme, carregandoTema, setThemeMode, toggleTheme, recarregarTema]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextType {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useAppTheme deve ser usado dentro de ThemeProviderApp");
  }

  return context;
}
