import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

type VerificacaoStatus =
  | "nao_enviado"
  | "pendente"
  | "aprovado"
  | "rejeitado";

type ProfissionalVerificacao = {
  id: string;
  nome?: string;
  servico?: string;
  cidade?: string;
  telefone?: string;
  plano?: string;
  verificacaoStatus?: VerificacaoStatus;
  documentosEnviados?: boolean;
  motivoRejeicao?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  documentoFrente?: string;
  documentoVerso?: string;
  selfieDocumento?: string;
  atualizadoEm?: any;
  verificacaoEnviadaEm?: any;
};

export default function AdminVerificacoes() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ProfissionalVerificacao[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

        unsubscribeLista = onSnapshot(
          collection(db, "users"),
          (snapshot) => {
            const dados = snapshot.docs
              .map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
              }))
              .filter((item) => item.tipo === "profissional")
              .map((item) => {
                const docs = item.documentosVerificacao || {};

                return {
                  id: item.id,
                  nome: item.nome || "",
                  servico: item.servico || item.categoria || "",
                  cidade: item.cidade || "",
                  telefone: item.telefone || "",
                  plano: item.plano || "gratuito",
                  verificacaoStatus:
                    (item.verificacaoStatus as VerificacaoStatus) ||
                    "nao_enviado",
                  documentosEnviados: item.documentosEnviados === true,
                  motivoRejeicao: item.motivoRejeicao || "",
                  tipoDocumento: item.tipoDocumento || "",
                  numeroDocumento: item.numeroDocumento || "",
                  documentoFrente:
                    docs.documentoFrenteUrl ||
                    item.documentoFrenteUrl ||
                    item.documentoFrente ||
                    "",
                  documentoVerso:
                    docs.documentoVersoUrl ||
                    item.documentoVersoUrl ||
                    item.documentoVerso ||
                    "",
                  selfieDocumento:
                    docs.selfieUrl ||
                    item.selfieUrl ||
                    item.selfieDocumento ||
                    "",
                  atualizadoEm: item.atualizadoEm || null,
                  verificacaoEnviadaEm:
                    docs.enviadoEm || item.verificacaoEnviadaEm || null,
                } satisfies ProfissionalVerificacao;
              });

            dados.sort((a, b) => {
              const prioridade = (status?: VerificacaoStatus) => {
                switch (status) {
                  case "pendente":
                    return 0;
                  case "rejeitado":
                    return 1;
                  case "aprovado":
                    return 2;
                  case "nao_enviado":
                  default:
                    return 3;
                }
              };

              const diff = prioridade(a.verificacaoStatus) - prioridade(b.verificacaoStatus);
              if (diff !== 0) return diff;

              const nomeA = String(a.nome || "").toLowerCase();
              const nomeB = String(b.nome || "").toLowerCase();
              return nomeA.localeCompare(nomeB);
            });

            if (ativo) {
              setLista(dados);
              setCarregandoLista(false);
              setRefreshing(false);
            }
          },
          (error) => {
            console.log("Erro ao carregar verificações:", error);
            if (ativo) {
              setCarregandoLista(false);
              setRefreshing(false);
            }
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/verificacoes:", error);
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
      if (unsubscribeLista) unsubscribeLista();
    };
  }, []);

  const pendentes = useMemo(
    () => lista.filter((item) => item.verificacaoStatus === "pendente"),
    [lista]
  );

  const rejeitados = useMemo(
    () => lista.filter((item) => item.verificacaoStatus === "rejeitado"),
    [lista]
  );

  const aprovados = useMemo(
    () => lista.filter((item) => item.verificacaoStatus === "aprovado"),
    [lista]
  );

  const naoEnviados = useMemo(
    () => lista.filter((item) => item.verificacaoStatus === "nao_enviado"),
    [lista]
  );

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return lista;

    return lista.filter((item) => {
      const nome = String(item.nome || "").toLowerCase();
      const servico = String(item.servico || "").toLowerCase();
      const cidade = String(item.cidade || "").toLowerCase();
      const status = String(item.verificacaoStatus || "").toLowerCase();

      return (
        nome.includes(termo) ||
        servico.includes(termo) ||
        cidade.includes(termo) ||
        status.includes(termo)
      );
    });
  }, [busca, lista]);

  function abrirDocumentos(item: ProfissionalVerificacao) {
    router.push({
      pathname: "/admin/documentos-profissional",
      params: { id: item.id },
    });
  }

  function corStatus(status?: VerificacaoStatus) {
    switch (status) {
      case "pendente":
        return styles.badgePendente;
      case "rejeitado":
        return styles.badgeRejeitado;
      case "aprovado":
        return styles.badgeAprovado;
      case "nao_enviado":
      default:
        return styles.badgeNeutro;
    }
  }

  function textoStatus(status?: VerificacaoStatus) {
    switch (status) {
      case "pendente":
        return "EM ANÁLISE";
      case "rejeitado":
        return "REJEITADO";
      case "aprovado":
        return "APROVADO";
      case "nao_enviado":
      default:
        return "NÃO ENVIADO";
    }
  }

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
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
        <Text style={styles.loadingText}>Carregando verificações...</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <AppHeader
          title="Verificações"
          subtitle="Analise documentos enviados pelos profissionais"
          showBackButton
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Resumo das verificações</Text>
          <Text style={styles.heroText}>
            Veja rapidamente o que precisa de atenção no app.
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{pendentes.length}</Text>
              <Text style={styles.metricLabel}>Pendentes</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{rejeitados.length}</Text>
              <Text style={styles.metricLabel}>Rejeitados</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{aprovados.length}</Text>
              <Text style={styles.metricLabel}>Aprovados</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricNumber}>{naoEnviados.length}</Text>
              <Text style={styles.metricLabel}>Sem envio</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.searchTitle}>Buscar profissional</Text>
          <TextInput
            style={styles.inputBusca}
            placeholder="Buscar por nome, serviço, cidade ou status"
            placeholderTextColor={theme.colors.textMuted}
            value={busca}
            onChangeText={setBusca}
          />
        </View>

        {listaFiltrada.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nada encontrado</Text>
            <Text style={styles.emptyText}>
              Nenhum profissional bate com o filtro digitado.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {listaFiltrada.map((item) => {
              const temDocumentos =
                !!item.documentoFrente || !!item.documentoVerso || !!item.selfieDocumento;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.card}
                  activeOpacity={0.95}
                  onPress={() => abrirDocumentos(item)}
                >
                  <View style={styles.cardTopRow}>
                    <View
                      style={[styles.statusBadge, corStatus(item.verificacaoStatus)]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {textoStatus(item.verificacaoStatus)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.nome}>
                    {item.nome || "Profissional sem nome"}
                  </Text>

                  <Text style={styles.meta}>
                    {item.servico || "Serviço não informado"} •{" "}
                    {item.cidade || "Cidade não informada"}
                  </Text>

                  <Text style={styles.meta}>
                    Documento:{" "}
                    {item.tipoDocumento
                      ? `${String(item.tipoDocumento).toUpperCase()} • ${item.numeroDocumento || "Sem número"}`
                      : "Não informado"}
                  </Text>

                  <Text style={styles.meta}>
                    Arquivos enviados: {temDocumentos ? "Sim" : "Não"}
                  </Text>

                  {item.verificacaoStatus === "rejeitado" && !!item.motivoRejeicao && (
                    <View style={styles.motivoBox}>
                      <Text style={styles.motivoTitle}>Motivo da recusa</Text>
                      <Text style={styles.motivoText}>{item.motivoRejeicao}</Text>
                    </View>
                  )}

                  <View style={styles.bottomRow}>
                    <Text style={styles.openText}>Toque para abrir documentos</Text>

                    <Ionicons
                      name="chevron-forward-outline"
                      size={18}
                      color={theme.colors.textMuted}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
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
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.14 : 0.05,
      shadowRadius: 10,
      elevation: 2,
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

    metricsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    metricBox: {
      flexGrow: 1,
      minWidth: "22%",
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 14,
      paddingHorizontal: 10,
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
      textAlign: "center",
    },

    searchCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 16,
    },

    searchTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 10,
    },

    inputBusca: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: theme.colors.text,
      fontSize: 15,
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

    cardTopRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 10,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    badgePendente: {
      backgroundColor: theme.colors.warning,
    },

    badgeRejeitado: {
      backgroundColor: theme.colors.danger,
    },

    badgeAprovado: {
      backgroundColor: theme.colors.success,
    },

    badgeNeutro: {
      backgroundColor: theme.colors.textMuted,
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

    motivoBox: {
      marginTop: 10,
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
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

    openText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
      flex: 1,
    },
  });
}