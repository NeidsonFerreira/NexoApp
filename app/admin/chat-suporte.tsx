import { Redirect, useLocalSearchParams } from "expo-router";
import { httpsCallable } from "firebase/functions";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
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
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db, functions } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";
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

type EnviarPushSuportePayload = {
  userId: string;
  titulo: string;
  corpo: string;
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

export default function AdminChatSuporte() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);
  const params = useLocalSearchParams<{ id?: string }>();
  const chatId = typeof params.id === "string" ? params.id : "";

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoChat, setCarregandoChat] = useState(true);
  const [chat, setChat] = useState<ChatSuporte | null>(null);
  const [mensagens, setMensagens] = useState<MensagemSuporte[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const chatFechado = chat?.status === "fechado";
  const idValido = !!chatId;

  const podeEnviar = useMemo(() => {
    return !chatFechado && !enviando && !!texto.trim();
  }, [chatFechado, enviando, texto]);

  useEffect(() => {
    let ativo = true;
    let unsubscribeChat: (() => void) | undefined;
    let unsubscribeMensagens: (() => void) | undefined;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) setStatusTela("sem-user");
          return;
        }

        const snapAdmin = await getDoc(doc(db, "users", user.uid));

        if (!snapAdmin.exists()) {
          if (ativo) setStatusTela("sem-acesso");
          return;
        }

        const dadosAdmin = snapAdmin.data() as any;

        if (dadosAdmin.tipo !== "admin") {
          if (ativo) setStatusTela("sem-acesso");
          return;
        }

        if (ativo) setStatusTela("admin");

        if (!idValido) {
          if (ativo) setCarregandoChat(false);
          return;
        }

        const chatRef = doc(db, "suporte_chats", chatId);

        unsubscribeChat = onSnapshot(
          chatRef,
          (snapshot) => {
            if (!ativo) return;

            if (!snapshot.exists()) {
              setChat(null);
              setCarregandoChat(false);
              return;
            }

            setChat({
              id: snapshot.id,
              ...(snapshot.data() as Omit<ChatSuporte, "id">),
            });

            setCarregandoChat(false);
          },
          (error) => {
            console.log("Erro ao ouvir chat de suporte:", error);
            if (ativo) setCarregandoChat(false);
          }
        );

        const mensagensRef = collection(db, "suporte_chats", chatId, "mensagens");
        const qMensagens = query(mensagensRef, orderBy("criadoEm", "asc"));

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
            console.log("Erro ao ouvir mensagens de suporte:", error);
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/chat-suporte:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoChat(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeChat) unsubscribeChat();
      if (unsubscribeMensagens) unsubscribeMensagens();
    };
  }, [chatId, idValido]);

  function rolarParaFim() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  async function enviarMensagem() {
    const user = auth.currentUser;

    if (!user || !chat || !idValido || enviando || chatFechado) return;

    const textoFinal = texto.trim();
    if (!textoFinal) return;

    try {
      setEnviando(true);

      await addDoc(collection(db, "suporte_chats", chatId, "mensagens"), {
        texto: textoFinal,
        autorId: user.uid,
        autorTipo: "admin",
        tipo: "texto",
        criadoEm: serverTimestamp(),
      });

      await updateDoc(doc(db, "suporte_chats", chatId), {
        ultimaMensagem: textoFinal,
        atualizadoEm: serverTimestamp(),
        status: "aberto",
      });

      setTexto("");
      rolarParaFim();

      if (chat.userId) {
        try {
          const enviarPush = httpsCallable<
            EnviarPushSuportePayload,
            { ok: boolean; resultado?: any }
          >(functions, "enviarPushSuporte");

          await enviarPush({
            userId: chat.userId,
            titulo: "Nova mensagem suporte",
            corpo: textoFinal,
          });
        } catch (pushError) {
          console.log("Mensagem enviada, mas o push falhou:", pushError);
        }
      }
    } catch (error) {
      console.log("Erro ao enviar mensagem de suporte:", error);
      Alert.alert("Erro", "Não foi possível enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  async function fecharChamadoExec() {
    try {
      if (!idValido || alterandoStatus) return;

      setAlterandoStatus(true);

      await updateDoc(doc(db, "suporte_chats", chatId), {
        status: "fechado",
        atualizadoEm: serverTimestamp(),
      });

      rolarParaFim();
    } catch (error) {
      console.log("Erro ao fechar chamado:", error);
      Alert.alert("Erro", "Não foi possível fechar o chamado.");
    } finally {
      setAlterandoStatus(false);
    }
  }

  function fecharChamado() {
    if (alterandoStatus) return;

    Alert.alert("Fechar chamado", "Deseja realmente fechar esse suporte?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Fechar", onPress: fecharChamadoExec },
    ]);
  }

  async function reabrirChamadoExec() {
    try {
      if (!idValido || alterandoStatus) return;

      setAlterandoStatus(true);

      await updateDoc(doc(db, "suporte_chats", chatId), {
        status: "aberto",
        atualizadoEm: serverTimestamp(),
      });

      await addDoc(collection(db, "suporte_chats", chatId, "mensagens"), {
        texto: "Atendimento reaberto manualmente pelo suporte.",
        autorId: "system",
        autorTipo: "sistema",
        tipo: "sistema",
        criadoEm: serverTimestamp(),
      });

      await updateDoc(doc(db, "suporte_chats", chatId), {
        ultimaMensagem: "Atendimento reaberto manualmente pelo suporte.",
        atualizadoEm: serverTimestamp(),
      });

      rolarParaFim();
    } catch (error) {
      console.log("Erro ao reabrir chamado:", error);
      Alert.alert("Erro", "Não foi possível reabrir o chamado.");
    } finally {
      setAlterandoStatus(false);
    }
  }

  function reabrirChamado() {
    if (alterandoStatus) return;

    Alert.alert("Reabrir chamado", "Deseja reabrir esse suporte?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Reabrir", onPress: reabrirChamadoExec },
    ]);
  }

  function textoTipoUsuario(tipo?: TipoUsuario) {
    return tipo === "profissional" ? "PROFISSIONAL" : "CLIENTE";
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Verificando acesso...</Text>
      </View>
    );
  }

  if (statusTela === "sem-user" || statusTela === "sem-acesso") {
    return <Redirect href="/" />;
  }

  if (carregandoChat) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando conversa...</Text>
      </View>
    );
  }

  if (!idValido || !chat) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Chat não encontrado.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 84}
    >
      <AppHeader
        title={chat.userNome || "Suporte"}
        subtitle={`Chat com ${textoTipoUsuario(chat.userTipo)}`}
        showBackButton
      />

      <View style={styles.topInfoCard}>
        <View style={styles.topRow}>
          <View
            style={[
              styles.statusBadge,
              chat.status === "aberto"
                ? styles.statusBadgeSuccess
                : styles.statusBadgeNeutral,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {chat.status === "aberto" ? "ABERTO" : "FECHADO"}
            </Text>
          </View>

          <View
            style={[
              styles.tipoBadge,
              chat.userTipo === "profissional"
                ? styles.tipoBadgeWarning
                : styles.tipoBadgePrimary,
            ]}
          >
            <Text style={styles.tipoBadgeText}>
              {textoTipoUsuario(chat.userTipo)}
            </Text>
          </View>
        </View>

        <Text style={styles.topInfoText}>
          Última atualização: {formatarData(chat.atualizadoEm || chat.criadoEm)}
        </Text>

        <Text style={styles.idText}>ID: {chat.id}</Text>
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
            <Text style={styles.emptyText}>Nenhuma mensagem ainda.</Text>
          </View>
        ) : (
          mensagens.map((item) => {
            const isSistema = item.autorTipo === "sistema";
            const isAdmin = item.autorTipo === "admin";

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
                  isAdmin ? styles.bubbleWrapAdmin : styles.bubbleWrapUser,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isAdmin ? styles.bubbleAdmin : styles.bubbleUser,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleAuthor,
                      isAdmin && styles.bubbleAuthorAdmin,
                    ]}
                  >
                    {isAdmin ? "Admin" : chat.userNome || "Usuário"}
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
                        isAdmin && styles.bubbleTextAdmin,
                      ]}
                    >
                      {item.texto || ""}
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.bubbleDate,
                      isAdmin && styles.bubbleDateAdmin,
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

      <View style={styles.actionsRow}>
        {chatFechado ? (
          <View style={styles.flexAction}>
            <ActionButton
              title={alterandoStatus ? "PROCESSANDO..." : "REABRIR CHAMADO"}
              onPress={reabrirChamado}
              variant="success"
              disabled={alterandoStatus}
            />
          </View>
        ) : (
          <View style={styles.flexAction}>
            <ActionButton
              title={alterandoStatus ? "PROCESSANDO..." : "FECHAR CHAMADO"}
              onPress={fecharChamado}
              variant="warning"
              disabled={alterandoStatus}
            />
          </View>
        )}
      </View>

      <View style={styles.inputArea}>
        <TextInput
          style={[styles.input, chatFechado && styles.inputDisabled]}
          value={texto}
          onChangeText={setTexto}
          placeholder={chatFechado ? "Chamado fechado" : "Digite sua resposta..."}
          placeholderTextColor={theme.colors.textMuted}
          editable={!chatFechado && !enviando}
          multiline
        />

        <View style={styles.sendButtonWrap}>
          <ActionButton
            title={enviando ? "ENVIANDO..." : "ENVIAR"}
            onPress={enviarMensagem}
            variant="primary"
            disabled={!podeEnviar}
          />
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
      marginBottom: 4,
    },

    idText: {
      color: theme.colors.textMuted,
      fontSize: 12,
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

    tipoBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    tipoBadgePrimary: {
      backgroundColor: theme.colors.primary,
    },

    tipoBadgeWarning: {
      backgroundColor: theme.colors.warning,
    },

    tipoBadgeText: {
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
      paddingTop: 30,
      alignItems: "center",
      justifyContent: "center",
    },

    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
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

    bubbleWrapUser: {
      alignItems: "flex-start",
    },

    bubbleWrapAdmin: {
      alignItems: "flex-end",
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

    bubbleUser: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    bubbleAdmin: {
      backgroundColor: theme.colors.primary,
    },

    bubbleAuthor: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
    },

    bubbleAuthorAdmin: {
      color: "#fff",
    },

    bubbleText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },

    bubbleTextAdmin: {
      color: "#fff",
    },

    bubbleDate: {
      color: theme.colors.textMuted,
      fontSize: 11,
      marginTop: 8,
    },

    bubbleDateAdmin: {
      color: "rgba(255,255,255,0.85)",
    },

    messageImage: {
      width: 220,
      height: 220,
      borderRadius: 14,
      marginTop: 2,
    },

    actionsRow: {
      paddingHorizontal: 18,
      paddingBottom: 10,
    },

    flexAction: {
      width: "100%",
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

    sendButtonWrap: {
      marginTop: 10,
    },
  });
}