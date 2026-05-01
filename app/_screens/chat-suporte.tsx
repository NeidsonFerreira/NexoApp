import * as ImagePicker from "expo-image-picker";
import { Redirect, useLocalSearchParams } from "expo-router";
import { signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { OfflineBanner } from "../../components/OfflineBanner";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db, functions, storage } from "../../lib/firebase";
import { handleError } from "../../lib/errorHandler";

type StatusTela = "carregando" | "ok" | "sem-user" | "erro";
type TipoUsuario = "cliente" | "profissional";
type StatusChat = "aberto" | "fechado";
type AutorMensagem = "cliente" | "profissional" | "admin" | "sistema";
type TipoMensagem = "texto" | "imagem" | "sistema";

type ChatSuporte = {
  id: string;
  userId?: string;
  userTipo?: TipoUsuario;
  userNome?: string;
  status?: StatusChat;
  ultimaMensagem?: string;
  atualizadoEm?: any;
  criadoEm?: any;
  isAnonimo?: boolean;
  origemSuporte?: string;
  categoria?: string;
  topico?: string;
};

type MensagemSuporte = {
  id: string;
  texto?: string;
  imagemUrl?: string;
  autorId?: string;
  autorTipo?: AutorMensagem;
  tipo?: TipoMensagem;
  criadoEm?: any;
};

type EnviarMensagemSuporteResponse = {
  ok?: boolean;
  mensagemId?: string;
  resumo?: string;
  tipo?: "texto" | "imagem";
};

