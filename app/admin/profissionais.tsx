import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
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

type FiltroStatus =
  | "todos"
  | "aprovado"
  | "pendente"
  | "rejeitado"
  | "online"
  | "bloqueado";

type VerificacaoStatus =
  | "nao_enviado"
  | "pendente"
  | "aprovado"
  | "rejeitado";

type ProfissionalAdmin = {
  id: string;
  nome?: string;
  servico?: string;
  cidade?: string;
  plano?: string;
  online?: boolean;
  verificacaoStatus?: VerificacaoStatus;
  email?: string;
  telefone?: string;
  bloqueado?: boolean;
  motivoBloqueio?: string;
};

export default function AdminProfissionais() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [lista, setLista] = useState<ProfissionalAdmin[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [erroTela, setErroTela] = useState("");
  const [novoProfissional, setNovoProfissional] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");

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

        unsubscribeAdmin = onSnapshot(
          doc(db, "users", user.uid),
          async (snap) => {
            if (!ativo) return;

            if (!snap.exists() || snap.data()?.tipo !== "admin") {
              setStatusTela("sem-acesso");
              try {
                await signOut(auth);
              } catch {}
              router.replace("/");
            }
          },
          (error) => {
            console.log("Erro ao monitorar admin:", error);
          }
        );

        unsubscribeLista = onSnapshot(
          collection(db, "users"),
          (snapshot) => {
            const dados = snapshot.docs
              .map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
              }))
              .filter((item) => item.tipo === "profissional")
              .map(
                (item) =>
                  ({
                    id: item.id,
                    nome: item.nome || "",
                    servico: item.servico || "",
                    cidade: item.cidade || "",
                    plano: item.plano || "gratuito",
                    online: item.online === true,
                    verificacaoStatus:
                      (item.verificacaoStatus as VerificacaoStatus) ||
                      "nao_enviado",
                    email: item.email || "",
                    telefone: item.telefone || "",
                    bloqueado: item.bloqueado === true,
                    motivoBloqueio: item.motivoBloqueio || "",
                  }) satisfies ProfissionalAdmin
              );

            dados.sort((a, b) => {
              function prioridade(item: ProfissionalAdmin) {
                if (item.verificacaoStatus === "pendente") return 0;
                if (item.bloqueado) return 1;
                if (item.online) return 2;
                if (item.verificacaoStatus === "rejeitado") return 3;
                if (item.verificacaoStatus === "aprovado") return 4;
                return 5;
              }

              const pa = prioridade(a);
              const pb = prioridade(b);

              if (pa !== pb) return pa - pb;

              return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
            });

            if (ativo) {
              setLista((prev) => {
                if (inicializado && dados.length > prev.length) {
                  setNovoProfissional(true);
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
            console.log("Erro ao carregar profissionais:", error);
            if (ativo) {
              setErroTela("Não foi possível atualizar a lista de profissionais em tempo real.");
              setCarregandoLista(false);
              setRefreshing(false);
            }
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/profissionais:", error);
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

  const profissionaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return lista.filter((item) => {
      const nome = String(item.nome || "").toLowerCase();
      const servico = String(item.servico || "").toLowerCase();
      const cidade = String(item.cidade || "").toLowerCase();
      const email = String(item.email || "").toLowerCase();
      const telefone = String(item.telefone || "").toLowerCase();
      const status = String(item.verificacaoStatus || "");
      const online = item.online === true;
      const bloqueado = item.bloqueado === true;

      const bateBusca =
        !termo ||
        nome.includes(termo) ||
        servico.includes(termo) ||
        cidade.includes(termo) ||
        email.includes(termo) ||
        telefone.includes(termo);

      const bateFiltro =
        filtroStatus === "todos"
          ? true
          : filtroStatus === "online"
          ? online
          : filtroStatus === "bloqueado"
          ? bloqueado
          : status === filtroStatus;

      return bateBusca && bateFiltro;
    });
  }, [lista, busca, filtroStatus]);

  const totais = useMemo(() => {
    return {
      total: lista.length,
      online: lista.filter((item) => item.online).length,
      pendentes: lista.filter((item) => item.verificacaoStatus === "pendente")
        .length,
      bloqueados: lista.filter((item) => item.bloqueado).length,
      turbo: lista.filter((item) => item.plano === "turbo").length,
    };
  }, [lista]);

  function abrirDetalhe(item: ProfissionalAdmin) {
    router.push({
      pathname: "/admin/profissional-detalhe",
      params: { id: item.id },
    });
  }

  function abrirAnalise(item: ProfissionalAdmin) {
    router.push({
      pathname: "/admin/documentos-profissional",
      params: { id: item.id },
    });
  }

  async function abrirWhatsApp(item: ProfissionalAdmin) {
    const telefone = String(item.telefone || "").replace(/\D/g, "");
    if (!telefone) {
      Alert.alert("Contato indisponível", "Esse profissional não possui telefone cadastrado.");
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

  function sair() {
    Alert.alert("Sair", "Deseja realmente sair do painel admin?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
          } finally {
            router.replace("/");
          }
        },
      },
    ]);
  }

  function atualizarLista() {
    setRefreshing(true);
    setNovoProfissional(false);
    setTimeout(() => setRefreshing(false), 700);
  }

  function textoPlano(plano?: string) {
    if (!plano || plano === "gratuito") return "GRATUITO";
    if (plano === "mensal") return "MENSAL";
    if (plano === "turbo") return "TURBO";
    return String(plano).toUpperCase();
  }

  function textoStatus(status?: VerificacaoStatus) {
    if (status === "aprovado") return "APROVADO";
    if (status === "pendente") return "PENDENTE";
    if (status === "rejeitado") return "REJEITADO";
    return "NÃO ENVIADO";
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
        <Text style={styles.loadingText}>Carregando profissionais...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={atualizarLista} />
        }
      >
        <AppHeader
          title="Profissionais"
          subtitle="Gerencie os profissionais do app"
          showBackButton
          rightComponent={
            <TouchableOpacity onPress={sair} style={styles.logoutButton}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          }
        />

        {novoProfissional && (
          <TouchableOpacity
            style={styles.newBadge}
            activeOpacity={0.9}
            onPress={() => setNovoProfissional(false)}
          >
            <Text style={styles.newBadgeText}>
              Novo profissional entrou na lista
            </Text>
          </TouchableOpacity>
        )}

        {!!erroTela && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Atualização com falha</Text>
            <Text style={styles.errorText}>{erroTela}</Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{totais.total} profissional(is)</Text>
          <Text style={styles.heroText}>
            Acompanhe status, verificação e acesso rápido às ações.
          </Text>

          <View style={styles.metricRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{totais.online}</Text>
              <Text style={styles.metricLabel}>Online</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{totais.pendentes}</Text>
              <Text style={styles.metricLabel}>Pendentes</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{totais.bloqueados}</Text>
              <Text style={styles.metricLabel}>Bloqueados</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{totais.turbo}</Text>
              <Text style={styles.metricLabel}>Turbo</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome, serviço, cidade, email ou telefone"
            placeholderTextColor={theme.colors.textMuted}
          />

          <View style={styles.filtrosRow}>
            {(
              [
                "todos",
                "aprovado",
                "pendente",
                "rejeitado",
                "online",
                "bloqueado",
              ] as FiltroStatus[]
            ).map((item) => {
              const ativo = filtroStatus === item;

              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.filtroBtn, ativo && styles.filtroBtnAtivo]}
                  onPress={() => setFiltroStatus(item)}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.filtroTexto,
                      ativo && styles.filtroTextoAtivo,
                    ]}
                  >
                    {item === "todos" && "Todos"}
                    {item === "aprovado" && "Aprovados"}
                    {item === "pendente" && "Pendentes"}
                    {item === "rejeitado" && "Rejeitados"}
                    {item === "online" && "Online"}
                    {item === "bloqueado" && "Bloqueados"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {profissionaisFiltrados.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhum profissional encontrado</Text>
            <Text style={styles.emptyText}>
              Tente mudar a busca ou o filtro selecionado.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {profissionaisFiltrados.map((item) => (
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
                      item.verificacaoStatus === "aprovado" &&
                        styles.statusBadgeSuccess,
                      item.verificacaoStatus === "pendente" &&
                        styles.statusBadgeWarning,
                      item.verificacaoStatus === "rejeitado" &&
                        styles.statusBadgeDanger,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {textoStatus(item.verificacaoStatus)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.onlineBadge,
                      item.online && styles.onlineBadgeAtivo,
                    ]}
                  >
                    <Text style={styles.onlineBadgeText}>
                      {item.online ? "ONLINE" : "OFFLINE"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.nome}>
                  {item.nome || "Profissional sem nome"}
                </Text>

                <Text style={styles.meta}>
                  Serviço: {item.servico || "Não informado"}
                </Text>

                <Text style={styles.meta}>
                  Cidade: {item.cidade || "Não informada"}
                </Text>

                {!!item.email && (
                  <Text style={styles.meta}>Email: {item.email}</Text>
                )}

                {!!item.telefone && (
                  <Text style={styles.meta}>Telefone: {item.telefone}</Text>
                )}

                <View style={styles.tagsRow}>
                  <View style={[styles.tagPlano, styles.tagPlanoBase]}>
                    <Text style={styles.tagPlanoText}>
                      Plano: {textoPlano(item.plano)}
                    </Text>
                  </View>

                  {item.bloqueado && (
                    <View style={styles.tagBloqueado}>
                      <Text style={styles.tagBloqueadoText}>BLOQUEADO</Text>
                    </View>
                  )}
                </View>

                {!!item.bloqueado && !!item.motivoBloqueio && (
                  <View style={styles.motivoBox}>
                    <Text style={styles.motivoTitle}>Motivo do bloqueio</Text>
                    <Text style={styles.motivoText}>{item.motivoBloqueio}</Text>
                  </View>
                )}

                <View style={styles.bottomRow}>
                  <Text style={styles.detalheLink}>Toque para abrir detalhes</Text>

                  <View style={styles.actionsRight}>
                    {!!item.telefone && (
                      <TouchableOpacity
                        onPress={() => abrirWhatsApp(item)}
                        style={styles.whatsBtn}
                      >
                        <Ionicons
                          name="logo-whatsapp"
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    )}

                    {item.verificacaoStatus === "pendente" && (
                      <TouchableOpacity
                        onPress={() => abrirAnalise(item)}
                        style={styles.analisarBtn}
                      >
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.analisarBtnText}>Analisar</Text>
                      </TouchableOpacity>
                    )}
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

    logoutButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.card,
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
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },

    errorCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      padding: 16,
      marginBottom: 16,
    },

    errorTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
    },

    errorText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
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
      flexWrap: "wrap",
    },

    metricBox: {
      flex: 1,
      minWidth: 72,
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
      backgroundColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    statusBadgeSuccess: {
      backgroundColor: theme.colors.success,
    },

    statusBadgeWarning: {
      backgroundColor: theme.colors.warning,
    },

    statusBadgeDanger: {
      backgroundColor: theme.colors.danger,
    },

    statusBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
    },

    onlineBadge: {
      backgroundColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    onlineBadgeAtivo: {
      backgroundColor: theme.colors.success,
    },

    onlineBadgeText: {
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

    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },

    tagPlano: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    tagPlanoBase: {
      backgroundColor: "rgba(37,99,235,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },

    tagPlanoText: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "800",
    },

    tagBloqueado: {
      backgroundColor: "rgba(239,68,68,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.danger,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    tagBloqueadoText: {
      color: theme.colors.danger,
      fontSize: 11,
      fontWeight: "800",
    },

    motivoBox: {
      marginTop: 10,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      padding: 12,
    },

    motivoTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 4,
    },

    motivoText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
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

    actionsRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    whatsBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#25D366",
      alignItems: "center",
      justifyContent: "center",
    },

    analisarBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.colors.warning,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
    },

    analisarBtnText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },
  });
}
