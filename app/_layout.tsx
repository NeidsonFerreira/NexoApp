import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { NetworkStatusProvider } from "../contexts/NetworkStatusContext";
import { ThemeProviderApp, useAppTheme } from "../contexts/ThemeContext";
import { isExpoGoAndroid } from "../lib/isExpoGoAndroid";
import { logError, logEvent } from "../lib/logger";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // noop
});

type NotificationData = {
  tela?: string;
  pedidoId?: string;
  profissionalId?: string;
  tipo?: string;
  url?: string;
};

function getNotificationKey(data?: NotificationData) {
  return [
    data?.tela || "",
    data?.pedidoId || "",
    data?.profissionalId || "",
    data?.tipo || "",
    data?.url || "",
  ].join("|");
}

function abrirTelaPorNotificacao(data?: NotificationData) {
  if (!data) return;

  if (typeof data.url === "string" && data.url.trim()) {
    router.push(data.url);
    return;
  }

  if (data.tela === "pedidos-profissional") {
    router.push("/pedidos-profissional");
    return;
  }

  if (data.tela === "pedidos") {
    router.push("/pedidos");
    return;
  }

  if (data.tela === "chat" && data.pedidoId) {
    router.push({
      pathname: "/chat",
      params: { pedidoId: data.pedidoId },
    });
    return;
  }

  if (data.tela === "mapa") {
    router.push({
      pathname: "/mapa",
      params: {
        profissionalId: data.profissionalId || "",
        pedidoStatus: data.tipo || "",
      },
    });
  }
}

function AppBootstrapLoader() {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

function RootNavigator() {
  const { themeMode, theme, carregandoTema } = useAppTheme();
  const { loading, authReady } = useAuth();
  const ultimaChaveNotificacaoRef = useRef("");

  useEffect(() => {
    if (isExpoGoAndroid()) {
      console.log("Listeners de push remoto ignorados no Expo Go Android.");
      return;
    }

    let ativo = true;
    let removeListener: (() => void) | null = null;

    async function configurarNotificacoes() {
      try {
        const Notifications = await import("expo-notifications");

        function processar(data?: NotificationData) {
          const chave = getNotificationKey(data);

          if (!chave || ultimaChaveNotificacaoRef.current === chave) return;

          ultimaChaveNotificacaoRef.current = chave;
          abrirTelaPorNotificacao(data);

          logEvent("notification_opened", data, "_layout");
        }

        try {
          const response = await Notifications.getLastNotificationResponseAsync();

          if (!ativo || !response?.notification) return;

          const data = response.notification.request.content
            .data as NotificationData;

          processar(data);
        } catch (error) {
          logError(error, "_layout.getLastNotificationResponseAsync");
          console.log("Erro ao verificar notificação inicial:", error);
        }

        const subscription =
          Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification.request.content
              .data as NotificationData;

            processar(data);
          });

        removeListener = () => subscription.remove();
      } catch (error) {
        logError(error, "_layout.configurarNotificacoes");
      }
    }

    void configurarNotificacoes();

    return () => {
      ativo = false;
      removeListener?.();
    };
  }, []);

  const navigationTheme = useMemo(
    () =>
      themeMode === "dark"
        ? {
            ...DarkTheme,
            colors: {
              ...DarkTheme.colors,
              background: theme.colors.background,
              card: theme.colors.card,
              text: theme.colors.text,
              border: theme.colors.border,
              primary: theme.colors.primary,
              notification: theme.colors.primary,
            },
          }
        : {
            ...DefaultTheme,
            colors: {
              ...DefaultTheme.colors,
              background: theme.colors.background,
              card: theme.colors.card,
              text: theme.colors.text,
              border: theme.colors.border,
              primary: theme.colors.primary,
              notification: theme.colors.primary,
            },
          },
    [themeMode, theme]
  );

  if (carregandoTema || !authReady || loading) {
    return <AppBootstrapLoader />;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="entrada" />
        <Stack.Screen name="login-cliente" />
        <Stack.Screen name="login-profissional" />
        <Stack.Screen name="cadastro" />
        <Stack.Screen name="cadastro-profissional" />
        <Stack.Screen name="profissionais" />
        <Stack.Screen name="perfil-profissional" />
        <Stack.Screen name="pedidos" />
        <Stack.Screen name="pedidos-profissional" />
        <Stack.Screen name="mapa" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="chat-suporte" />
        <Stack.Screen name="manutencao" />
        <Stack.Screen name="configuracoes" />
        <Stack.Screen name="plano-cliente" />
        <Stack.Screen name="perfil-cliente" />
        <Stack.Screen name="ajuda" />
        <Stack.Screen name="admin" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProviderApp>
      <NetworkStatusProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </NetworkStatusProvider>
    </ThemeProviderApp>
  );
}