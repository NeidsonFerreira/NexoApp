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
type FiltroPedido = "todos" | "pendente" | "aceito" | "a_caminho" | "concluido" | "recusado";
type FiltroVisualStatus = "todos" | "pendente" | "em_andamento" | "concluido" | "recusado";

type StatusPedido =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado";

type PedidoAdmin = {
  id: string;
  status?: StatusPedido;
  clienteNome?: string;
  nomeCliente?: string;
  profissionalNome?: string;
  nomeProfissional?: string;
  servico?: string;
  tipoAtendimento?: string;
  criadoEm?: any;
  latitudeCliente?: number;
  longitudeCliente?: number;
};

function textoStatus(status?: StatusPedido) {
  switch (status) {
    case "pendente":
      return "Pendente";
    case "aceito":
      return "Aceito";
    case "a_caminho":
      return "A caminho";
    case "chegou":
      return "Chegou";
    case "cliente_a_caminho":
      return "Cliente a caminho";
    case "cliente_chegou":
      return "Cliente chegou";
    case "concluido":
      return "Concluído";
    case "recusado":
      return "Recusado";
    default:
      return "Sem status";
  }
}

function prioridade(status?: StatusPedido) {
  switch (status) {
    case "pendente":
      return 0;
    case "aceito":
      return 1;
    case "a_caminho":
      return 2;
    case "cliente_a_caminho":
      return 3;
    case "chegou":
      return 4;
    case "cliente_chegou":
      return 5;
    case "concluido":
      return 6;
    case "recusado":
      return 7;
    default:
      return 8;
  }
}

