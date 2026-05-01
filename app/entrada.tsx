import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MenuCard } from "../components/MenuCard";
import { OfflineBanner } from "../components/OfflineBanner";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../contexts/ThemeContext";
import { handleError } from "../lib/errorHandler";
import { db } from "../lib/firebase";

type ConfigApp = {
  appEmManutencao?: boolean;
  avisoGlobal?: string;
};

export default function Entrada() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const { user, userData, loading, authReady } = useAuth();

  const [configCarregada, setConfigCarregada] = useState(false);
  const [appEmManutencao, setAppEmManutencao] = useState(false);
  const [avisoGlobal, setAvisoGlobal] = useState("");
  const [erro, setErro] = useState("");

  const navegadoRef = useRef(false);

  // 🔥 CONFIG FIREBASE
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "configuracoes", "app"),
      (snap) => {
        if (!snap.exists()) {
          setAppEmManutencao(false);
          setAvisoGlobal("");
          setConfigCarregada(true);
          return;
        }

        const data = snap.data() as ConfigApp;

        setAppEmManutencao(data.appEmManutencao === true);
        setAvisoGlobal(data.avisoGlobal || "");
        setConfigCarregada(true);
      },
      (error) => {
        handleError(error, "Entrada.config");
        setErro("Erro ao carregar configurações.");
        setConfigCarregada(true);
      }
    );

    return () => unsubscribe();
  }, []);

  // 🔥 NAVEGAÇÃO CONTROLADA (SEM REDIRECT)
  useEffect(() => {
    if (!authReady || loading || !configCarregada) return;
    if (navegadoRef.current) return;

    let rota: string | null = null;

    if (erro) return;

    // manutenção global
    if (appEmManutencao) {
      rota =
        userData?.tipo === "admin"
          ? "/admin/dashboard"
          : "/manutencao";
    }
    // usuário logado
    else if (user) {
      const tipo = String(userData?.tipo || "").toLowerCase();

      if (tipo === "admin") rota = "/admin/dashboard";
      else if (tipo === "cliente") rota = "/cliente-home";
      else if (tipo === "profissional") rota = "/painel-profissional";
    }

    if (!rota) return;

    navegadoRef.current = true;

    requestAnimationFrame(() => {
      router.replace(rota);
    });
  }, [
    authReady,
    loading,
    configCarregada,
    user,
    userData?.tipo,
    appEmManutencao,
    erro,
  ]);

  // 🔥 LOADING STATE
  if (!authReady || loading || !configCarregada) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  // 🔥 ERRO STATE
  if (erro) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{erro}</Text>
      </View>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <OfflineBanner />

      <View style={styles.hero}>
        <Pressable
          accessibilityRole="button"
          onLongPress={() => router.push("/login-admin")}
          delayLongPress={10000}
          style={styles.logoWrap}
        >
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Pressable>

        <Text style={styles.title}>Bem-vindo ao Nexo</Text>
        <Text style={styles.frase}>
          Conectando você ao profissional certo.
        </Text>
      </View>

      {!!avisoGlobal.trim() && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Aviso</Text>
          <Text style={styles.noticeText}>{avisoGlobal}</Text>
        </View>
      )}

      <View style={styles.cardsWrap}>
        <MenuCard
          title="PRECISO DE SERVIÇO"
          subtitle="Entrar como cliente"
          icon={
            <Feather
              name="search"
              size={20}
              color={theme.colors.primary}
            />
          }
          borderVariant="primary"
          onPress={() =>
            router.push(
              appEmManutencao ? "/manutencao" : "/login-cliente"
            )
          }
        />

        <MenuCard
          title="SOU PROFISSIONAL"
          subtitle="Entrar como profissional"
          icon={
            <Feather
              name="briefcase"
              size={20}
              color={theme.colors.success}
            />
          }
          borderVariant="success"
          onPress={() =>
            router.push(
              appEmManutencao
                ? "/manutencao"
                : "/login-profissional"
            )
          }
        />
      </View>
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    loadingText: {
      color: theme.colors.text,
      marginTop: 10,
      textAlign: "center",
    },
    hero: {
      alignItems: "center",
      marginBottom: 20,
    },
    logoWrap: {
      marginBottom: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    logo: {
      width: 200,
      height: 200,
    },
    title: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
    },
    frase: {
      color: theme.colors.textMuted,
      textAlign: "center",
      marginTop: 10,
    },
    noticeCard: {
      backgroundColor: theme.colors.card,
      padding: 15,
      borderRadius: 12,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    noticeTitle: {
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 6,
    },
    noticeText: {
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    cardsWrap: {
      gap: 12,
    },
  });
}