// SUA PÁGINA ORIGINAL MANTIDA + BACKEND SEGURO

import { Redirect, router, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

export default function AvaliarProfissional() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const params = useLocalSearchParams<{
    profissionalId?: string;
    nomeProfissional?: string;
    pedidoId?: string;
  }>();

  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroTela, setErroTela] = useState("");
  const [semUser, setSemUser] = useState(false);
  const [jaAvaliado, setJaAvaliado] = useState(false);
  const [pedidoValido, setPedidoValido] = useState(false);

  useEffect(() => {
    validarPedido();
  }, []);

  async function validarPedido() {
    try {
      const user = auth.currentUser;

      if (!user) {
        setSemUser(true);
        return;
      }

      if (!params.profissionalId || !params.pedidoId) {
        setErroTela("Dados inválidos.");
        return;
      }

      const snap = await getDoc(doc(db, "pedidos", String(params.pedidoId)));

      if (!snap.exists()) {
        setErroTela("Pedido não encontrado.");
        return;
      }

      const pedido = snap.data() as PedidoResumo;

      // 🔒 validações fortes
      if (pedido.clienteId !== user.uid) {
        setErroTela("Você não pode avaliar este pedido.");
        return;
      }

      if (pedido.profissionalId !== params.profissionalId) {
        setErroTela("Profissional inválido.");
        return;
      }

      if (pedido.status !== "concluido") {
        setErroTela("Só pode avaliar após conclusão.");
        return;
      }

      if (pedido.avaliado) {
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
        Alert.alert("Aviso", "Já avaliado.");
        return;
      }

      if (nota < 1 || nota > 5) {
        Alert.alert("Erro", "Escolha uma nota.");
        return;
      }

      setSalvando(true);

      // 🔥 AQUI É A MUDANÇA REAL (backend seguro)
      const fn = httpsCallable(functions, "avaliarProfissional");

      await fn({
        profissionalId: params.profissionalId,
        pedidoId: params.pedidoId,
        nota,
        comentario: comentario.trim(),
        nomeProfissional: params.nomeProfissional,
      });

      setJaAvaliado(true);

      Alert.alert("Sucesso", "Avaliação enviada!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      handleError(error, "avaliar.salvar");
      Alert.alert("Erro", error?.message || "Falha ao avaliar.");
    } finally {
      setSalvando(false);
    }
  }

  function renderEstrelas() {
    return (
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => setNota(n)}
            disabled={jaAvaliado || salvando}
          >
            <Text style={styles.star}>
              {n <= nota ? "⭐" : "☆"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (carregando) {
    return (
      <ScreenContainer scroll={false}>
        <OfflineBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text>Carregando...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (semUser) return <Redirect href="/" />;

  if (erroTela) {
    return (
      <ScreenContainer>
        <OfflineBanner />
        <AppHeader title="Avaliar" showBackButton />
        <Text>{erroTela}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader title="Avaliar profissional" showBackButton />

      <ScrollView style={styles.container}>
        <Text style={styles.title}>
          {params.nomeProfissional || "Profissional"}
        </Text>

        {jaAvaliado ? (
          <Text>Você já avaliou.</Text>
        ) : (
          <>
            {renderEstrelas()}

            <TextInput
              style={styles.input}
              placeholder="Comentário"
              value={comentario}
              onChangeText={setComentario}
              multiline
            />

            <TouchableOpacity
              style={styles.btn}
              onPress={salvarAvaliacao}
              disabled={salvando}
            >
              <Text style={styles.btnText}>
                {salvando ? "Enviando..." : "Enviar"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any, mode?: string) {
  return StyleSheet.create({
    container: { padding: 20 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
    row: { flexDirection: "row", gap: 8 },
    star: { fontSize: 30 },
    input: {
      borderWidth: 1,
      borderColor: "#ccc",
      borderRadius: 12,
      padding: 12,
      marginTop: 20,
      minHeight: 100,
    },
    btn: {
      backgroundColor: "green",
      padding: 16,
      marginTop: 20,
      borderRadius: 12,
      alignItems: "center",
    },
    btnText: { color: "#fff", fontWeight: "bold" },
  });
}