export default function AdminPedidos() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [lista, setLista] = useState<PedidoAdmin[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [erroTela, setErroTela] = useState("");
  const [novoPedido, setNovoPedido] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroPedido>("todos");
  const [filtroVisualStatus, setFiltroVisualStatus] =
    useState<FiltroVisualStatus>("todos");
  const [processandoRapido, setProcessandoRapido] = useState<string | null>(null);

  const aceitarPedidoFn = httpsCallable(functions, "aceitarPedido");

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
            router.replace("/entrada");
          }
        },
      },
    ]);
  }

  function atualizarLista() {
    setRefreshing(true);
    setNovoPedido(false);
    setTimeout(() => setRefreshing(false), 700);
  }

  function pedidoEmAndamento(status?: StatusPedido) {
    return (
      status === "aceito" ||
      status === "a_caminho" ||
      status === "chegou" ||
      status === "cliente_a_caminho" ||
      status === "cliente_chegou"
    );
  }

  function textoTipoAtendimento(tipo?: string) {
    return tipo === "movel"
      ? "Móvel"
      : tipo === "fixo"
      ? "Fixo"
      : "Não informado";
  }

  function formatarData(valor: any) {
    try {
      const data =
        typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
      if (Number.isNaN(data.getTime())) return "Sem data";
      return data.toLocaleDateString("pt-BR");
    } catch {
      return "Sem data";
    }
  }

  function temCoordenadas(item: PedidoAdmin) {
    return (
      typeof item.latitudeCliente === "number" &&
      typeof item.longitudeCliente === "number"
    );
  }

  async function acaoRapidaAceitar(item: PedidoAdmin) {
    if (processandoRapido) return;

    Alert.alert(
      "Aceitar pedido",
      "Deseja aceitar rapidamente este pedido?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Aceitar",
          onPress: async () => {
            try {
              setProcessandoRapido(item.id);
              await aceitarPedidoFn({ pedidoId: item.id });
              Alert.alert("Sucesso", "Pedido aceito com sucesso.");
            } catch (error: any) {
              console.log("Erro na ação rápida de aceitar:", error);
              Alert.alert(
                "Erro",
                error?.message || "Não foi possível aceitar o pedido."
              );
            } finally {
              setProcessandoRapido(null);
            }
          },
        },
      ]
    );
  }

  function acaoRapidaMapaReal(item: PedidoAdmin) {
    if (!temCoordenadas(item)) {
      Alert.alert("Sem localização", "Esse pedido não possui coordenadas disponíveis.");
      return;
    }

    router.push(
      `/mapa?clienteLat=${item.latitudeCliente}&clienteLng=${item.longitudeCliente}&pedidoId=${item.id}`
    );
  }

  function acaoRapidaCancelar(item: PedidoAdmin) {
    Alert.alert(
      "Abrir pedido",
      "A ação rápida vai abrir o detalhe do pedido para você concluir a decisão com segurança.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Abrir", onPress: () => abrirDetalhe(item) },
      ]
    );
  }

  function abrirDetalhe(item: PedidoAdmin) {
    router.push(`/admin/pedido-detalhe?id=${item.id}`);
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
          }
        );

        unsubscribeLista = onSnapshot(
          collection(db, "pedidos"),
          (snapshot) => {
            const dados = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<PedidoAdmin, "id">),
            }));

            dados.sort((a, b) => {
              const diff = prioridade(a.status) - prioridade(b.status);
              if (diff !== 0) return diff;

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

            if (ativo) {
              setLista((prev) => {
                if (inicializado && dados.length > prev.length) {
                  setNovoPedido(true);
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
            console.log("Erro ao carregar pedidos:", error);
            if (ativo) {
              setErroTela("Não foi possível atualizar a lista de pedidos em tempo real.");
              setCarregandoLista(false);
              setRefreshing(false);
            }
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar admin/pedidos:", error);
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

  const pedidosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return lista.filter((item) => {
      const clienteNome = String(item.clienteNome || item.nomeCliente || "").toLowerCase();
      const profissionalNome = String(
        item.profissionalNome || item.nomeProfissional || ""
      ).toLowerCase();
      const servico = String(item.servico || "").toLowerCase();
      const tipoAtendimento = String(item.tipoAtendimento || "").toLowerCase();
      const status = String(item.status || "");

      const bateBusca =
        !termo ||
        clienteNome.includes(termo) ||
        profissionalNome.includes(termo) ||
        servico.includes(termo) ||
        tipoAtendimento.includes(termo) ||
        status.includes(termo);

      const bateFiltroPrincipal = filtro === "todos" ? true : item.status === filtro;

      const bateFiltroVisual =
        filtroVisualStatus === "todos"
          ? true
          : filtroVisualStatus === "pendente"
          ? item.status === "pendente"
          : filtroVisualStatus === "concluido"
          ? item.status === "concluido"
          : filtroVisualStatus === "recusado"
          ? item.status === "recusado"
          : pedidoEmAndamento(item.status);

      return bateBusca && bateFiltroPrincipal && bateFiltroVisual;
    });
  }, [lista, busca, filtro, filtroVisualStatus]);

  const pedidosAtivosResumo = useMemo(
    () => lista.filter((item) => pedidoEmAndamento(item.status)),
    [lista]
  );
  const pedidosConcluidosResumo = useMemo(
    () => lista.filter((item) => item.status === "concluido"),
    [lista]
  );
  const pedidosRecusadosResumo = useMemo(
    () => lista.filter((item) => item.status === "recusado"),
    [lista]
  );
  const pedidosMoveisResumo = useMemo(
    () => lista.filter((item) => item.tipoAtendimento === "movel"),
    [lista]
  );
  const pedidosFixosResumo = useMemo(
    () => lista.filter((item) => item.tipoAtendimento === "fixo"),
    [lista]
  );
  const pedidoMaisUrgente = useMemo(
    () =>
      lista.find(
        (item) =>
          item.status === "pendente" ||
          item.status === "aceito" ||
          item.status === "a_caminho"
      ) || null,
    [lista]
  );

  const pedidosAgrupadosPorData = useMemo(() => {
    const grupos: Record<string, PedidoAdmin[]> = {};

    pedidosFiltrados.forEach((item) => {
      const chave = formatarData(item.criadoEm);
      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(item);
    });

    return Object.entries(grupos);
  }, [pedidosFiltrados]);

  function abrirPedidoEmDestaque() {
    if (!pedidoMaisUrgente) return;
    abrirDetalhe(pedidoMaisUrgente);
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
        <Text style={styles.loadingText}>Carregando pedidos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={atualizarLista}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Pedidos"
          subtitle="Acompanhe todos os pedidos do app"
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

        {!!erroTela.trim() && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Atualização com falha</Text>
            <Text style={styles.errorText}>{erroTela.trim()}</Text>
          </View>
        )}

        {novoPedido && (
          <TouchableOpacity
            style={styles.newBadge}
            activeOpacity={0.9}
            onPress={() => setNovoPedido(false)}
          >
            <Text style={styles.newBadgeText}>
              Novo pedido entrou na lista • toque para limpar
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Pedidos do app</Text>
          <Text style={styles.heroText}>
            Acompanhe o fluxo dos pedidos e entre nos detalhes quando precisar.
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBadgePrimary}>
              <Text style={styles.summaryBadgeText}>
                Ativos: {pedidosAtivosResumo.length}
              </Text>
            </View>

            <View style={styles.summaryBadgeSuccess}>
              <Text style={styles.summaryBadgeText}>
                Concluídos: {pedidosConcluidosResumo.length}
              </Text>
            </View>

            <View style={styles.summaryBadgeDanger}>
              <Text style={styles.summaryBadgeText}>
                Recusados: {pedidosRecusadosResumo.length}
              </Text>
            </View>

            <View style={styles.summaryBadgeNeutral}>
              <Text style={styles.summaryBadgeText}>
                Móvel: {pedidosMoveisResumo.length}
              </Text>
            </View>

            <View style={styles.summaryBadgeNeutral}>
              <Text style={styles.summaryBadgeText}>
                Fixo: {pedidosFixosResumo.length}
              </Text>
            </View>
          </View>
        </View>

        {!!pedidoMaisUrgente && (
          <View style={styles.urgentCard}>
            <Text style={styles.urgentTitle}>Pedido em destaque</Text>
            <Text style={styles.urgentText}>
              {String(
                pedidoMaisUrgente.clienteNome ||
                  pedidoMaisUrgente.nomeCliente ||
                  "Cliente"
              )}{" "}
              • {textoStatus(pedidoMaisUrgente.status)}
            </Text>

            <View style={styles.buttonTop}>
              <ActionButton
                title="ABRIR PEDIDO EM DESTAQUE"
                onPress={abrirPedidoEmDestaque}
                variant="primary"
              />
            </View>
          </View>
        )}

        <View style={styles.filterRow}>
          {[
            ["todos", "Todos"],
            ["pendente", "Pendentes"],
            ["em_andamento", "Em andamento"],
            ["concluido", "Concluídos"],
            ["recusado", "Recusados"],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterChip,
                filtroVisualStatus === key && styles.filterChipActive,
              ]}
              onPress={() => setFiltroVisualStatus(key as FiltroVisualStatus)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filtroVisualStatus === key && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchCard}>
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por cliente, profissional, serviço ou status"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
        </View>

        {pedidosAgrupadosPorData.map(([dataLabel, itens]) => (
          <View key={dataLabel} style={styles.groupSection}>
            <Text style={styles.groupTitle}>{dataLabel}</Text>

            {itens.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => abrirDetalhe(item)}
                activeOpacity={0.9}
              >
                <View style={styles.itemContent}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemTitle}>
                      {item.clienteNome || item.nomeCliente || "Cliente sem nome"}
                    </Text>

                    <View
                      style={[
                        styles.statusBadge,
                        item.status === "pendente"
                          ? styles.statusPendente
                          : pedidoEmAndamento(item.status)
                          ? styles.statusAndamento
                          : item.status === "concluido"
                          ? styles.statusConcluido
                          : item.status === "recusado"
                          ? styles.statusRecusado
                          : styles.statusDefault,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {processandoRapido === item.id
                          ? "Processando..."
                          : textoStatus(item.status)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.itemSubtitle}>
                    {item.profissionalNome ||
                      item.nomeProfissional ||
                      "Profissional não definido"}
                  </Text>

                  <Text style={styles.itemMeta}>
                    {item.servico || "Serviço não informado"}
                  </Text>

                  <Text style={styles.itemMeta}>
                    Atendimento: {textoTipoAtendimento(item.tipoAtendimento)}
                  </Text>

                  {temCoordenadas(item) && (
                    <Text style={styles.itemMeta}>Localização disponível</Text>
                  )}
                </View>

                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={styles.quickActionButton}
                    onPress={() =>
                      temCoordenadas(item)
                        ? acaoRapidaMapaReal(item)
                        : acaoRapidaCancelar(item)
                    }
                  >
                    <Ionicons
                      name="map-outline"
                      size={16}
                      color={theme.colors.text}
                    />
                  </TouchableOpacity>

                  {item.status === "pendente" && (
                    <TouchableOpacity
                      style={[
                        styles.quickActionButton,
                        styles.quickActionButtonPrimary,
                      ]}
                      disabled={processandoRapido === item.id}
                      onPress={() => acaoRapidaAceitar(item)}
                    >
                      <Ionicons
                        name="checkmark-outline"
                        size={16}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.quickActionButton}
                    onPress={() => acaoRapidaCancelar(item)}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={theme.colors.text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.itemButton}
                    onPress={() => abrirDetalhe(item)}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.colors.text}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
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
      backgroundColor: theme.colors.background,
    },

    content: {
      padding: 16,
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

    errorCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
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

    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
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
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },

    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },

    summaryBadgePrimary: {
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    summaryBadgeSuccess: {
      backgroundColor: theme.colors.success,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    summaryBadgeDanger: {
      backgroundColor: theme.colors.danger,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    summaryBadgeNeutral: {
      backgroundColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    summaryBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },

    urgentCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      padding: 16,
      marginBottom: 16,
    },

    urgentTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 6,
    },

    urgentText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },

    buttonTop: {
      marginTop: 12,
    },

    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
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

    searchCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      marginBottom: 16,
    },

    searchInput: {
      color: theme.colors.text,
      fontSize: 14,
    },

    groupSection: {
      marginBottom: 18,
    },

    groupTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800",
      marginBottom: 10,
    },

    itemCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.12 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },

    itemContent: {
      gap: 6,
    },

    itemHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },

    itemTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      flex: 1,
    },

    itemSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },

    itemMeta: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },

    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    statusPendente: {
      backgroundColor: theme.colors.warning,
    },

    statusAndamento: {
      backgroundColor: theme.colors.primary,
    },

    statusConcluido: {
      backgroundColor: theme.colors.success,
    },

    statusRecusado: {
      backgroundColor: theme.colors.danger,
    },

    statusDefault: {
      backgroundColor: theme.colors.border,
    },

    statusBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
    },

    quickActionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
    },

    quickActionButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.card,
    },

    quickActionButtonPrimary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    itemButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.card,
    },
  });
}
