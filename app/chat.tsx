import * as ImagePicker from "expo-image-picker";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ActionButton } from "../components/ActionButton";
import { AppHeader } from "../components/AppHeader";
import { OfflineBanner } from "../components/OfflineBanner";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db, functions, storage } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";

type Mensagem = {
  id: string;
  texto?: string;
  autorId: string;
  criadoEm?: any;
  tipo?: "texto" | "imagem";
  imagemUrl?: string;
};

type PedidoBase = {
  clienteId?: string;
  profissionalId?: string;
  nomeProfissional?: string;
  nomeCliente?: string;
  status?: string;
  temMensagemNovaCliente?: boolean;
  temMensagemNovaProfissional?: boolean;
  ultimaMensagem?: string;
  ultimaMensagemAt?: any;
};

type ChatMeta = {
  pedidoId?: string;
  clienteId?: string;
  profissionalId?: string;
  ultimoAutorId?: string;
  lidoCliente?: boolean;
  lidoProfissional?: boolean;
  atualizadoEm?: any;
  ultimaMensagem?: string;
  ultimoTipo?: "texto" | "imagem";
};

type MinhaRole = "cliente" | "profissional" | null;

type EnviarMensagemChatResponse = {
  ok?: boolean;
  mensagemId?: string;
  resumo?: string;
  tipo?: "texto" | "imagem";
};

