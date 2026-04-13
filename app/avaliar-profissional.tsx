import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { OfflineBanner } from "../components/OfflineBanner";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db, functions } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";

type PedidoResumo = {
  clienteId?: string;
  profissionalId?: string;
  status?: string;
  avaliado?: boolean;
};

function normalizeParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function statusPodeAvaliar(status?: string) {
  return String(status || "").trim().toLowerCase() === "concluido";
}

function getErrorMessage(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code.includes("not-found") || message.toLowerCase().includes("not-found")) {
    return "Pedido ou profissional não encontrado para avaliação.";
  }

  if (
    code.includes("failed-precondition") ||
    message.toLowerCase().includes("failed-precondition")
  ) {
    return "Só é possível avaliar pedidos concluídos.";
  }

  if (code.includes("already-exists") || message.toLowerCase().includes("already-exists")) {
    return "Esse pedido já foi avaliado.";
  }

  if (
    code.includes("permission-denied") ||
    message.toLowerCase().includes("permission-denied")
  ) {
    return "Você não tem permissão para avaliar esse pedido.";
  }

  return message || "Falha ao enviar avaliação.";
}

export default function AvaliarProfissional() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const params = useLocalSearchParams<{
    profissionalId?: string | string[];
    nomeProfissional?: string | string[];
    pedidoId?: string | string[];
  }>();

  const profissionalId = useMemo(
    () => normalizeParam(params.profissionalId),
    [params.profissionalId]
  );
  const pedidoId = useMemo(() => normalizeParam(params.pedidoId), [params.pedidoId]);
  const nomeProfissional = useMemo(
    () => normalizeParam(params.nomeProfissional) || "Profissional",
    [params.nomeProfissional]
  );

  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroTela, setErroTela] = useState("");
  const [semUser, setSemUser] = useState(false);
  const [jaAvaliado, setJaAvaliado] = useState(false);
  const [pedidoValido, setPedidoValido] = useState(false);
  const [statusPedido, setStatusPedido] = useState("");

  useEffect(() => {
    validarPedido();
  }, [pedidoId, profissionalId]);

  async function validarPedido() {
    try {
      setCarregando(true);
      setErroTela("");

      const user = auth.currentUser;

      if (!user) {
        setSemUser(true);
        return;
      }

      if (!profissionalId || !pedidoId) {
        setErroTela("Dados inválidos para avaliação.");
        return;
      }

      const snap = await getDoc(doc(db, "pedidos", pedidoId));

      if (!snap.exists()) {
        setErroTela("Pedido não encontrado.");
        return;
      }

      const pedido = snap.data() as PedidoResumo;
      const statusAtual = String(pedido.status || "").trim().toLowerCase();
      setStatusPedido(statusAtual);

      if (String(pedido.clienteId || "") !== user.uid) {
        setErroTela("Você não pode avaliar este pedido.");
        return;
      }

      if (String(pedido.profissionalId || "") !== profissionalId) {
        setErroTela("Profissional inválido para este pedido.");
        return;
      }

      if (!statusPodeAvaliar(statusAtual)) {
        setErroTela("Só é possível avaliar após a conclusão do pedido.");
        return;
      }

      if (pedido.avaliado === true) {
        setJaAvaliado(true);
      }

      setPedidoValido(true);
    } catch (error) {
      handleError(error, "avaliar.validarPedido");
      setErroTela("Erro ao validar avaliação.");
    } finally {
      setCarregando(false);
    }
  }

  async function salvarAvaliacao() {
    try {
      if (!pedidoValido) {
        Alert.alert("Erro", "Avaliação inválida.");
        return;
      }

      if (jaAvaliado) {
        Alert.alert("Aviso", "Esse pedido já foi avaliado.");
        return;
      }

      if (!profissionalId || !pedidoId) {
        Alert.alert("Erro", "Pedido ou profissional inválido.");
        return;
      }

      if (nota < 1 || nota > 5) {
        Alert.alert("Erro", "Escolha uma nota de 1 a 5.");
        return;
      }

      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Erro", "Usuário não autenticado.");
        return;
      }

      // garante que o token está válido
      await user.getIdToken(true);

      setSalvando(true);

      const fn = httpsCallable(functions, "avaliarProfissional");

      await fn({
        profissionalId,
        pedidoId,
        nota,
        comentario: comentario.trim(),
        nomeProfissional,
      });

      setJaAvaliado(true);

      Alert.alert("Sucesso", "Avaliação enviada com sucesso!", [
        { text: "OK", onPress: () => router.replace("/pedidos") },
      ]);
    } catch (error: any) {
      handleError(error, "avaliar.salvar");
      Alert.alert("Erro", getErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }
  function renderStars() {
    return (
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= nota;
          return (
            <Pressable
              key={n}
              onPress={() => setNota(n)}
              disabled={jaAvaliado || salvando}
              style={styles.starButton}
            >
              <Ionicons
                name={active ? "star" : "star-outline"}
                size={44}
                color={active ? "#FFD94D" : "#AAB7E8"}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (carregando) {
    return (
      <ScreenContainer scroll={false}>
        <OfflineBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Validando avaliação...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (semUser) return <Redirect href="/" />;

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader
        title="Avaliar profissional"
        showBackButton
        onBack={() => router.replace("/pedidos")}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Avaliar profissional</Text>
          <Text style={styles.heroSubtitle}>
            Sua opinião ajuda a melhorar a experiência no app.
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {nomeProfissional.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name}>{nomeProfissional}</Text>
            <Text style={styles.meta}>Pedido: {pedidoId || "-"}</Text>
            <Text style={styles.meta}>Status: {statusPedido || "-"}</Text>
          </View>
        </View>

        {erroTela ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Não foi possível avaliar</Text>
            <Text style={styles.errorText}>{erroTela}</Text>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.replace("/pedidos")}
            >
              <Text style={styles.secondaryButtonText}>Voltar para pedidos</Text>
            </Pressable>
          </View>
        ) : jaAvaliado ? (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Avaliação já enviada</Text>
            <Text style={styles.successText}>
              Esse pedido já foi avaliado anteriormente.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace("/pedidos")}
            >
              <Text style={styles.primaryButtonText}>Voltar para pedidos</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Sua nota</Text>
            {renderStars()}

            <Text style={styles.sectionHint}>
              Toque nas estrelas para escolher de 1 a 5.
            </Text>

            <Text style={[styles.sectionTitle, styles.commentTitle]}>
              Comentário
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Conte como foi seu atendimento"
              placeholderTextColor="#95A6D9"
              value={comentario}
              onChangeText={setComentario}
              multiline
              textAlignVertical="top"
              editable={!salvando}
              maxLength={1000}
            />

            <Text style={styles.counter}>{comentario.length}/1000</Text>

            <Pressable
              style={[styles.primaryButton, salvando && styles.disabledButton]}
              onPress={salvarAvaliacao}
              disabled={salvando}
            >
              {salvando ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Enviar avaliação</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    content: {
      paddingBottom: 28,
      gap: 16,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
    },
    loadingText: {
      marginTop: 12,
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600",
    },
    heroCard: {
      backgroundColor: "#0F1E45",
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "#20356F",
      paddingVertical: 24,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    heroTitle: {
      color: "#FFFFFF",
      fontSize: 32,
      fontWeight: "900",
      textAlign: "center",
    },
    heroSubtitle: {
      color: "#B8C8F3",
      fontSize: 15,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 8,
      lineHeight: 22,
    },
    profileCard: {
      backgroundColor: "#0E1A3A",
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "#1A2F67",
      padding: 18,
      flexDirection: "row",
      gap: 14,
      alignItems: "center",
    },
    avatar: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: "#173CFF",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "#FFFFFF",
      fontSize: 26,
      fontWeight: "900",
    },
    profileInfo: {
      flex: 1,
      gap: 4,
    },
    name: {
      color: "#FFFFFF",
      fontSize: 28,
      fontWeight: "900",
    },
    meta: {
      color: "#C8D7FF",
      fontSize: 14,
      fontWeight: "600",
    },
    formCard: {
      backgroundColor: "#0E1A3A",
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "#1A2F67",
      padding: 18,
    },
    sectionTitle: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 12,
    },
    commentTitle: {
      marginTop: 18,
    },
    starRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    starButton: {
      paddingVertical: 6,
      paddingHorizontal: 2,
    },
    sectionHint: {
      color: "#AFC5FF",
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 20,
    },
    input: {
      minHeight: 140,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: "#E6EEFF",
      backgroundColor: "#12214A",
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "600",
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    counter: {
      color: "#95A6D9",
      fontSize: 13,
      fontWeight: "700",
      textAlign: "right",
      marginTop: 8,
    },
    primaryButton: {
      backgroundColor: "#39C46A",
      borderRadius: 18,
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 18,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 20,
      fontWeight: "900",
    },
    secondaryButton: {
      backgroundColor: "#1F2BFF",
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 18,
    },
    secondaryButtonText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "800",
    },
    disabledButton: {
      opacity: 0.65,
    },
    errorCard: {
      backgroundColor: "#2A1630",
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "#8A3254",
      padding: 18,
    },
    errorTitle: {
      color: "#FFB6C8",
      fontSize: 22,
      fontWeight: "900",
      marginBottom: 8,
    },
    errorText: {
      color: "#FFE1E8",
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 22,
    },
    successCard: {
      backgroundColor: "#0F2A20",
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "#2E8B57",
      padding: 18,
    },
    successTitle: {
      color: "#86F2AF",
      fontSize: 22,
      fontWeight: "900",
      marginBottom: 8,
    },
    successText: {
      color: "#D9FFE7",
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 22,
    },
  });
}