function formatarData(valor: any) {
  try {
    if (!valor) return "";
    const data =
      typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
    if (Number.isNaN(data.getTime())) return "";
    return data.toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return await response.blob();
}

export default function ChatSuporte() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);
  const params = useLocalSearchParams<{ origem?: string; categoria?: string; topico?: string }>();

  const veioDeRecuperacao = params.origem === "recuperacao";
  const categoriaParam = String(params.categoria || params.topico || "").trim();

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [chat, setChat] = useState<ChatSuporte | null>(null);
  const [mensagens, setMensagens] = useState<MensagemSuporte[]>([]);
  const [texto, setTexto] = useState("");
  const [enviandoTexto, setEnviandoTexto] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [uidAtivo, setUidAtivo] = useState("");
  const [isAnonimo, setIsAnonimo] = useState(false);
  const [tipoUsuarioAtual, setTipoUsuarioAtual] =
    useState<TipoUsuario>("cliente");

  const scrollRef = useRef<ScrollView>(null);

  const chatFechado = chat?.status === "fechado";

  const placeholderTexto = veioDeRecuperacao
    ? "Explique seu problema de acesso..."
    : "Digite sua mensagem...";

  function categoriaPorOrigem(origem?: string) {
    const chave = String(origem || "").trim().toLowerCase();
    if (chave === "ajuda_pedido_cliente") return "Dúvida sobre Pedido";
    if (chave === "bug_app_cliente") return "Bug no App";
    if (chave === "profissional_ticket") return "Suporte Técnico Profissional";
    if (chave === "bug_profissional") return "Erro na Agenda";
    return "";
  }

  const categoriaAtiva =
    categoriaParam ||
    categoriaPorOrigem(params.origem) ||
    (veioDeRecuperacao ? "Recuperação de Conta" : "Suporte Geral");

  const podeEnviarTexto = useMemo(() => {
    return !!texto.trim() && !enviandoTexto && !enviandoImagem;
  }, [texto, enviandoTexto, enviandoImagem]);

  function montarMensagemAutomatica(
    origemRecuperacao: boolean,
    anonimo: boolean
  ) {
    if (origemRecuperacao || anonimo) {
      return "Olá, somos o Suporte Nexo! Envie informações sobre a sua conta para que possamos ajudar.";
    }

    return "Olá, somos o Suporte Nexo! Como podemos ajudar?";
  }

  async function criarMensagemSistema(uid: string, textoSistema: string) {
    await setDoc(
      doc(db, "suporte_chats", uid),
      {
        ultimaMensagem: textoSistema,
        atualizadoEm: serverTimestamp(),
        status: "aberto",
      },
      { merge: true }
    );

    await setDoc(
      doc(collection(db, "suporte_chats", uid, "mensagens")),
      {
        texto: textoSistema,
        autorId: "system",
        autorTipo: "sistema",
        tipo: "sistema",
        criadoEm: serverTimestamp(),
      },
      { merge: true }
    );
  }

  useEffect(() => {
    let ativo = true;
    let unsubscribeChat: (() => void) | undefined;
    let unsubscribeMensagens: (() => void) | undefined;

    async function iniciar() {
      try {
        let currentUser = auth.currentUser;

        if (!currentUser) {
          const cred = await signInAnonymously(auth);
          currentUser = cred.user;
        }

        if (!currentUser) {
          if (ativo) setStatusTela("sem-user");
          return;
        }

        const anonimo = currentUser.isAnonymous;
        const uid = currentUser.uid;

        if (!ativo) return;

        setUidAtivo(uid);
        setIsAnonimo(anonimo);

        let userNome = anonimo
          ? "Visitante"
          : String(currentUser.displayName || "").trim() || "Usuário";

        let userTipo: TipoUsuario = "cliente";

        if (!anonimo) {
          try {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              const userData = userSnap.data() as any;

              userNome =
                String(userData?.nome || "").trim() ||
                String(userData?.name || "").trim() ||
                userNome;

              userTipo =
                userData?.tipo === "profissional" ? "profissional" : "cliente";
            }
          } catch (userError) {
            handleError(userError, "ChatSuporte.lerUser");
          }
        }

        setTipoUsuarioAtual(userTipo);

        const chatRef = doc(db, "suporte_chats", uid);

        await setDoc(
          chatRef,
          {
            userId: uid,
            userNome:
              veioDeRecuperacao && anonimo
                ? "Visitante - Recuperação"
                : userNome,
            userTipo,
            status: "aberto",
            atualizadoEm: serverTimestamp(),
            criadoEm: serverTimestamp(),
            isAnonimo: anonimo,
            origemSuporte: veioDeRecuperacao ? "recuperacao" : "geral",
            categoria: categoriaAtiva,
            topico: categoriaAtiva,
          },
          { merge: true }
        );

        const primeiraMensagemQuery = query(
          collection(db, "suporte_chats", uid, "mensagens"),
          orderBy("criadoEm", "asc"),
          limit(1)
        );

        const primeiraMensagemSnap = await getDocs(primeiraMensagemQuery);

        if (primeiraMensagemSnap.empty) {
          await criarMensagemSistema(
            uid,
            montarMensagemAutomatica(veioDeRecuperacao, anonimo)
          );

          if (veioDeRecuperacao) {
            const textoInicial =
              "Olá, estou sem acesso ao meu email e preciso de ajuda para recuperar minha conta.";

            const fn = httpsCallable<
              { texto: string; tipo: "texto"; origem: string; categoria: string },
              EnviarMensagemSuporteResponse
            >(functions, "enviarMensagemSuporte");

            await fn({
              texto: textoInicial,
              tipo: "texto",
              origem: "recuperacao",
              categoria: categoriaAtiva,
            });
          }
        }

        unsubscribeChat = onSnapshot(
          chatRef,
          (snapshot) => {
            if (!ativo) return;

            if (!snapshot.exists()) {
              setChat(null);
              setStatusTela("erro");
              return;
            }

            setChat({
              id: snapshot.id,
              ...(snapshot.data() as Omit<ChatSuporte, "id">),
            });

            setStatusTela("ok");
          },
          (error) => {
            handleError(error, "ChatSuporte.snapshotChat");
            if (ativo) setStatusTela("erro");
          }
        );

        const qMensagens = query(
          collection(db, "suporte_chats", uid, "mensagens"),
          orderBy("criadoEm", "asc")
        );

        unsubscribeMensagens = onSnapshot(
          qMensagens,
          (snapshot) => {
            if (!ativo) return;

            const lista = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<MensagemSuporte, "id">),
            }));

            setMensagens(lista);
          },
          (error) => {
            handleError(error, "ChatSuporte.snapshotMensagens");
          }
        );
      } catch (error) {
        handleError(error, "ChatSuporte.iniciar");
        if (ativo) setStatusTela("erro");
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeChat) unsubscribeChat();
      if (unsubscribeMensagens) unsubscribeMensagens();
    };
  }, [veioDeRecuperacao, categoriaAtiva]);

  function rolarParaFim() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  async function reabrirChamadoAutomaticamente() {
    if (!uidAtivo || !chatFechado) return;

    await updateDoc(doc(db, "suporte_chats", uidAtivo), {
      status: "aberto",
      atualizadoEm: serverTimestamp(),
    });

    await criarMensagemSistema(
      uidAtivo,
      montarMensagemAutomatica(veioDeRecuperacao, isAnonimo)
    );
  }

  async function enviarMensagemTexto() {
    const textoFinal = texto.trim();

    if (!uidAtivo || !textoFinal || enviandoTexto) {
      return;
    }

    try {
      setEnviandoTexto(true);

      if (chatFechado) {
        await reabrirChamadoAutomaticamente();
      }

      const fn = httpsCallable<
        { texto: string; tipo: "texto"; origem: string; categoria: string },
        EnviarMensagemSuporteResponse
      >(functions, "enviarMensagemSuporte");

      await fn({
        texto: textoFinal,
        tipo: "texto",
        origem: veioDeRecuperacao ? "recuperacao" : "geral",
        categoria: categoriaAtiva,
      });

      setTexto("");
      rolarParaFim();
    } catch (error) {
      handleError(error, "ChatSuporte.enviarTexto");
      Alert.alert("Erro", "Não foi possível enviar a mensagem.");
    } finally {
      setEnviandoTexto(false);
    }
  }

  async function enviarImagem() {
    if (!uidAtivo || enviandoImagem || enviandoTexto) {
      return;
    }

    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissao.granted) {
        Alert.alert(
          "Permissão necessária",
          "Você precisa permitir acesso às fotos para enviar imagens."
        );
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const arquivo = resultado.assets[0];
      const uri = arquivo.uri;

      if (!uri) {
        Alert.alert("Erro", "Não foi possível ler a imagem selecionada.");
        return;
      }

      setEnviandoImagem(true);

      if (chatFechado) {
        await reabrirChamadoAutomaticamente();
      }

      const blob = await uriToBlob(uri);
      const extensao = uri.split(".").pop()?.toLowerCase() || "jpg";
      const nomeArquivo = `${Date.now()}.${extensao}`;

      const storageFileRef = ref(storage, `suporte/${uidAtivo}/${nomeArquivo}`);

      await uploadBytes(storageFileRef, blob);
      const imagemUrl = await getDownloadURL(storageFileRef);

      const fn = httpsCallable<
        { imagemUrl: string; tipo: "imagem"; origem: string; categoria: string },
        EnviarMensagemSuporteResponse
      >(functions, "enviarMensagemSuporte");

      await fn({
        imagemUrl,
        tipo: "imagem",
        origem: veioDeRecuperacao ? "recuperacao" : "geral",
        categoria: categoriaAtiva,
      });

      rolarParaFim();
    } catch (error) {
      handleError(error, "ChatSuporte.enviarImagem");
      Alert.alert("Erro", "Não foi possível enviar a imagem.");
    } finally {
      setEnviandoImagem(false);
    }
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <OfflineBanner />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando suporte...</Text>
      </View>
    );
  }

  if (statusTela === "sem-user") {
    return <Redirect href="/" />;
  }

  if (statusTela === "erro") {
    return (
      <View style={styles.center}>
        <OfflineBanner />
        <Text style={styles.loadingText}>
          Não foi possível carregar o chat de suporte.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 84}
    >
      <OfflineBanner />

      <AppHeader
        title="Chat suporte"
        subtitle={
          isAnonimo
            ? `Atendimento para visitante • ${categoriaAtiva}`
            : `Fale com nossa equipe • ${categoriaAtiva}`
        }
        showBackButton
      />

      <View style={styles.topInfoCard}>
        <View style={styles.topRow}>
          <View
            style={[
              styles.statusBadge,
              chatFechado ? styles.statusBadgeNeutral : styles.statusBadgeSuccess,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {chatFechado ? "FECHADO" : "ABERTO"}
            </Text>
          </View>
        </View>

        <Text style={styles.topInfoText}>
          {veioDeRecuperacao
            ? "Atendimento de recuperação de conta. Explique seu problema e envie imagem se precisar."
            : chatFechado
            ? "Este chamado foi encerrado. Envie nova mensagem para reabrir automaticamente."
            : "Envie sua dúvida em texto ou imagem."}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messagesArea}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={rolarParaFim}
      >
        {mensagens.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Nenhuma mensagem ainda</Text>
            <Text style={styles.emptyText}>
              Envie sua primeira mensagem para abrir o atendimento.
            </Text>
          </View>
        ) : (
          mensagens.map((item) => {
            const isSistema = item.autorTipo === "sistema";
            const isMinhaMensagem =
              item.autorTipo === "cliente" || item.autorTipo === "profissional";

            if (isSistema) {
              return (
                <View key={item.id} style={styles.systemWrap}>
                  <Text style={styles.systemText}>{item.texto || ""}</Text>
                </View>
              );
            }

            return (
              <View
                key={item.id}
                style={[
                  styles.bubbleWrap,
                  isMinhaMensagem
                    ? styles.bubbleWrapMine
                    : styles.bubbleWrapAdmin,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isMinhaMensagem ? styles.bubbleMine : styles.bubbleAdmin,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleAuthor,
                      isMinhaMensagem && styles.bubbleAuthorMine,
                    ]}
                  >
                    {isMinhaMensagem ? "Você" : "Suporte"}
                  </Text>

                  {item.tipo === "imagem" && item.imagemUrl ? (
                    <Image
                      source={{ uri: item.imagemUrl }}
                      style={styles.messageImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.bubbleText,
                        isMinhaMensagem && styles.bubbleTextMine,
                      ]}
                    >
                      {item.texto || ""}
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.bubbleDate,
                      isMinhaMensagem && styles.bubbleDateMine,
                    ]}
                  >
                    {formatarData(item.criadoEm)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputArea}>
        <TextInput
          style={[
            styles.input,
            (enviandoTexto || enviandoImagem) && styles.inputDisabled,
          ]}
          value={texto}
          onChangeText={setTexto}
          placeholder={placeholderTexto}
          placeholderTextColor={theme.colors.textMuted}
          editable={!enviandoTexto && !enviandoImagem}
          multiline
        />

        <View style={styles.buttonsRow}>
          <View style={styles.buttonHalf}>
            <ActionButton
              title={enviandoImagem ? "ENVIANDO IMAGEM..." : "IMAGEM"}
              onPress={enviarImagem}
              variant="neutral"
              disabled={enviandoImagem || enviandoTexto}
            />
          </View>

          <View style={styles.buttonHalf}>
            <ActionButton
              title={enviandoTexto ? "ENVIANDO..." : "ENVIAR"}
              onPress={enviarMensagemTexto}
              variant="primary"
              disabled={!podeEnviarTexto}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
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
      textAlign: "center",
    },

    topInfoCard: {
      marginHorizontal: 18,
      marginBottom: 10,
      padding: 14,
      borderRadius: 18,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },

    topInfoText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },

    statusBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    statusBadgeSuccess: {
      backgroundColor: theme.colors.success,
    },

    statusBadgeNeutral: {
      backgroundColor: theme.colors.border,
    },

    statusBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
    },

    messagesArea: {
      flex: 1,
    },

    messagesContent: {
      paddingHorizontal: 18,
      paddingBottom: 18,
      gap: 10,
    },

    emptyWrap: {
      paddingTop: 32,
      alignItems: "center",
      justifyContent: "center",
    },

    emptyTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
      textAlign: "center",
    },

    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },

    systemWrap: {
      alignItems: "center",
      marginVertical: 4,
    },

    systemText: {
      fontSize: 12,
      color: theme.colors.textMuted,
      textAlign: "center",
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      overflow: "hidden",
    },

    bubbleWrap: {
      width: "100%",
    },

    bubbleWrapMine: {
      alignItems: "flex-end",
    },

    bubbleWrapAdmin: {
      alignItems: "flex-start",
    },

    bubble: {
      maxWidth: "85%",
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.18 : 0.05,
      shadowRadius: 8,
      elevation: 1,
    },

    bubbleMine: {
      backgroundColor: theme.colors.primary,
    },

    bubbleAdmin: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    bubbleAuthor: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
    },

    bubbleAuthorMine: {
      color: "#fff",
    },

    bubbleText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },

    bubbleTextMine: {
      color: "#fff",
    },

    bubbleDate: {
      color: theme.colors.textMuted,
      fontSize: 11,
      marginTop: 8,
    },

    bubbleDateMine: {
      color: "rgba(255,255,255,0.85)",
    },

    messageImage: {
      width: 220,
      height: 220,
      borderRadius: 14,
      marginTop: 2,
    },

    inputArea: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: Platform.OS === "ios" ? 24 : 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },

    input: {
      minHeight: 52,
      maxHeight: 120,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.colors.text,
      fontSize: 15,
      textAlignVertical: "top",
    },

    inputDisabled: {
      opacity: 0.7,
    },

    buttonsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },

    buttonHalf: {
      flex: 1,
    },
  });
}
