import { Feather } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MenuCard } from "../components/MenuCard";
import { OfflineBanner } from "../components/OfflineBanner";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../contexts/ThemeContext";
import { db } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";

type Destino =
  | "loading"
  | "publico"
  | "cliente"
  | "profissional"
  | "admin"
  | "manutencao"
  | "erro";

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

  useEffect(() => {
    const unsubscribeConfig = onSnapshot(
      doc(db, "configuracoes", "app"),
      (snapConfig) => {
        if (!snapConfig.exists()) {
          setAppEmManutencao(false);
          setAvisoGlobal("");
          setConfigCarregada(true);
          return;
        }

        const dadosConfig = snapConfig.data() as ConfigApp;

        setAppEmManutencao(dadosConfig.appEmManutencao === true);
        setAvisoGlobal(dadosConfig.avisoGlobal || "");
        setConfigCarregada(true);
      },
      (error) => {
        handleError(error, "Entrada.config");
        setErro("Erro ao carregar configurações.");
        setConfigCarregada(true);
      }
    );

    return () => {
      unsubscribeConfig();
    };
  }, []);

  const destino = useMemo<Destino>(() => {
    if (!authReady || loading || !configCarregada) {
      return "loading";
    }

    if (erro.trim()) {
      return "erro";
    }

    if (appEmManutencao) {
      if (userData?.tipo === "admin") {
        return "admin";
      }
      return "manutencao";
    }

    if (!user) {
      return "publico";
    }

    const tipo = String(userData?.tipo || "").toLowerCase();

    if (tipo === "admin") return "admin";
    if (tipo === "cliente") return "cliente";
    if (tipo === "profissional") return "profissional";

    return "publico";
  }, [authReady, loading, configCarregada, erro, appEmManutencao, user, userData?.tipo]);

  function abrirCliente() {
    router.push(appEmManutencao ? "/manutencao" : "/login-cliente");
  }

  function abrirProfissional() {
    router.push(appEmManutencao ? "/manutencao" : "/login-profissional");
  }

  if (destino === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  if (destino === "erro") {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{erro}</Text>
      </View>
    );
  }

  if (destino === "admin") return <Redirect href="/admin/dashboard" />;
  if (destino === "cliente") return <Redirect href="/cliente-home" />;
  if (destino === "profissional") return <Redirect href="/painel-profissional" />;
  if (destino === "manutencao") return <Redirect href="/manutencao" />;

  return (
    <ScreenContainer>
      <OfflineBanner />

      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>Bem-vindo ao Nexo</Text>

        <Text style={styles.frase}>
          Conectando você ao profissional certo.
        </Text>
      </View>

      {!!avisoGlobal.trim() && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Aviso</Text>
          <Text style={styles.noticeText}>{avisoGlobal.trim()}</Text>
        </View>
      )}

      <View style={styles.cardsWrap}>
        <MenuCard
          title="PRECISO DE UM SERVIÇO"
          subtitle="Entrar como cliente"
          icon={<Feather name="search" size={22} color={theme.colors.text} />}
          borderVariant="primary"
          onPress={abrirCliente}
        />

        <MenuCard
          title="SOU PROFISSIONAL"
          subtitle="Entrar como profissional"
          icon={<Feather name="briefcase" size={22} color={theme.colors.text} />}
          borderVariant="success"
          onPress={abrirProfissional}
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
