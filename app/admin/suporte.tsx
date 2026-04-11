import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";
type FiltroSuporte = "todos" | "aberto" | "fechado";
type TipoUsuario = "cliente" | "profissional";

type SuporteChat = {
  id: string;
  userId?: string;
  userTipo?: TipoUsuario;
  userNome?: string;
  status?: "aberto" | "fechado";
  ultimaMensagem?: string;
  atualizadoEm?: any;
  criadoEm?: any;
};

function formatarData(valor: any) {
  try {
    if (!valor) return "Sem data";

    const data =
      typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);

    if (Number.isNaN(data.getTime())) return "Sem data";

    return data.toLocaleString("pt-BR");
  } catch {
    return "Sem data";
  }
}

export default function AdminSuporte() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [lista, setLista] = useState<SuporteChat[]>([]);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroSuporte>("todos");

  useEffect(() => {
    let ativo = true;
    let unsubscribeLista: (() => void) | undefined;

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

        const q = query(
          collection(db, "suporte_chats"),
          orderBy("atualizadoEm", "desc")
        );

        unsubscribeLista = onSnapshot(
          q,
          (snapshot) => {
            const dados = snapshot.docs.map(
              (docSnap) =>
                ({
                  id: docSnap.id,
                  ...(docSnap.data() as Omit<SuporteChat, "id">),
                }) satisfies SuporteChat
            );

            setLista(dados);
            setCarregandoLista(false);
          },
          (error) => {
            console.log("Erro ao carregar suporte:", error);
            setCarregandoLista(false);
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/suporte:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoLista(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeLista) unsubscribeLista();
    };
  }, []);

  const chatsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return lista.filter((item) => {
      const id = String(item.id || "").toLowerCase();
      const nome = String(item.userNome || "").toLowerCase();
      const tipo = String(item.userTipo || "").toLowerCase();
      const ultimaMensagem = String(item.ultimaMensagem || "").toLowerCase();

      const bateBusca =
        !termo ||
        id.includes(termo) ||
        nome.includes(termo) ||
        tipo.includes(termo) ||
        ultimaMensagem.includes(termo);

      const bateFiltro = filtro === "todos" ? true : item.status === filtro;

      return bateBusca && bateFiltro;
    });
  }, [lista, busca, filtro]);

  const totais = useMemo(() => {
    return {
      total: lista.length,
      abertos: lista.filter((item) => item.status === "aberto").length,
      fechados: lista.filter((item) => item.status === "fechado").length,
    };
  }, [lista]);

  function abrirChat(item: SuporteChat) {
    router.push({
      pathname: "/admin/chat-suporte",
      params: { id: item.id },
    });
  }

  function textoTipo(tipo?: TipoUsuario) {
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

  if (statusTela === "sem-user") {
    return <Redirect href="/" />;
  }

  if (statusTela === "sem-acesso") {
    return <Redirect href="/" />;
  }

  if (carregandoLista) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando suporte...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Suporte"
          subtitle="Acompanhe os chats de ajuda do app"
          showBackButton
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{totais.total} chat(s)</Text>
          <Text style={styles.heroText}>
            Veja rapidamente quem precisa de ajuda e qual conversa ainda está aberta.
          </Text>

          <View style={styles.metricRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{totais.abertos}</Text>
              <Text style={styles.metricLabel}>Abertos</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{totais.fechados}</Text>
              <Text style={styles.metricLabel}>Fechados</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome, tipo, mensagem ou ID"
            placeholderTextColor={theme.colors.textMuted}
          />

          <View style={styles.filtrosRow}>
            {(["todos", "aberto", "fechado"] as FiltroSuporte[]).map((item) => {
              const ativo = filtro === item;

              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.filtroBtn, ativo && styles.filtroBtnAtivo]}
                  onPress={() => setFiltro(item)}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.filtroTexto,
                      ativo && styles.filtroTextoAtivo,
                    ]}
                  >
                    {item === "todos" && "Todos"}
                    {item === "aberto" && "Abertos"}
                    {item === "fechado" && "Fechados"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {chatsFiltrados.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhum chat encontrado</Text>
            <Text style={styles.emptyText}>
              Quando alguém abrir um suporte, ele aparecerá aqui.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {chatsFiltrados.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.92}
                onPress={() => abrirChat(item)}
              >
                <View style={styles.topRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === "aberto"
                        ? styles.statusBadgeSuccess
                        : styles.statusBadgeNeutral,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {item.status === "aberto" ? "ABERTO" : "FECHADO"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.tipoBadge,
                      item.userTipo === "profissional"
                        ? styles.tipoBadgeWarning
                        : styles.tipoBadgePrimary,
                    ]}
                  >
                    <Text style={styles.tipoBadgeText}>
                      {textoTipo(item.userTipo)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.nome}>{item.userNome || "Usuário"}</Text>

                <Text style={styles.ultimaMensagem} numberOfLines={2}>
                  {item.ultimaMensagem || "Sem mensagem ainda"}
                </Text>

                <Text style={styles.idText}>ID: {item.id}</Text>

                <View style={styles.bottomRow}>
                  <Text style={styles.dataTexto}>
                    {formatarData(item.atualizadoEm || item.criadoEm)}
                  </Text>

                  <View style={styles.linkWrap}>
                    <Text style={styles.abrirTexto}>Abrir chat</Text>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={18}
                      color={theme.colors.textMuted}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
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

    container: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 32,
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

    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 16,
    },

    heroTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 6,
    },

    heroText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 14,
    },

    metricRow: {
      flexDirection: "row",
      gap: 10,
    },

    metricBox: {
      flex: 1,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },

    metricNumber: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "800",
      marginBottom: 4,
    },

    metricLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },

    searchCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 16,
    },

    input: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: theme.colors.text,
      fontSize: 15,
    },

    filtrosRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },

    filtroBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    filtroBtnAtivo: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    filtroTexto: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },

    filtroTextoAtivo: {
      color: "#fff",
    },

    emptyCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
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

    list: {
      gap: 14,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      gap: 8,
    },

    statusBadge: {
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

    nome: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
    },

    ultimaMensagem: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },

    idText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 8,
    },

    bottomRow: {
      marginTop: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },

    dataTexto: {
      color: theme.colors.textMuted,
      fontSize: 12,
      flex: 1,
    },

    linkWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },

    abrirTexto: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
    },
  });
}