function formatarHora(data: any) {
  try {
    if (!data) return "";
    const dt =
      typeof data?.toDate === "function" ? data.toDate() : new Date(data);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Chat() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const params = useLocalSearchParams<{
    pedidoId?: string;
    nome?: string;
  }>();

  const pedidoId = String(params.pedidoId || "");
  const nome = params.nome || "Chat";

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [carregandoEnvio, setCarregandoEnvio] = useState(false);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [carregandoTela, setCarregandoTela] = useState(true);
  const [erroTela, setErroTela] = useState("");
  const [semAcesso, setSemAcesso] = useState(false);

  const [pedido, setPedido] = useState<PedidoBase | null>(null);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [minhaRole, setMinhaRole] = useState<MinhaRole>(null);

  const flatListRef = useRef<FlatList>(null);
  const meuUid = auth.currentUser?.uid || "";

  const ultimoItem = useMemo(() => {
    if (!mensagens.length) return null;
    return mensagens[mensagens.length - 1];
  }, [mensagens]);

  const outraPessoaLeuMinhaUltimaMensagem = useMemo(() => {
    if (!ultimoItem || !chatMeta || !meuUid || ultimoItem.autorId !== meuUid) {
      return false;
    }

    if (minhaRole === "cliente") {
      return chatMeta.lidoProfissional === true;
    }

    if (minhaRole === "profissional") {
      return chatMeta.lidoCliente === true;
    }

    return false;
  }, [ultimoItem, chatMeta, meuUid, minhaRole]);

  const podeEnviar = !!pedidoId && !!meuUid && !!minhaRole && !semAcesso;

  useEffect(() => {
    if (!pedidoId || !auth.currentUser) {
      setCarregandoTela(false);
      setErroTela("Pedido não encontrado.");
      return;
    }

    const pedidoRef = doc(db, "pedidos", pedidoId);

    const unsubscribePedido = onSnapshot(
      pedidoRef,
      (snap) => {
        if (!snap.exists()) {
          setPedido(null);
          setMinhaRole(null);
          setErroTela("Pedido não encontrado.");
          setCarregandoTela(false);
          return;
        }

        const dados = snap.data() as PedidoBase;
        setPedido(dados);

        if (auth.currentUser?.uid === dados.clienteId) {
          setMinhaRole("cliente");
          setSemAcesso(false);
        } else if (auth.currentUser?.uid === dados.profissionalId) {
          setMinhaRole("profissional");
          setSemAcesso(false);
        } else {
          setMinhaRole(null);
          setSemAcesso(true);
        }

        setErroTela("");
        setCarregandoTela(false);
      },
      (error) => {
        handleError(error, "Chat.ouvirPedido");
        setErroTela("Não foi possível carregar este chat.");
        setCarregandoTela(false);
      }
    );

    return unsubscribePedido;
  }, [pedidoId]);

  useEffect(() => {
    if (!pedidoId) return;

    const chatRef = doc(db, "chats", pedidoId);

    const unsubscribeChat = onSnapshot(
      chatRef,
      (snap) => {
        if (snap.exists()) {
          setChatMeta(snap.data() as ChatMeta);
        } else {
          setChatMeta(null);
        }
      },
      (error) => {
        handleError(error, "Chat.ouvirMeta");
      }
    );

    return unsubscribeChat;
  }, [pedidoId]);

  useEffect(() => {
    if (!pedidoId) return;

    const q = query(
      collection(db, "chats", pedidoId, "mensagens"),
      orderBy("criadoEm", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lista: Mensagem[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Mensagem, "id">),
        }));

        setMensagens(lista);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 120);
      },
      (error) => {
        handleError(error, "Chat.ouvirMensagens");
        setErroTela("Não foi possível carregar as mensagens.");
      }
    );

    return unsubscribe;
  }, [pedidoId]);

  useEffect(() => {
    if (!pedidoId || !auth.currentUser || !minhaRole || semAcesso) return;
    marcarComoLido();
  }, [pedidoId, mensagens.length, minhaRole, semAcesso]);

  async function marcarComoLido() {
    try {
      if (!pedidoId || !auth.currentUser || !minhaRole || semAcesso) return;

      const chatRef = doc(db, "chats", pedidoId);
      const pedidoRef = doc(db, "pedidos", pedidoId);

      if (minhaRole === "cliente") {
        await setDoc(
          chatRef,
          {
            pedidoId,
            clienteId: pedido?.clienteId || "",
            profissionalId: pedido?.profissionalId || "",
            lidoCliente: true,
          },
          { merge: true }
        );

        await setDoc(
          pedidoRef,
          {
            temMensagemNovaCliente: false,
          },
          { merge: true }
        );
      } else if (minhaRole === "profissional") {
        await setDoc(
          chatRef,
          {
            pedidoId,
            clienteId: pedido?.clienteId || "",
            profissionalId: pedido?.profissionalId || "",
            lidoProfissional: true,
          },
          { merge: true }
        );

        await setDoc(
          pedidoRef,
          {
            temMensagemNovaProfissional: false,
          },
          { merge: true }
        );
      }
    } catch (error) {
      handleError(error, "Chat.marcarComoLido");
    }
  }

  async function enviarMensagem() {
    try {
      if (!texto.trim() || !podeEnviar) return;

      setCarregandoEnvio(true);

      const mensagem = texto.trim();
      setTexto("");

      const fn = httpsCallable<
        { pedidoId: string; texto: string; tipo: "texto" },
        EnviarMensagemChatResponse
      >(functions, "enviarMensagemChat");

      await fn({
        pedidoId,
        texto: mensagem,
        tipo: "texto",
      });
    } catch (error) {
      handleError(error, "Chat.enviarMensagemFunction");
      Alert.alert("Erro", "Não foi possível enviar a mensagem.");
    } finally {
      setCarregandoEnvio(false);
    }
  }

  async function enviarImagem() {
    try {
      if (!podeEnviar) return;

      const permissao =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissao.granted) {
        Alert.alert(
          "Permissão necessária",
          "Autorize o acesso à galeria para enviar imagens."
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

      setCarregandoImagem(true);

      const asset = resultado.assets[0];
      const resposta = await fetch(asset.uri);
      const blob = await resposta.blob();

      const caminho = `chats/${pedidoId}/${Date.now()}_${auth.currentUser?.uid}.jpg`;
      const refImagem = storageRef(storage, caminho);

      await uploadBytes(refImagem, blob);
      const imagemUrl = await getDownloadURL(refImagem);

      const fn = httpsCallable<
        { pedidoId: string; imagemUrl: string; tipo: "imagem" },
        EnviarMensagemChatResponse
      >(functions, "enviarMensagemChat");

      await fn({
        pedidoId,
        imagemUrl,
        tipo: "imagem",
      });
    } catch (error) {
      handleError(error, "Chat.enviarImagemFunction");
      Alert.alert("Erro", "Não foi possível enviar a imagem.");
    } finally {
      setCarregandoImagem(false);
    }
  }

  function abrirImagem(url?: string) {
    if (!url) return;

    router.push({
      pathname: "/imagem-chat",
      params: { url },
    });
  }

  function renderItem({ item, index }: { item: Mensagem; index: number }) {
    const ehMinha = item.autorId === auth.currentUser?.uid;
    const ehUltima = index === mensagens.length - 1;
    const hora = formatarHora(item.criadoEm);

    return (
      <View style={styles.itemWrapper}>
        <View
          style={[
            styles.bolha,
            ehMinha ? styles.bolhaMinha : styles.bolhaOutro,
            item.tipo === "imagem" && styles.bolhaImagem,
          ]}
        >
          {item.tipo === "imagem" && item.imagemUrl ? (
            <Pressable onPress={() => abrirImagem(item.imagemUrl)}>
              <Image source={{ uri: item.imagemUrl }} style={styles.imagemMsg} />
            </Pressable>
          ) : (
            <Text
              style={[
                styles.texto,
                ehMinha ? styles.textoMinha : styles.textoOutro,
              ]}
            >
              {item.texto}
            </Text>
          )}

          {!!hora && (
            <Text
              style={[
                styles.horaMsg,
                ehMinha ? styles.horaMinha : styles.horaOutro,
              ]}
            >
              {hora}
            </Text>
          )}
        </View>

        {ehMinha && ehUltima && (
          <Text style={styles.statusLeitura}>
            {outraPessoaLeuMinhaUltimaMensagem ? "Visto" : "Enviado"}
          </Text>
        )}
      </View>
    );
  }

  if (!pedidoId) {
    return (
      <ScreenContainer scroll={false}>
        <OfflineBanner />
        <AppHeader
          title="Chat"
          subtitle="Converse em tempo real"
          showBackButton
        />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Pedido não encontrado.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (carregandoTela) {
    return (
      <ScreenContainer scroll={false}>
        <OfflineBanner />
        <AppHeader
          title={nome}
          subtitle="Converse em tempo real"
          showBackButton
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.emptyText}>Carregando chat...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (semAcesso) {
    return (
      <ScreenContainer scroll={false}>
        <OfflineBanner />
        <AppHeader
          title={nome}
          subtitle="Converse em tempo real"
          showBackButton
        />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Você não tem acesso a este chat.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <OfflineBanner />

      <AppHeader
        title={nome}
        subtitle="Converse em tempo real"
        showBackButton
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 18}
      >
        {!!erroTela && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{erroTela}</Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={mensagens}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Ainda não há mensagens nesse chat.
              </Text>
            </View>
          }
        />

        <View style={styles.inputArea}>
          <Pressable
            onPress={enviarImagem}
            style={({ pressed }) => [
              styles.botaoFoto,
              pressed && styles.botaoFotoPressed,
            ]}
            disabled={carregandoImagem || carregandoEnvio || !podeEnviar}
          >
            <Text style={styles.botaoFotoTexto}>
              {carregandoImagem ? "..." : "📷"}
            </Text>
          </Pressable>

          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Digite sua mensagem..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            multiline
            maxLength={1000}
            textAlignVertical="top"
            editable={!carregandoEnvio && !carregandoImagem && podeEnviar}
          />

          <ActionButton
            title={carregandoEnvio ? "..." : "Enviar"}
            onPress={enviarMensagem}
            variant="primary"
            disabled={carregandoEnvio || carregandoImagem || !texto.trim() || !podeEnviar}
            style={styles.botaoEnviar}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function createStyles(theme: any, themeMode?: "light" | "dark") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    flex: {
      flex: 1,
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },

    emptyBox: {
      paddingTop: 24,
      paddingHorizontal: 8,
    },

    emptyText: {
      color: theme.colors.textMuted,
      textAlign: "center",
      fontSize: 15,
      lineHeight: 22,
    },

    errorBox: {
      marginTop: 10,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },

    errorText: {
      color: theme.colors.danger,
      textAlign: "center",
      fontSize: 13,
      fontWeight: "700",
    },

    lista: {
      paddingTop: 10,
      paddingBottom: 120,
      gap: 10,
    },

    itemWrapper: {
      width: "100%",
    },

    bolha: {
      maxWidth: "78%",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },

    bolhaMinha: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.primary,
      borderBottomRightRadius: 6,
    },

    bolhaOutro: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderBottomLeftRadius: 6,
    },

    bolhaImagem: {
      padding: 6,
      overflow: "hidden",
    },

    texto: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "600",
    },

    textoMinha: {
      color: "#ffffff",
    },

    textoOutro: {
      color: theme.colors.text,
    },

    imagemMsg: {
      width: 190,
      height: 190,
      borderRadius: 14,
      backgroundColor: theme.colors.cardSoft,
    },

    horaMsg: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: "600",
    },

    horaMinha: {
      color: "rgba(255,255,255,0.82)",
      textAlign: "right",
    },

    horaOutro: {
      color: theme.colors.textMuted,
      textAlign: "right",
    },

    statusLeitura: {
      marginTop: 4,
      alignSelf: "flex-end",
      marginRight: 8,
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },

    inputArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingTop: 10,
      paddingBottom: Platform.OS === "ios" ? 14 : 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },

    botaoFoto: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },

    botaoFotoPressed: {
      opacity: 0.8,
    },

    botaoFotoTexto: {
      fontSize: 22,
    },

    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 120,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      color: theme.colors.text,
      fontSize: 15,
    },

    botaoEnviar: {
      width: 108,
      minHeight: 48,
    },
  });
}
