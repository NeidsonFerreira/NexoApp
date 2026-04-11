import { router } from "expo-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db, storage } from "../lib/firebase";

type PlanoCliente = "gratuito" | "premium";

type DadosCliente = {
  nome?: string;
  email?: string;
  telefone?: string;
  fotoPerfil?: string;
  tipo?: string;
  planoCliente?: PlanoCliente;
};

export default function PerfilCliente() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const [dados, setDados] = useState<DadosCliente>({
    nome: "",
    email: "",
    telefone: "",
    fotoPerfil: "",
    tipo: "cliente",
    planoCliente: "gratuito",
  });

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const [modalEmail, setModalEmail] = useState(false);
  const [modalSenha, setModalSenha] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [senhaAtualEmail, setSenhaAtualEmail] = useState("");

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState("");

  useEffect(() => {
    carregarPerfil();
  }, []);

  const inicialAvatar = useMemo(() => {
    return (nome?.trim()?.[0] || dados.nome?.trim()?.[0] || "C").toUpperCase();
  }, [nome, dados.nome]);

  const clientePremium = dados.planoCliente === "premium";

  async function carregarPerfil() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      const refUser = doc(db, "users", user.uid);
      const snap = await getDoc(refUser);

      const firestoreData = snap.exists() ? (snap.data() as DadosCliente) : {};

      const dadosFinais: DadosCliente = {
        nome: firestoreData.nome || "",
        email: user.email || firestoreData.email || "",
        telefone: firestoreData.telefone || "",
        fotoPerfil: firestoreData.fotoPerfil || "",
        tipo: firestoreData.tipo || "cliente",
        planoCliente:
          String(firestoreData.planoCliente || "gratuito").toLowerCase() ===
          "premium"
            ? "premium"
            : "gratuito",
      };

      setDados(dadosFinais);
      setNome(dadosFinais.nome || "");
      setTelefone(dadosFinais.telefone || "");
      setNovoEmail(dadosFinais.email || "");
    } catch (error) {
      console.log("Erro ao carregar perfil:", error);
      Alert.alert("Erro", "Não foi possível carregar seu perfil.");
    } finally {
      setCarregando(false);
    }
  }

  async function uriParaBlob(uri: string): Promise<Blob> {
    const response = await fetch(uri);
    return await response.blob();
  }

  async function escolherFotoPerfil() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      const permissao =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissao.granted) {
        Alert.alert(
          "Permissão necessária",
          "Permita acesso às fotos para escolher uma imagem de perfil."
        );
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (resultado.canceled || !resultado.assets?.length) return;

      const asset = resultado.assets[0];

      setEnviandoFoto(true);

      const manipulada = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const blob = await uriParaBlob(manipulada.uri);

      const storageRef = ref(storage, `clientes/${user.uid}/foto-perfil.jpg`);

      await uploadBytes(storageRef, blob);

      const fotoPerfilUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "users", user.uid), {
        fotoPerfil: fotoPerfilUrl,
      });

      setDados((prev) => ({
        ...prev,
        fotoPerfil: fotoPerfilUrl,
      }));

      Alert.alert("Sucesso", "Foto de perfil atualizada com sucesso.");
    } catch (error) {
      console.log("Erro ao enviar foto de perfil:", error);
      Alert.alert("Erro", "Não foi possível atualizar a foto de perfil.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvarPerfil() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      if (!nome.trim()) {
        Alert.alert("Atenção", "Digite seu nome.");
        return;
      }

      if (telefone && telefone.replace(/\D/g, "").length < 10) {
        Alert.alert("Atenção", "Telefone inválido.");
        return;
      }

      setSalvando(true);

      await updateDoc(doc(db, "users", user.uid), {
        nome: nome.trim(),
        telefone: telefone.trim(),
      });

      setDados((prev) => ({
        ...prev,
        nome: nome.trim(),
        telefone: telefone.trim(),
      }));

      Alert.alert("Sucesso", "Perfil atualizado com sucesso.");
    } catch (error) {
      console.log("Erro ao salvar perfil:", error);
      Alert.alert("Erro", "Não foi possível salvar seu perfil.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarEmail() {
    try {
      const user = auth.currentUser;

      if (!user || !user.email) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      if (!novoEmail.trim()) {
        Alert.alert("Atenção", "Digite o novo email.");
        return;
      }

      if (!senhaAtualEmail.trim()) {
        Alert.alert("Atenção", "Digite sua senha atual.");
        return;
      }

      if (telefone && telefone.replace(/\D/g, "").length < 10) {
        Alert.alert("Atenção", "Telefone inválido.");
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

      if (!user || !user.email) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

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

      if (telefone && telefone.replace(/\D/g, "").length < 10) {
        Alert.alert("Atenção", "Telefone inválido.");
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

  function fecharModalEmail() {
    setModalEmail(false);
    setSenhaAtualEmail("");
    setNovoEmail(dados.email || "");
  }

  function fecharModalSenha() {
    setModalSenha(false);
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmarNovaSenha("");
  }

  function abrirPlanoCliente() {
    router.push("/plano-cliente");
  }

  if (carregando) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando perfil...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader
        title="Meu Perfil"
        subtitle="Gerencie seus dados e sua segurança"
        showBackButton
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <TouchableOpacity
            style={styles.avatarTouch}
            onPress={escolherFotoPerfil}
            activeOpacity={0.9}
            disabled={enviandoFoto}
          >
            {dados.fotoPerfil ? (
              <Image
                source={{ uri: dados.fotoPerfil }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarFake}>
                <Text style={styles.avatarTexto}>{inicialAvatar}</Text>
              </View>
            )}

            <View style={styles.avatarBadge}>
              {enviandoFoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.avatarBadgeTexto}>Editar</Text>
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.titulo}>Perfil do Cliente</Text>
          <Text style={styles.subtitulo}>
            Atualize suas informações e mantenha sua conta segura
          </Text>
        </View>

        <View
          style={[
            styles.card,
            clientePremium ? styles.cardPlanoPremium : styles.cardPlanoGratis,
          ]}
        >
          <View style={styles.planoTopo}>
            <View style={styles.planoTituloWrap}>
              <Ionicons
                name={clientePremium ? "diamond-outline" : "card-outline"}
                size={20}
                color={clientePremium ? theme.colors.success : theme.colors.warning}
              />
              <Text
                style={[
                  styles.cardTitulo,
                  clientePremium
                    ? styles.cardTituloPremium
                    : styles.cardTituloGratis,
                ]}
              >
                Plano do cliente
              </Text>
            </View>

            <View
              style={[
                styles.planoBadge,
                clientePremium
                  ? styles.planoBadgePremium
                  : styles.planoBadgeGratis,
              ]}
            >
              <Text
                style={[
                  styles.planoBadgeTexto,
                  clientePremium
                    ? styles.planoBadgeTextoPremium
                    : styles.planoBadgeTextoGratis,
                ]}
              >
                {clientePremium ? "PREMIUM" : "GRATUITO"}
              </Text>
            </View>
          </View>

          <Text style={styles.planoDescricao}>
            {clientePremium
              ? "Seu plano premium está ativo. Você navega pelo app sem anúncios."
              : "Você está no plano gratuito. Faça upgrade para remover anúncios e ter uma experiência mais limpa."}
          </Text>

          <View style={styles.planoBeneficios}>
            <Text style={styles.planoBeneficioItem}>
              {clientePremium ? "✅" : "•"} Acesso à conta do cliente
            </Text>
            <Text style={styles.planoBeneficioItem}>
              {clientePremium ? "✅" : "•"} Busca e pedidos normalmente
            </Text>
            <Text style={styles.planoBeneficioItem}>
              {clientePremium ? "✅" : "❌"} Navegação sem anúncios
            </Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title={clientePremium ? "GERENCIAR PLANO" : "ATIVAR PREMIUM"}
              onPress={abrirPlanoCliente}
              variant={clientePremium ? "success" : "warning"}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Dados pessoais</Text>

          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={nome}
            onChangeText={setNome}
            placeholder="Seu nome"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Telefone</Text>
          <TextInput
            value={telefone}
            onChangeText={setTelefone}
            placeholder="Seu telefone"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email atual</Text>
          <View style={styles.inputBloqueado}>
            <Text style={styles.inputBloqueadoTexto}>
              {dados.email || "Sem email"}
            </Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title={salvando ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
              onPress={salvarPerfil}
              variant="primary"
              disabled={salvando || enviandoFoto}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Segurança</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="TROCAR EMAIL"
              onPress={() => setModalEmail(true)}
              variant="neutral"
              disabled={salvando}
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="TROCAR SENHA"
              onPress={() => setModalSenha(true)}
              variant="neutral"
              disabled={salvando}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Conta</Text>

          <View style={styles.infoLinha}>
            <Text style={styles.infoTitulo}>Tipo de conta</Text>
            <Text style={styles.infoValor}>{dados.tipo || "cliente"}</Text>
          </View>

          <View style={styles.infoLinha}>
            <Text style={styles.infoTitulo}>Plano atual</Text>
            <Text
              style={[
                styles.infoValor,
                clientePremium ? styles.infoPremium : styles.infoGratis,
              ]}
            >
              {clientePremium ? "premium" : "gratuito"}
            </Text>
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
              <View style={styles.modalBtn}>
                <ActionButton
                  title="CANCELAR"
                  onPress={fecharModalEmail}
                  variant="neutral"
                  disabled={salvando}
                />
              </View>

              <View style={styles.modalBtn}>
                <ActionButton
                  title={salvando ? "SALVANDO..." : "SALVAR"}
                  onPress={alterarEmail}
                  variant="primary"
                  disabled={salvando}
                />
              </View>
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
              <View style={styles.modalBtn}>
                <ActionButton
                  title="CANCELAR"
                  onPress={fecharModalSenha}
                  variant="neutral"
                  disabled={salvando}
                />
              </View>

              <View style={styles.modalBtn}>
                <ActionButton
                  title={salvando ? "SALVANDO..." : "SALVAR"}
                  onPress={alterarSenha}
                  variant="primary"
                  disabled={salvando}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
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
      marginTop: 12,
      fontSize: 16,
    },

    headerCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.xl,
      padding: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      marginBottom: 18,
      ...(theme.shadow?.card || {}),
    },

    avatarTouch: {
      position: "relative",
      marginBottom: 14,
    },

    avatarFake: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },

    avatarImage: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: theme.colors.cardSoft,
    },

    avatarTexto: {
      color: "#fff",
      fontSize: 36,
      fontWeight: "bold",
    },

    avatarBadge: {
      position: "absolute",
      right: -6,
      bottom: -4,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.card,
      minWidth: 58,
      alignItems: "center",
    },

    avatarBadgeTexto: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
    },

    titulo: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "bold",
      textAlign: "center",
    },

    subtitulo: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginTop: 6,
      textAlign: "center",
      lineHeight: 20,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
      ...(theme.shadow?.card || {}),
    },

    cardPlanoPremium: {
      borderColor: theme.colors.success,
    },

    cardPlanoGratis: {
      borderColor: theme.colors.warning,
    },

    cardTitulo: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 14,
    },

    cardTituloPremium: {
      color: theme.colors.success,
      marginBottom: 0,
    },

    cardTituloGratis: {
      color: theme.colors.warning,
      marginBottom: 0,
    },

    planoTopo: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    },

    planoTituloWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },

    planoBadge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },

    planoBadgePremium: {
      backgroundColor: "rgba(34,197,94,0.12)",
      borderColor: theme.colors.success,
    },

    planoBadgeGratis: {
      backgroundColor: "rgba(245,158,11,0.12)",
      borderColor: theme.colors.warning,
    },

    planoBadgeTexto: {
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },

    planoBadgeTextoPremium: {
      color: theme.colors.success,
    },

    planoBadgeTextoGratis: {
      color: theme.colors.warning,
    },

    planoDescricao: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 12,
    },

    planoBeneficios: {
      gap: 6,
      marginBottom: 4,
    },

    planoBeneficioItem: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
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

    inputBloqueado: {
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 8,
    },

    inputBloqueadoTexto: {
      color: theme.colors.textMuted,
      fontSize: 15,
    },

    buttonTop: {
      marginTop: 12,
    },

    infoLinha: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      gap: 12,
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
    },

    infoPremium: {
      color: theme.colors.success,
    },

    infoGratis: {
      color: theme.colors.warning,
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
      ...(theme.shadow?.card || {}),
    },

    modalTitulo: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 12,
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