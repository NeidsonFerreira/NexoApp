import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db, functions } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";
type Plano = "gratuito" | "mensal" | "turbo";
type FiltroPlano = "todos" | Plano;
type FiltroStatus = "todos" | "ativos" | "bloqueados";

type Profissional = {
  id: string;
  nome?: string;
  servico?: string;
  servicos?: string[];
  cidade?: string;
  plano?: Plano;
  tipo?: string;
  online?: boolean;
  bloqueado?: boolean;
};

type AlterarPlanoResponse = {
  ok?: boolean;
  plano?: Plano;
  planoNovoTexto?: string;
  mensagem?: string;
};

export default function AdminPlanos() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [lista, setLista] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroPlano, setFiltroPlano] = useState<FiltroPlano>("todos");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [alterando, setAlterando] = useState<string | null>(null);
  const [erroTela, setErroTela] = useState("");
  const [novoProfissional, setNovoProfissional] = useState(false);

  useEffect(() => {
    let ativo = true;
    let unsubscribeAdmin: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let inicializado = false;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) {
            setStatusTela("sem-user");
            setCarregando(false);
          }
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
              router.replace("/");
              return;
            }

            setStatusTela("admin");
          },
          (error) => {
            console.log("Erro ao ouvir admin/planos:", error);
          }
        );

        unsubscribe = onSnapshot(
          collection(db, "users"),
          (snapshot) => {
            const dados = snapshot.docs
              .map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
              }))
              .filter((u) => u.tipo === "profissional")
              .sort((a, b) =>
                String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
              ) as Profissional[];

            if (ativo) {
              setLista((prev) => {
                if (inicializado && dados.length > prev.length) {
                  setNovoProfissional(true);
                }
                return dados;
              });
              setErroTela("");
              setCarregando(false);
              setRefreshing(false);
            }

            inicializado = true;
          },
          (error) => {
            console.log("Erro ao carregar profissionais:", error);
            if (ativo) {
              setErroTela("Não foi possível atualizar os planos em tempo real.");
              setCarregando(false);
              setRefreshing(false);
            }
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/planos:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregando(false);
          setRefreshing(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeAdmin) unsubscribeAdmin();
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return lista.filter((item) => {
      const nome = String(item.nome || "").toLowerCase();
      const servico = String(item.servico || item.servicos?.[0] || "").toLowerCase();
      const cidade = String(item.cidade || "").toLowerCase();
      const planoAtual = (item.plano || "gratuito") as Plano;

      const bateBusca =
        !termo ||
        nome.includes(termo) ||
        servico.includes(termo) ||
        cidade.includes(termo);

      const batePlano = filtroPlano === "todos" ? true : planoAtual === filtroPlano;

      const bateStatus =
        filtroStatus === "todos"
          ? true
          : filtroStatus === "bloqueados"
          ? item.bloqueado === true
          : item.bloqueado !== true;

      return bateBusca && batePlano && bateStatus;
    });
  }, [lista, busca, filtroPlano, filtroStatus]);

  const totais = useMemo(() => {
    return {
      total: lista.length,
      gratuito: lista.filter((item) => (item.plano || "gratuito") === "gratuito").length,
      mensal: lista.filter((item) => item.plano === "mensal").length,
      turbo: lista.filter((item) => item.plano === "turbo").length,
    };
  }, [lista]);

  function textoPlano(plano?: Plano) {
    if (plano === "mensal") return "MENSAL";
    if (plano === "turbo") return "TURBO";
    return "GRATUITO";
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

  function abrirProfissionalDetalhe(id: string) {
    router.push(`/admin/profissional-detalhe?id=${id}`);
  }

  function confirmarMudancaPlano(id: string, plano: Plano, nome?: string, planoAtual?: Plano) {
    const mensagem =
      planoAtual === "turbo" && plano === "gratuito"
        ? `Deseja mudar o plano de ${nome || "este profissional"} de TURBO para GRATUITO?

Isso reduz prioridade e destaque do perfil.`
        : `Deseja mudar o plano de ${nome || "este profissional"} para ${textoPlano(plano)}?`;

    Alert.alert("Alterar plano", mensagem, [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", onPress: () => mudarPlano(id, plano) },
    ]);
  }

  async function mudarPlano(id: string, plano: Plano) {
    try {
      setAlterando(id);

      const callable = httpsCallable<
        { profissionalId: string; plano: Plano },
        AlterarPlanoResponse
      >(functions, "alterarPlanoProfissional");

      const response = await callable({
        profissionalId: id,
        plano,
      });

      Alert.alert(
        "Sucesso",
        `Plano alterado para ${response.data?.planoNovoTexto || textoPlano(plano)}.`
      );
    } catch (error: any) {
      console.log("Erro ao alterar plano:", error);
      Alert.alert("Erro", error?.message || "Não foi possível alterar o plano.");
    } finally {
      setAlterando(null);
    }
  }

  function planoBadgeStyle(plano?: Plano) {
    if (plano === "turbo") return styles.planBadgeWarning;
    if (plano === "mensal") return styles.planBadgePrimary;
    return styles.planBadgeNeutral;
  }

  function planoTextStyle(plano?: Plano) {
    if (plano === "turbo") return styles.planBadgeTextDark;
    return styles.planBadgeTextLight;
  }

  function onRefresh() {
    setRefreshing(true);
    setNovoProfissional(false);
    setTimeout(() => setRefreshing(false), 700);
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.text}>Verificando acesso.</Text>
      </View>
    );
  }

  if (statusTela !== "admin") {
    return <Redirect href="/" />;
  }

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.text}>Carregando profissionais.</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AppHeader
          title="Planos"
          subtitle="Gerencie os planos dos profissionais"
          showBackButton
          rightComponent={
            <TouchableOpacity onPress={sair} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          }
        />

        {novoProfissional && (
          <TouchableOpacity
            style={styles.newBadge}
            activeOpacity={0.9}
            onPress={() => setNovoProfissional(false)}
          >
            <Text style={styles.newBadgeText}>Novo profissional entrou na lista</Text>
          </TouchableOpacity>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Resumo dos planos</Text>
          <Text style={styles.heroText}>
            Veja quantos profissionais estão em cada plano e altere rapidamente quando precisar.
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{totais.total}</Text>
            <Text style={styles.metricLabel}>Total</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{totais.gratuito}</Text>
            <Text style={styles.metricLabel}>Gratuito</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCardPrimary}>
            <Text style={styles.metricNumber}>{totais.mensal}</Text>
            <Text style={styles.metricLabel}>Mensal</Text>
          </View>

          <View style={styles.metricCardWarning}>
            <Text style={styles.metricNumber}>{totais.turbo}</Text>
            <Text style={styles.metricLabel}>Turbo</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {[
            ["todos", "Todos"],
            ["gratuito", "Gratuito"],
            ["mensal", "Mensal"],
            ["turbo", "Turbo"],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterChip,
                filtroPlano === key && styles.filterChipActive,
              ]}
              onPress={() => setFiltroPlano(key as FiltroPlano)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filtroPlano === key && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filterRow}>
          {[
            ["todos", "Todos"],
            ["ativos", "Ativos"],
            ["bloqueados", "Bloqueados"],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterChipSecondary,
                filtroStatus === key && styles.filterChipSecondaryActive,
              ]}
              onPress={() => setFiltroStatus(key as FiltroStatus)}
            >
              <Text
                style={[
                  styles.filterChipSecondaryText,
                  filtroStatus === key && styles.filterChipSecondaryTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            placeholder="Buscar profissional."
            placeholderTextColor={theme.colors.textMuted}
            value={busca}
            onChangeText={setBusca}
          />
        </View>

        {!!erroTela && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Falha temporária</Text>
            <Text style={styles.emptyText}>{erroTela}</Text>
          </View>
        )}

        {filtrados.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhum profissional encontrado</Text>
            <Text style={styles.emptyText}>
              Tente mudar a busca para localizar outro profissional.
            </Text>
          </View>
        ) : (
          filtrados.map((item) => {
            const planoAtual = item.plano || "gratuito";

            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.topRow}>
                  <Text style={styles.nome}>{item.nome || "Profissional"}</Text>

                  <View style={[styles.planBadge, planoBadgeStyle(planoAtual)]}>
                    <Text style={[styles.planBadgeText, planoTextStyle(planoAtual)]}>
                      {textoPlano(planoAtual)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.meta}>
                  {item.servico || item.servicos?.[0] || "Serviço não informado"} •{" "}
                  {item.cidade || "Cidade não informada"}
                </Text>

                <Text style={styles.planoAtualText}>
                  Plano atual: {textoPlano(planoAtual)}
                </Text>

                <Text style={item.bloqueado ? styles.statusBlocked : styles.statusActive}>
                  {item.bloqueado ? "Bloqueado" : "Ativo"}
                </Text>

                <TouchableOpacity
                  style={styles.detailLink}
                  activeOpacity={0.9}
                  onPress={() => abrirProfissionalDetalhe(item.id)}
                >
                  <Text style={styles.detailLinkText}>Abrir profissional-detalhe</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>

                <View style={styles.historyCard}>
                  <Text style={styles.historyTitle}>Última alteração de plano</Text>
                  <Text style={styles.historyText}>
                    {String((item as any).ultimoPlanoAlteradoPorNome || (item as any).ultimoPlanoAlteradoPor || "Não informado")}
                  </Text>
                  <Text style={styles.historyText}>
                    {String((item as any).ultimoPlanoAlteradoEm ? "Alterado recentemente" : "Sem histórico")}
                  </Text>
                </View>

                <View style={styles.buttonWrap}>
                  <ActionButton
                    title={
                      alterando === item.id
                        ? "PROCESSANDO..."
                        : planoAtual === "gratuito"
                        ? "GRATUITO (ATUAL)"
                        : "MUDAR PARA GRATUITO"
                    }
                    onPress={() => confirmarMudancaPlano(item.id, "gratuito", item.nome, planoAtual)}
                    variant="neutral"
                    disabled={alterando === item.id || planoAtual === "gratuito"}
                  />
                </View>

                <View style={styles.buttonWrap}>
                  <ActionButton
                    title={
                      alterando === item.id
                        ? "PROCESSANDO..."
                        : planoAtual === "mensal"
                        ? "MENSAL (ATUAL)"
                        : "MUDAR PARA MENSAL"
                    }
                    onPress={() => confirmarMudancaPlano(item.id, "mensal", item.nome, planoAtual)}
                    variant="primary"
                    disabled={alterando === item.id || planoAtual === "mensal"}
                  />
                </View>

                <View style={styles.buttonWrap}>
                  <ActionButton
                    title={
                      alterando === item.id
                        ? "PROCESSANDO..."
                        : planoAtual === "turbo"
                        ? "TURBO (ATUAL)"
                        : "MUDAR PARA TURBO"
                    }
                    onPress={() => confirmarMudancaPlano(item.id, "turbo", item.nome, planoAtual)}
                    variant="warning"
                    disabled={alterando === item.id || planoAtual === "turbo"}
                  />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: any, mode: "dark" | "light") {
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 32,
      gap: 12,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: theme.colors.background,
    },
    text: {
      marginTop: 10,
      color: theme.colors.text,
      fontSize: 15,
      textAlign: "center",
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
    },
    newBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },
    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 6,
    },
    heroText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    metricRow: {
      flexDirection: "row",
      gap: 10,
    },
    metricCard: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    metricCardPrimary: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    metricCardWarning: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    metricNumber: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 4,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontSize: 13,
      textAlign: "center",
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    filterChipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    filterChipText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },

    filterChipTextActive: {
      color: "#fff",
    },

    filterChipSecondary: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    filterChipSecondaryActive: {
      borderColor: theme.colors.success,
      backgroundColor: theme.colors.card,
    },

    filterChipSecondaryText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },

    filterChipSecondaryTextActive: {
      color: theme.colors.success,
    },

    searchCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
    input: {
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.border,
      fontSize: 15,
    },
    emptyCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
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
    card: {
      backgroundColor: theme.colors.card,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    nome: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
      flex: 1,
    },
    meta: {
      color: theme.colors.textMuted,
      marginBottom: 6,
      fontSize: 14,
      lineHeight: 20,
    },
    planoAtualText: {
      color: theme.colors.text,
      fontWeight: "700",
      marginBottom: 8,
      fontSize: 14,
    },

    statusActive: {
      color: theme.colors.success,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 10,
    },

    statusBlocked: {
      color: theme.colors.danger,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 10,
    },

    detailLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
    },

    detailLinkText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },

    historyCard: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },

    historyTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 4,
    },

    historyText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },

    planBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    planBadgeNeutral: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
    },
    planBadgePrimary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    planBadgeWarning: {
      backgroundColor: theme.colors.warning,
      borderColor: theme.colors.warning,
    },
    planBadgeText: {
      fontSize: 11,
      fontWeight: "800",
    },
    planBadgeTextLight: {
      color: "#fff",
    },
    planBadgeTextDark: {
      color: "#1f2937",
    },
    buttonWrap: {
      marginTop: 10,
    },
  });
}
