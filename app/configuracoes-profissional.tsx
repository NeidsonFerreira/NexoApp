import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updateEmail,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { createTheme } from "../components/theme";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db } from "../lib/firebase";

type DadosProfissional = {
  email?: string;
  notificacoesAtivas?: boolean;
  tipo?: string;
};

export default function ConfiguracoesProfissional() {
  const { theme, themeMode, toggleTheme } = useAppTheme();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [dados, setDados] = useState<DadosProfissional>({
    email: "",
    notificacoesAtivas: false,
    tipo: "profissional",
  });

  const [notificacoesAtivas, setNotificacoesAtivas] = useState(false);
  const [localizacaoAtiva, setLocalizacaoAtiva] = useState(false);

  const [modalEmail, setModalEmail] = useState(false);
  const [modalSenha, setModalSenha] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [senhaAtualEmail, setSenhaAtualEmail] = useState("");

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState("");

  const [pedidos, setPedidos] = useState<any[]>([]);

  useEffect(() => {
    carregarConfiguracoes();
    ouvirPedidos();
  }, []);

  
  function ouvirPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "pedidos"),
      where("profissionalId", "==", user.uid)
    );

    return onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPedidos(lista);
    });
  }

  function temAtendimentoAtivo() {
    return pedidos.some((p) =>
      ["aceito", "a_caminho", "chegou"].includes(p.status)
    );
  }

  function finalizarAtendimentoAviso() {
    Alert.alert(
      "Finalize o atendimento",
      "Conclua o atendimento na tela de pedidos."
    );
  }

  async function carregarConfiguracoes() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const firestoreData = snap.exists() ? (snap.data() as any) : {};

      const notif = await Notifications.getPermissionsAsync();
      const loc = await Location.getForegroundPermissionsAsync();

      const dadosFinais: DadosProfissional = {
        email: user.email || firestoreData.email || "",
        notificacoesAtivas:
          notif.granted ||
          notif.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
        tipo: firestoreData.tipo || "profissional",
      };

      setDados(dadosFinais);
      setNovoEmail(dadosFinais.email || "");
      setNotificacoesAtivas(!!dadosFinais.notificacoesAtivas);
      setLocalizacaoAtiva(loc.status === "granted");
    } catch (error) {
      console.log("Erro ao carregar configurações:", error);
      Alert.alert("Erro", "Não foi possível carregar as configurações.");
    } finally {
      setCarregando(false);
    }
  }

  async function alternarNotificacoes() {
    try {
      const permissao = await Notifications.getPermissionsAsync();

      if (!permissao.granted) {
        const novaPermissao = await Notifications.requestPermissionsAsync();

        if (!novaPermissao.granted) {
          Alert.alert(
            "Permissão necessária",
            "Ative as notificações nas configurações do celular."
          );
          return;
        }
      }

      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, "users", user.uid), {
          notificacoesAtivas: true,
        });
      }

      setNotificacoesAtivas(true);
    } catch (error) {
      console.log("Erro ao ativar notificações:", error);
      Alert.alert("Erro", "Não foi possível alterar as notificações.");
    }
  }

  async function alternarLocalizacao() {
    try {
      const permissao = await Location.getForegroundPermissionsAsync();

      if (permissao.status !== "granted") {
        const novaPermissao = await Location.requestForegroundPermissionsAsync();

        if (novaPermissao.status !== "granted") {
          Alert.alert(
            "Permissão necessária",
            "Ative a localização nas configurações do celular."
          );
          return;
        }
      }

      setLocalizacaoAtiva(true);
    } catch (error) {
      console.log("Erro ao ativar localização:", error);
      Alert.alert("Erro", "Não foi possível alterar a localização.");
    }
  }

  async function alterarEmail() {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) return;

      if (!novoEmail.trim()) {
        Alert.alert("Atenção", "Digite o novo email.");
        return;
      }

      if (!senhaAtualEmail.trim()) {
        Alert.alert("Atenção", "Digite sua senha atual.");
        return;
      }

      setSalvando(true);

      const credential = EmailAuthProvider.credential(
        user.email,
        senhaAtualEmail
      );

      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, novoEmail.trim());

      await updateDoc(doc(db, "users", user.uid), {
        email: novoEmail.trim(),
      });

      setDados((prev) => ({
        ...prev,
        email: novoEmail.trim(),
      }));

      setModalEmail(false);
      setSenhaAtualEmail("");

      Alert.alert("Sucesso", "Email alterado com sucesso.");
    } catch (error: any) {
      console.log("Erro ao alterar email:", error);

      if (error?.code === "auth/invalid-credential") {
        Alert.alert("Erro", "Senha atual incorreta.");
        return;
      }

      if (error?.code === "auth/email-already-in-use") {
        Alert.alert("Erro", "Esse email já está em uso.");
        return;
      }

      Alert.alert("Erro", "Não foi possível alterar o email.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarSenha() {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) return;

      if (!senhaAtual.trim()) {
        Alert.alert("Atenção", "Digite sua senha atual.");
        return;
      }

      if (!novaSenha.trim()) {
        Alert.alert("Atenção", "Digite a nova senha.");
        return;
      }

      if (novaSenha.length < 6) {
        Alert.alert("Atenção", "A nova senha deve ter pelo menos 6 caracteres.");
        return;
      }

      if (novaSenha !== confirmarNovaSenha) {
        Alert.alert("Atenção", "As senhas não coincidem.");
        return;
      }

      setSalvando(true);

      const credential = EmailAuthProvider.credential(user.email, senhaAtual);

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, novaSenha);

      setModalSenha(false);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarNovaSenha("");

      Alert.alert("Sucesso", "Senha alterada com sucesso.");
    } catch (error: any) {
      console.log("Erro ao alterar senha:", error);

      if (error?.code === "auth/invalid-credential") {
        Alert.alert("Erro", "Senha atual incorreta.");
        return;
      }

      Alert.alert("Erro", "Não foi possível alterar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirPolitica() {
    Alert.alert("Aviso", "Troque o link da política de privacidade depois.");
  }

  function abrirTermos() {
    Alert.alert("Aviso", "Troque o link dos termos de uso depois.");
  }

  async function sairDaConta() {
    try {
      if (temAtendimentoAtivo()) {
        Alert.alert(
          "Atendimento em andamento",
          "Finalize o atendimento antes de sair."
        );
        return;
      }

      Alert.alert("Sair da conta", "Tem certeza?", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          onPress: async () => {
            await signOut(auth);
            router.replace("/");
          },
        },
      ]);
    } catch (error) {
      console.log("Erro ao sair:", error);
      Alert.alert("Erro", "Não foi possível sair da conta.");
    }
  }

  const styles = createStyles(theme);

  if (carregando) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando configurações...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader
        title="Configurações"
        subtitle="Controle sua conta, permissões, aparência e segurança"
        showBackButton
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {temAtendimentoAtivo() && (
          <View style={{ backgroundColor: "#FF3B30", padding: 12, borderRadius: 12, marginBottom: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "bold" }}>
              Atendimento em andamento
            </Text>
            <View style={{ marginTop: 8 }}>
              <ActionButton
                title="Finalizar atendimento"
                onPress={finalizarAtendimentoAviso}
                variant="secondary"
              />
            </View>
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Conta</Text>

          <View style={styles.infoLinha}>
            <Text style={styles.infoTitulo}>Email atual</Text>
            <Text style={styles.infoValor}>{dados.email || "Sem email"}</Text>
          </View>

          <View style={styles.infoLinha}>
            <Text style={styles.infoTitulo}>Tipo de conta</Text>
            <Text style={styles.infoValor}>{dados.tipo || "profissional"}</Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Trocar email"
              onPress={() => setModalEmail(true)}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Trocar senha"
              onPress={() => setModalSenha(true)}
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Permissões</Text>

          <View style={styles.linha}>
            <View style={styles.linhaTexto}>
              <Text style={styles.itemTitulo}>Notificações</Text>
              <Text style={styles.itemSubtitulo}>
                Receber avisos de pedidos e atualizações
              </Text>
            </View>

            <Switch
              value={notificacoesAtivas}
              onValueChange={alternarNotificacoes}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.linhaSemBorda}>
            <View style={styles.linhaTexto}>
              <Text style={styles.itemTitulo}>Localização</Text>
              <Text style={styles.itemSubtitulo}>
                Permitir uso do mapa e rastreamento de atendimento
              </Text>
            </View>

            <Switch
              value={localizacaoAtiva}
              onValueChange={alternarLocalizacao}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Aparência</Text>

          <View style={styles.linhaSemBorda}>
            <View style={styles.linhaTexto}>
              <Text style={styles.itemTitulo}>Tema escuro</Text>
              <Text style={styles.itemSubtitulo}>
                Alterar entre modo escuro e claro
              </Text>
            </View>

            <Switch
              value={themeMode === "dark"}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Legal</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Política de privacidade"
              onPress={abrirPolitica}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Termos de uso"
              onPress={abrirTermos}
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Sessão</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Sair da conta"
              onPress={sairDaConta}
              variant="danger"
            />
          </View>
        </View>
      </ScrollView>

      <Modal visible={modalEmail} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Alterar email</Text>

            <Text style={styles.label}>Novo email</Text>
            <TextInput
              value={novoEmail}
              onChangeText={setNovoEmail}
              placeholder="Novo email"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Senha atual</Text>
            <TextInput
              value={senhaAtualEmail}
              onChangeText={setSenhaAtualEmail}
              placeholder="Digite sua senha atual"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <ActionButton
                title="Cancelar"
                onPress={() => setModalEmail(false)}
                variant="neutral"
                style={styles.modalBtn}
              />

              <ActionButton
                title={salvando ? "Salvando..." : "Salvar"}
                onPress={alterarEmail}
                variant="primary"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalSenha} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Alterar senha</Text>

            <Text style={styles.label}>Senha atual</Text>
            <TextInput
              value={senhaAtual}
              onChangeText={setSenhaAtual}
              placeholder="Digite sua senha atual"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              secureTextEntry
            />

            <Text style={styles.label}>Nova senha</Text>
            <TextInput
              value={novaSenha}
              onChangeText={setNovaSenha}
              placeholder="Nova senha"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              secureTextEntry
            />

            <Text style={styles.label}>Confirmar nova senha</Text>
            <TextInput
              value={confirmarNovaSenha}
              onChangeText={setConfirmarNovaSenha}
              placeholder="Confirme a nova senha"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <ActionButton
                title="Cancelar"
                onPress={() => setModalSenha(false)}
                variant="neutral"
                style={styles.modalBtn}
              />

              <ActionButton
                title={salvando ? "Salvando..." : "Salvar"}
                onPress={alterarSenha}
                variant="primary"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(theme: ReturnType<typeof createTheme>) {
  return StyleSheet.create({
    content: {
      paddingBottom: 40,
    },

    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
    },

    loadingText: {
      color: theme.colors.text,
      fontSize: 16,
      marginTop: 12,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
    },

    cardTitulo: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 14,
    },

    linha: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 18,
      marginBottom: 18,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },

    linhaSemBorda: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    linhaTexto: {
      flex: 1,
      paddingRight: 12,
    },

    itemTitulo: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "bold",
    },

    itemSubtitulo: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 4,
      lineHeight: 18,
    },

    buttonTop: {
      marginTop: 10,
    },

    infoLinha: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
    },

    infoTitulo: {
      color: theme.colors.textSecondary,
      fontSize: 15,
    },

    infoValor: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "bold",
      textTransform: "capitalize",
      maxWidth: "55%",
      textAlign: "right",
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: "center",
      padding: 20,
    },

    modalBox: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    modalTitulo: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 12,
    },

    label: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginBottom: 6,
      marginTop: 8,
    },

    input: {
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: theme.colors.text,
      fontSize: 15,
    },

    modalButtons: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },

    modalBtn: {
      flex: 1,
    },
  });
}