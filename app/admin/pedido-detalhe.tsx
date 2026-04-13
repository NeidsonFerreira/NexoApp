import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db, functions } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";

type StatusPedido =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado"
  | "cancelado";

type PedidoAdmin = {
  id: string;
  status?: StatusPedido;
  clienteId?: string;
  clienteNome?: string;
  nomeCliente?: string;
  profissionalId?: string;
  profissionalNome?: string;
  nomeProfissional?: string;
  servico?: string;
  tipoAtendimento?: string;
  endereco?: string;
  observacoes?: string;
  criadoEm?: any;
  aceitoEm?: any;
  concluidoEm?: any;
  canceladoEm?: any;
  atualizadoEm?: any;
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
    case "cancelado":
      return "Cancelado";
    default:
      return "Sem status";
  }
}

function textoTipoAtendimento(tipo?: string) {
  switch (tipo) {
    case "movel":
      return "Móvel";
    case "fixo":
      return "Fixo";
    default:
      return "Não informado";
  }
}

function formatarDataHora(valor?: any) {
  try {
    if (!valor) return "—";
    const data =
      typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
    if (Number.isNaN(data.getTime())) return "—";
    return data.toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}

export default function AdminPedidoDetalhe() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [pedido, setPedido] = useState<PedidoAdmin | null>(null);
  const [carregandoPedido, setCarregandoPedido] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erroTela, setErroTela] = useState("");

  const concluirPedidoFn = httpsCallable(functions, "concluirPedido");
  const cancelarPedidoFn = httpsCallable(functions, "cancelarPedido");

  useEffect(() => {
    let ativo = true;
    let unsubscribeAdmin: (() => void) | undefined;
    let unsubscribePedido: (() => void) | undefined;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) {
            setStatusTela("sem-user");
            setCarregandoPedido(false);
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
              router.replace("/entrada");
              return;
            }

            setStatusTela("admin");
          },
          (error) => {
            console.log("Erro ao ouvir admin/pedido-detalhe:", error);
          }
        );

        if (!id) {
          if (ativo) {
            setErroTela("Pedido inválido.");
            setCarregandoPedido(false);
          }
          return;
        }

        unsubscribePedido = onSnapshot(
          doc(db, "pedidos", String(id)),
          (snapPedido) => {
            if (!ativo) return;

            if (!snapPedido.exists()) {
              setErroTela("Pedido não encontrado.");
              setPedido(null);
              setCarregandoPedido(false);
              return;
            }

            setPedido({
              id: snapPedido.id,
              ...(snapPedido.data() as Omit<PedidoAdmin, "id">),
            });
            setErroTela("");
            setCarregandoPedido(false);
          },
          (error) => {
            console.log("Erro ao ouvir pedido:", error);
            if (ativo) {
              setErroTela("Não foi possível atualizar o pedido em tempo real.");
              setCarregandoPedido(false);
            }
          }
        );
      } catch (error) {
        console.log("Erro ao iniciar pedido-detalhe:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoPedido(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeAdmin) unsubscribeAdmin();
      if (unsubscribePedido) unsubscribePedido();
    };
  }, [id]);

  const pedidoEmAndamento = useMemo(() => {
    return (
      pedido?.status === "aceito" ||
      pedido?.status === "a_caminho" ||
      pedido?.status === "chegou" ||
      pedido?.status === "cliente_a_caminho" ||
      pedido?.status === "cliente_chegou"
    );
  }, [pedido?.status]);

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

  function abrirClienteDetalhe() {
    if (!pedido?.clienteId) {
      Alert.alert("Indisponível", "Esse pedido não possui cliente vinculado.");
      return;
    }
    router.push(`/admin/cliente-detalhe?id=${pedido.clienteId}`);
  }

  function abrirProfissionalDetalhe() {
    if (!pedido?.profissionalId) {
      Alert.alert("Indisponível", "Esse pedido não possui profissional vinculado.");
      return;
    }
    router.push(`/admin/profissional-detalhe?id=${pedido.profissionalId}`);
  }

  function abrirMapa() {
    if (
      typeof pedido?.latitudeCliente !== "number" ||
      typeof pedido?.longitudeCliente !== "number"
    ) {
      Alert.alert("Sem localização", "Esse pedido não possui coordenadas disponíveis.");
      return;
    }

    router.push(
      `/mapa?clienteLat=${pedido.latitudeCliente}&clienteLng=${pedido.longitudeCliente}&pedidoId=${pedido.id}`
    );
  }

  function abrirWhatsAppCliente() {
    const tel = "";
    if (!tel) {
      Alert.alert(
        "WhatsApp",
        "Abra o detalhe do cliente para acessar os dados de contato."
      );
      return;
    }
  }

  async function confirmarConcluir() {
    if (!pedido || processando) return;

    Alert.alert(
      "Concluir pedido",
      "Deseja realmente marcar este pedido como concluído?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Concluir",
          onPress: async () => {
            try {
              setProcessando(true);
              await concluirPedidoFn({ pedidoId: pedido.id });
              Alert.alert("Sucesso", "Pedido concluído com sucesso.");
            } catch (error: any) {
              console.log("Erro ao concluir pedido:", error);
              Alert.alert(
                "Erro",
                error?.message || "Não foi possível concluir o pedido."
              );
            } finally {
              setProcessando(false);
            }
          },
        },
      ]
    );
  }

  async function confirmarCancelar() {
    if (!pedido || processando) return;

    Alert.alert(
      "Cancelar pedido",
      "Deseja realmente cancelar este pedido?",
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Cancelar pedido",
          style: "destructive",
          onPress: async () => {
            try {
              setProcessando(true);
              await cancelarPedidoFn({ pedidoId: pedido.id, motivo: "Cancelado pelo admin" });
              Alert.alert("Sucesso", "Pedido cancelado com sucesso.");
            } catch (error: any) {
              console.log("Erro ao cancelar pedido:", error);
              Alert.alert(
                "Erro",
                error?.message || "Não foi possível cancelar o pedido."
              );
            } finally {
              setProcessando(false);
            }
          },
        },
      ]
    );
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

  if (carregandoPedido) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando pedido...</Text>
      </View>
    );
  }

  if (!pedido) {
    return (
      <View style={styles.page}>
        <View style={styles.content}>
          <AppHeader
            title="Pedido"
            subtitle="Detalhes do pedido"
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

          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Pedido indisponível</Text>
            <Text style={styles.errorText}>{erroTela || "Pedido não encontrado."}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Pedido"
          subtitle="Detalhes completos do pedido"
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

        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <Text style={styles.statusTitle}>Status atual</Text>
            <View
              style={[
                styles.statusBadge,
                pedido.status === "pendente"
                  ? styles.statusPendente
                  : pedidoEmAndamento
                  ? styles.statusAndamento
                  : pedido.status === "concluido"
                  ? styles.statusConcluido
                  : pedido.status === "recusado" || pedido.status === "cancelado"
                  ? styles.statusRecusado
                  : styles.statusDefault,
              ]}
            >
              <Text style={styles.statusBadgeText}>{textoStatus(pedido.status)}</Text>
            </View>
          </View>

          <Text style={styles.statusText}>
            {pedidoEmAndamento
              ? "Este pedido está em andamento e merece atenção."
              : pedido.status === "pendente"
              ? "Este pedido aguarda ação."
              : "Este pedido já foi finalizado ou recusado."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Resumo</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Serviço: </Text>
            {pedido.servico || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Tipo de atendimento: </Text>
            {textoTipoAtendimento(pedido.tipoAtendimento)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>ID do pedido: </Text>
            {pedido.id}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Participantes</Text>

          <TouchableOpacity
            style={styles.linkCard}
            activeOpacity={0.9}
            onPress={abrirClienteDetalhe}
          >
            <View style={styles.linkCardContent}>
              <Text style={styles.linkCardTitle}>Cliente</Text>
              <Text style={styles.linkCardText}>
                {pedido.clienteNome || pedido.nomeCliente || "Cliente sem nome"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkCard}
            activeOpacity={0.9}
            onPress={abrirProfissionalDetalhe}
          >
            <View style={styles.linkCardContent}>
              <Text style={styles.linkCardTitle}>Profissional</Text>
              <Text style={styles.linkCardText}>
                {pedido.profissionalNome ||
                  pedido.nomeProfissional ||
                  "Profissional não definido"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Linha do tempo</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Criado em: </Text>
            {formatarDataHora(pedido.criadoEm)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Aceito em: </Text>
            {formatarDataHora(pedido.aceitoEm)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Concluído em: </Text>
            {formatarDataHora(pedido.concluidoEm)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Cancelado em: </Text>
            {formatarDataHora(pedido.canceladoEm)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Atualizado em: </Text>
            {formatarDataHora(pedido.atualizadoEm)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Detalhes operacionais</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Endereço: </Text>
            {pedido.endereco || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Observações: </Text>
            {pedido.observacoes || "Sem observações"}
          </Text>

          <View style={styles.quickRow}>
            <ActionButton
              title="ABRIR CLIENTE"
              onPress={abrirClienteDetalhe}
              variant="neutral"
            />
          </View>

          <View style={styles.quickRow}>
            <ActionButton
              title="ABRIR PROFISSIONAL"
              onPress={abrirProfissionalDetalhe}
              variant="neutral"
            />
          </View>

          <View style={styles.quickRow}>
            <ActionButton
              title="ABRIR MAPA"
              onPress={abrirMapa}
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ações administrativas</Text>

          <View style={styles.quickRow}>
            <ActionButton
              title={processando ? "PROCESSANDO..." : "FORÇAR CONCLUSÃO"}
              onPress={confirmarConcluir}
              variant="primary"
              disabled={processando}
            />
          </View>

          <View style={styles.quickRow}>
            <ActionButton
              title={processando ? "PROCESSANDO..." : "CANCELAR PEDIDO"}
              onPress={confirmarCancelar}
              variant="danger"
              disabled={processando}
            />
          </View>
        </View>
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
      marginBottom: 4,
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

    statusCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.14 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    statusTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 8,
    },

    statusTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      flex: 1,
    },

    statusText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
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

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.12 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },

    sectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 12,
    },

    infoLine: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 8,
    },

    infoLabel: {
      color: theme.colors.text,
      fontWeight: "700",
    },

    linkCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 10,
    },

    linkCardContent: {
      flex: 1,
      paddingRight: 10,
    },

    linkCardTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 4,
    },

    linkCardText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },

    quickRow: {
      marginTop: 10,
    },
  });
}
