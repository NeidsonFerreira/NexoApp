import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";

type ClienteAdmin = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  bloqueado?: boolean;
  tipo?: string;
  criadoEm?: any;
};

export default function AdminClientes() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [lista, setLista] = useState<ClienteAdmin[]>([]);
  const [busca, setBusca] = useState("");
  const [erroTela, setErroTela] = useState("");
  const [novoCliente, setNovoCliente] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "bloqueados">("todos");
  const [ordenacao, setOrdenacao] = useState<"nome" | "recentes">("nome");


  function sair() {
    Alert.alert(
      "Sair",
      "Deseja realmente sair do painel admin?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
            } finally {
              router.replace("/entrada");
            }
          },
        },
      ]
    );
  }

  function formatarData(valor: any) {
    try {
      if (!valor) return "";
      const data =
        typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
      if (Number.isNaN(data.getTime())) return "";
      return data.toLocaleDateString("pt-BR");
    } catch {
      return "";
    }
  }

  async function abrirContato(item: ClienteAdmin) {
    const telefone = String(item.telefone || "").replace(/\D/g, "");
    if (!telefone) {
      Alert.alert("Contato indisponível", "Esse cliente não possui telefone cadastrado.");
      return;
    }

    const url = `https://wa.me/55${telefone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
      }
    } catch {
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    }
  }

  function atualizarLista() {
    setRefreshing(true);
    setNovoCliente(false);
    setTimeout(() => setRefreshing(false), 700);
  }

  useEffect(() => {
    let ativo = true;
    let unsubscribeAdmin: (() => void) | undefined;
    let unsubscribeLista: (() => void) | undefined;
    let inicializado = false;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) setStatusTela("sem-user");
          return;
        }

        unsubscribeAdmin = onSnapshot(
          doc(db, "users", user.uid),
          async (snapAdmin) => {
            if (!ativo) return;

            if (!snapAdmin.exists() || snapAdmin.data()?.tipo !== "admin") {
              setStatusTela("sem-acesso");
              try {
                await signOut(auth);
              } catch {}
              router.replace("/entrada");
              return;
            }

            setStatusTela("admin");
          },
          (error) => {
            console.log("Erro ao ouvir admin/clientes:", error);
          }
        );

        unsubscribeLista = onSnapshot(
          collection(db, "users"),
          (snapshot) => {
            const dados = snapshot.docs
              .map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as Omit<ClienteAdmin, "id">),
              }))
              .filter((item) => item.tipo === "cliente") as ClienteAdmin[];

            if (ativo) {
              setLista((prev) => {
                if (inicializado && dados.length > prev.length) {
                  setNovoCliente(true);
                }
                return dados;
              });
              setErroTela("");
              setCarregandoLista(false);
              setRefreshing(false);
            }

            inicializado = true;
          },
          (error) => {
            console.log("Erro ao carregar clientes:", error);
            if (ativo) {
              setErroTela("Não foi possível atualizar a lista de clientes em tempo real.");
              setCarregandoLista(false);
              setRefreshing(false);
            }
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/clientes:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoLista(false);
          setRefreshing(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeAdmin) unsubscribeAdmin();
      if (unsubscribeLista) unsubscribeLista();
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const filtrados = lista.filter((item) => {
      const nome = String(item.nome || "").toLowerCase();
      const email = String(item.email || "").toLowerCase();
      const cidade = String(item.cidade || "").toLowerCase();
      const telefone = String(item.telefone || "").toLowerCase();

      const bateBusca =
        !termo ||
        nome.includes(termo) ||
        email.includes(termo) ||
        cidade.includes(termo) ||
        telefone.includes(termo);

      const bateFiltro =
        filtroStatus === "todos"
          ? true
          : filtroStatus === "bloqueados"
          ? item.bloqueado === true
          : item.bloqueado !== true;

      return bateBusca && bateFiltro;
    });

    if (ordenacao === "recentes") {
      filtrados.sort((a, b) => {
        const dataA =
          typeof a.criadoEm?.toDate === "function"
            ? a.criadoEm.toDate().getTime()
            : new Date(a.criadoEm || 0).getTime();

        const dataB =
          typeof b.criadoEm?.toDate === "function"
            ? b.criadoEm.toDate().getTime()
            : new Date(b.criadoEm || 0).getTime();

        return dataB - dataA;
      });

      return filtrados;
    }

    filtrados.sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
    );

    return filtrados;
  }, [lista, busca, filtroStatus, ordenacao]);

  const clientesBloqueados = useMemo(
    () => lista.filter((item) => item.bloqueado === true),
    [lista]
  );

  function abrirDetalhe(item: ClienteAdmin) {
    router.push({
      pathname: "/admin/cliente-detalhe",
      params: { id: item.id },
    });
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

  if (carregandoLista) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando clientes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={atualizarLista} tintColor={theme.colors.primary} />
        }
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Clientes"
          subtitle="Gerencie os clientes do app"
          showBackButton
          rightComponent={
            <TouchableOpacity onPress={sair} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          }
        />

        {!!erroTela.trim() && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Atualização com falha</Text>
            <Text style={styles.errorText}>{erroTela.trim()}</Text>
          </View>
        )}

        {novoCliente && (
          <TouchableOpacity
            style={styles.newBadge}
            activeOpacity={0.9}
            onPress={() => setNovoCliente(false)}
          >
            <Text style={styles.newBadgeText}>Novo cliente entrou na lista</Text>
          </TouchableOpacity>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{clientesFiltrados.length} cliente(s)</Text>
          <Text style={styles.heroText}>
            Veja rapidamente os clientes cadastrados no Nexo.
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>Total: {lista.length}</Text>
            </View>

            <View style={styles.summaryBadgeDanger}>
              <Text style={styles.summaryBadgeText}>
                Bloqueados: {clientesBloqueados.length}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              filtroStatus === "todos" && styles.filterChipActive,
            ]}
            onPress={() => setFiltroStatus("todos")}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroStatus === "todos" && styles.filterChipTextActive,
              ]}
            >
              Todos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              filtroStatus === "ativos" && styles.filterChipActive,
            ]}
            onPress={() => setFiltroStatus("ativos")}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroStatus === "ativos" && styles.filterChipTextActive,
              ]}
            >
              Ativos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              filtroStatus === "bloqueados" && styles.filterChipActive,
            ]}
            onPress={() => setFiltroStatus("bloqueados")}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroStatus === "bloqueados" && styles.filterChipTextActive,
              ]}
            >
              Bloqueados
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChipSecondary,
              ordenacao === "nome" && styles.filterChipSecondaryActive,
            ]}
            onPress={() => setOrdenacao("nome")}
          >
            <Text
              style={[
                styles.filterChipSecondaryText,
                ordenacao === "nome" && styles.filterChipSecondaryTextActive,
              ]}
            >
              Ordenar por nome
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChipSecondary,
              ordenacao === "recentes" && styles.filterChipSecondaryActive,
            ]}
            onPress={() => setOrdenacao("recentes")}
          >
            <Text
              style={[
                styles.filterChipSecondaryText,
                ordenacao === "recentes" && styles.filterChipSecondaryTextActive,
              ]}
            >
              Mais recentes
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome, email ou cidade"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{clientesFiltrados.length} cliente(s)</Text>
          <Text style={styles.heroText}>
            Veja rapidamente os clientes cadastrados no Nexo.
          </Text>
        </View>

        {clientesFiltrados.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhum cliente encontrado</Text>
            <Text style={styles.emptyText}>
              Tente mudar a busca para localizar outro cliente.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {clientesFiltrados.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.92}
                onPress={() => abrirDetalhe(item)}
              >
                <View style={styles.topRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      item.bloqueado
                        ? styles.statusBadgeDanger
                        : styles.statusBadgeSuccess,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {item.bloqueado ? "BLOQUEADO" : "ATIVO"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.nome}>{item.nome || "Cliente sem nome"}</Text>

                <Text style={styles.meta}>
                  Email: {item.email || "Não informado"}
                </Text>

                <Text style={styles.meta}>
                  Cidade: {item.cidade || "Não informada"}
                </Text>

                <Text style={styles.meta}>
                  Telefone: {item.telefone || "Não informado"}
                </Text>

                <View style={styles.bottomRow}>
                  <Text style={styles.detalheLink}>Toque para abrir detalhes</Text>

                  <Ionicons
                    name="chevron-forward-outline"
                    size={18}
                    color={theme.colors.textMuted}
                  />
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
      justifyContent: "flex-end",
      marginBottom: 10,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    statusBadgeSuccess: {
      backgroundColor: theme.colors.success,
    },

    statusBadgeDanger: {
      backgroundColor: theme.colors.danger,
    },

    statusBadgeText: {
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

    meta: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginBottom: 5,
      lineHeight: 20,
    },

    bottomRow: {
      marginTop: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },

    detalheLink: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
      flex: 1,
    },
    logoutButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    errorCard: {
      backgroundColor: isDark ? "rgba(255, 80, 80, 0.12)" : "#FDECEC",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 110, 110, 0.28)" : "#F5C2C7",
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },

    errorTitle: {
      color: isDark ? "#FF8A8A" : "#B42318",
      fontSize: 15,
      fontWeight: "800",
      marginBottom: 6,
    },

    errorText: {
      color: isDark ? "#FFC1C1" : "#7A271A",
      fontSize: 13,
      lineHeight: 19,
    },

    newBadge: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 16,
    },

    newBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
    },

    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 14,
    },

    summaryBadge: {
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#EEF4FF",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    summaryBadgeDanger: {
      backgroundColor: isDark ? "rgba(255, 80, 80, 0.12)" : "#FDECEC",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 110, 110, 0.28)" : "#F5C2C7",
    },

    summaryBadgeText: {    
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },

    filterRow: {    
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 16,
    },

    filterChip: {    
      backgroundColor: theme.colors.card,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    filterChipActive: {    
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    filterChipText: {    
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },

    filterChipTextActive: {    
      color: "#FFFFFF",
    },

    filterChipSecondary: {    
      backgroundColor: theme.colors.background,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    filterChipSecondaryActive: {    
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#EEF4FF",
      borderColor: theme.colors.primary,
    },

    filterChipSecondaryText: {    
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
    },

    filterChipSecondaryTextActive: {    
      color: theme.colors.primary,
    },
  });
}