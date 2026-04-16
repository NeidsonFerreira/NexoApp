import { Redirect, router } from "expo-router";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "mostrar" | "admin" | "sem-user";

type ConfigApp = {
  appEmManutencao?: boolean;
  avisoGlobal?: string;
  statusManutencao?: string;
  tempoEstimadoManutencao?: string;
};

export default function Manutencao() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [avisoGlobal, setAvisoGlobal] = useState("");
  const [statusManutencao, setStatusManutencao] =
    useState("Atualizando sistema");
  const [tempoEstimado, setTempoEstimado] = useState("Voltamos em breve");
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function inicializar() {
      try {
        const usuario = auth.currentUser;

        if (usuario) {
          const userRef = doc(db, "users", usuario.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data() as { tipo?: string };
            if (userData.tipo === "admin") {
              if (!ativo) return;
              setStatusTela("admin");
              return;
            }
          }
        }

        const configRef = doc(db, "configuracoes", "app");

        const unsubscribe = onSnapshot(
          configRef,
          (snap) => {
            if (!ativo) return;

            if (!snap.exists()) {
              setAvisoGlobal("");
              setStatusManutencao("Atualizando sistema");
              setTempoEstimado("Voltamos em breve");
              setStatusTela("mostrar");
              return;
            }

            const dados = snap.data() as ConfigApp;

            setAvisoGlobal(String(dados.avisoGlobal || "").trim());
            setStatusManutencao(
              String(dados.statusManutencao || "").trim() ||
                "Atualizando sistema"
            );
            setTempoEstimado(
              String(dados.tempoEstimadoManutencao || "").trim() ||
                "Voltamos em breve"
            );

            if (dados.appEmManutencao === false) {
              router.replace("/entrada");
              return;
            }

            setStatusTela("mostrar");
          },
          (error) => {
            console.log("Erro ao ouvir configuração de manutenção:", error);
            if (!ativo) return;
            setStatusTela("mostrar");
          }
        );

        return unsubscribe;
      } catch (error) {
        console.log("Erro ao carregar manutenção:", error);
        if (!ativo) return;
        setStatusTela("mostrar");
      }
    }

    let unsubscribeRef: (() => void) | undefined;

    void inicializar().then((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribeRef = unsubscribe;
      }
    });

    return () => {
      ativo = false;
      if (unsubscribeRef) {
        unsubscribeRef();
      }
    };
  }, []);

  async function tentarNovamente() {
    try {
      setAtualizando(true);

      const snapConfig = await getDoc(doc(db, "configuracoes", "app"));

      if (snapConfig.exists()) {
        const dadosConfig = snapConfig.data() as ConfigApp;

        setAvisoGlobal(String(dadosConfig.avisoGlobal || "").trim());
        setStatusManutencao(
          String(dadosConfig.statusManutencao || "").trim() ||
            "Atualizando sistema"
        );
        setTempoEstimado(
          String(dadosConfig.tempoEstimadoManutencao || "").trim() ||
            "Voltamos em breve"
        );

        if (dadosConfig.appEmManutencao === false) {
          router.replace("/entrada");
          return;
        }
      }
    } catch (error) {
      console.log("Erro ao tentar novamente manutenção:", error);
    } finally {
      setAtualizando(false);
    }
  }

  function abrirSuporte() {
    router.push("/chat-suporte");
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  if (statusTela === "admin") {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.page}>
      <AppHeader title="Manutenção" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Voltamos em breve</Text>
          <Text style={styles.statusPill}>{statusManutencao}</Text>
          <Text style={styles.heroText}>
            O app está temporariamente em manutenção. Assim que tudo estiver
            pronto, o acesso será liberado novamente.
          </Text>
        </View>

        <View style={styles.iconCard}>
          <Text style={styles.iconEmoji}>🛠️</Text>
          <Text style={styles.iconTitle}>Equipe trabalhando</Text>
          <Text style={styles.iconSub}>
            Estamos ajustando o app para voltar com mais estabilidade e
            velocidade.
          </Text>
        </View>

        {!!avisoGlobal.trim() && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Aviso</Text>
            <Text style={styles.noticeText}>{avisoGlobal.trim()}</Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.actionsTitle}>
            Obrigado pela paciência. Estamos melhorando sua experiência no app.
          </Text>
          <Text style={styles.tempoTexto}>⏱️ {tempoEstimado}</Text>
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Precisa de ajuda?</Text>

          <TouchableOpacity style={styles.buttonTop} onPress={tentarNovamente}>
            <Text style={styles.linkButton}>
              {atualizando ? "Atualizando..." : "Tentar novamente"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonTop} onPress={abrirSuporte}>
            <Text style={styles.supportButton}>Falar com suporte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      marginTop: 12,
      color: theme.colors.textMuted,
      fontSize: 15,
    },
    content: {
      padding: 16,
      gap: 12,
    },
    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      padding: 18,
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 8,
    },
    statusPill: {
      marginTop: 6,
      color: theme.colors.warning,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 10,
    },
    heroText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
    noticeCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      padding: 16,
    },
    noticeTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 6,
    },
    noticeText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    iconCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      padding: 16,
      alignItems: "center",
    },
    iconEmoji: {
      fontSize: 34,
      marginBottom: 10,
    },
    iconTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 6,
      textAlign: "center",
    },
    iconSub: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    infoCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.14 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    actionsCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.14 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    actionsTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 8,
      textAlign: "center",
    },
    buttonTop: {
      marginTop: 10,
    },
    linkButton: {
      color: theme.colors.primary,
      fontSize: 15,
      fontWeight: "700",
    },
    supportButton: {
      color: theme.colors.warning,
      fontSize: 15,
      fontWeight: "700",
    },
    tempoTexto: {
      marginTop: 10,
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center",
    },
  });
}