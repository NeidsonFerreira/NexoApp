import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
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

type ClienteDetalhe = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  bloqueado?: boolean;
  motivoBloqueio?: string;
  criadoEm?: any;
  atualizadoEm?: any;
};

type PedidoCliente = {
  id: string;
  status?: string;
  criadoEm?: any;
};

export default function AdminClienteDetalhe() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const params = useLocalSearchParams<{ id?: string }>();

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [erroTela, setErroTela] = useState("");
  const [pedidosCliente, setPedidosCliente] = useState<PedidoCliente[]>([]);

  useEffect(() => {
    let ativo = true;
    let unsubscribeAdmin: (() => void) | undefined;
    let unsubscribeCliente: (() => void) | undefined;
    let unsubscribePedidos: (() => void) | undefined;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) setStatusTela("sem-user");
          return;
        }

        const snapAdmin = await getDoc(doc(db, "users", user.uid));

        if (!snapAdmin.exists()) {
          if (ativo) {
            setStatusTela("sem-acesso");
            setCarregandoDados(false);
          }
          return;
        }

        const dadosAdmin = snapAdmin.data() as any;

        if (dadosAdmin.tipo !== "admin") {
          if (ativo) {
            setStatusTela("sem-acesso");
            setCarregandoDados(false);
          }
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

        if (!params.id || typeof params.id !== "string") {
          Alert.alert("Erro", "ID do cliente não encontrado.");
          if (ativo) setCarregandoDados(false);
          return;
        }

        unsubscribeCliente = onSnapshot(
          doc(db, "users", params.id),
          (snapCliente) => {
            if (!ativo) return;

            if (!snapCliente.exists()) {
              setErroTela("Cliente não encontrado.");
              setCarregandoDados(false);
              return;
            }

            const dadosCliente = snapCliente.data() as any;

            setCliente({
              id: snapCliente.id,
              nome: dadosCliente.nome || "",
              email: dadosCliente.email || "",
              telefone: dadosCliente.telefone || "",
              cidade: dadosCliente.cidade || "",
              bloqueado: dadosCliente.bloqueado === true,
              motivoBloqueio: dadosCliente.motivoBloqueio || "",
              criadoEm: dadosCliente.criadoEm || null,
              atualizadoEm: dadosCliente.atualizadoEm || null,
            });

            setErroTela("");
            setCarregandoDados(false);
          },
          (error) => {
            console.log("Erro ao ouvir cliente:", error);
            setErroTela("Não foi possível atualizar os dados do cliente.");
            setCarregandoDados(false);
          }
        );

        unsubscribePedidos = onSnapshot(
          query(collection(db, "pedidos"), where("clienteId", "==", params.id)),
          (snapshot) => {
            if (!ativo) return;

            const lista = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<PedidoCliente, "id">),
            }));

            setPedidosCliente(lista);
          },
          (error) => {
            console.log("Erro ao carregar pedidos do cliente:", error);
          }
        );
      } catch (error) {
        console.log("Erro ao carregar cliente:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoDados(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeAdmin) unsubscribeAdmin();
      if (unsubscribeCliente) unsubscribeCliente();
      if (unsubscribePedidos) unsubscribePedidos();
    };
  }, [params.id]);

  const resumoPedidos = useMemo(() => {
    const total = pedidosCliente.length;
    const ativos = pedidosCliente.filter((item) =>
      ["pendente", "aceito", "a_caminho", "chegou", "cliente_a_caminho", "cliente_chegou"].includes(
        String(item.status || "")
      )
    ).length;
    const concluidos = pedidosCliente.filter(
      (item) => item.status === "concluido"
    ).length;
    const cancelados = pedidosCliente.filter(
      (item) => item.status === "cancelado" || item.status === "recusado"
    ).length;

    const taxaCancelamento = total > 0 ? Math.round((cancelados / total) * 100) : 0;
    const score = total > 0 ? Math.max(0, 100 - taxaCancelamento) : 100;

    return {
      total,
      ativos,
      concluidos,
      cancelados,
      taxaCancelamento,
      score,
    };
  }, [pedidosCliente]);

  const pedidoAtivo = useMemo(() => {
    return (
      pedidosCliente.find((item) =>
        ["pendente", "aceito", "a_caminho", "chegou", "cliente_a_caminho", "cliente_chegou"].includes(
          String(item.status || "")
        )
      ) || null
    );
  }, [pedidosCliente]);

  const alertaComportamento = useMemo(() => {
    if (resumoPedidos.cancelados >= 5) {
      return "Muitos cancelamentos detectados.";
    }

    if (resumoPedidos.taxaCancelamento >= 50 && resumoPedidos.total >= 4) {
      return "Taxa de cancelamento alta para este cliente.";
    }

    if (resumoPedidos.concluidos >= 5 && resumoPedidos.taxaCancelamento <= 20) {
      return "Cliente com bom histórico de uso.";
    }

    return "";
  }, [resumoPedidos]);

  function formatarData(valor: any) {
    try {
      if (!valor) return "Não informado";
      const data =
        typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
      if (Number.isNaN(data.getTime())) return "Não informado";
      return data.toLocaleDateString("pt-BR");
    } catch {
      return "Não informado";
    }
  }

  async function abrirWhatsApp() {
    if (!cliente?.telefone) {
      Alert.alert("Contato indisponível", "Cliente sem telefone cadastrado.");
      return;
    }

    const telefone = String(cliente.telefone).replace(/\D/g, "");

    if (!telefone) {
      Alert.alert("Contato inválido", "Não foi possível abrir o WhatsApp.");
      return;
    }

    const url = `https://wa.me/55${telefone}`;

    try {
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.log("Erro ao abrir WhatsApp:", error);
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    }
  }

  function abrirPedidosCliente() {
    if (!cliente?.id) {
      Alert.alert("Erro", "Cliente não encontrado.");
      return;
    }

    router.push({
      pathname: "/admin/pedidos",
      params: { clienteId: cliente.id },
    });
  }

  function abrirPedidoAtivo() {
    if (!pedidoAtivo) {
      Alert.alert("Sem pedido ativo", "Esse cliente não possui pedido ativo agora.");
      return;
    }

    router.push({
      pathname: "/admin/pedido-detalhe",
      params: { id: pedidoAtivo.id },
    });
  }

  async function bloquearContaComMotivo(motivoBloqueio: string) {
    try {
      if (!cliente) return;

      setProcessando(true);

      const banirClienteAdmin = httpsCallable(functions, "banirClienteAdmin");

      await banirClienteAdmin({
        clienteId: cliente.id,
        motivo: motivoBloqueio,
      });

      Alert.alert("Sucesso", "Conta bloqueada.");
    } catch (error) {
      console.log("Erro ao bloquear cliente:", error);
      Alert.alert("Erro", "Não foi possível bloquear a conta.");
    } finally {
      setProcessando(false);
    }
  }

  function bloquearConta() {
    Alert.alert("Bloquear conta", "Escolha um motivo para o bloqueio.", [
      {
        text: "Cancelar",
        style: "cancel",
      },
      {
        text: "Denúncia / comportamento",
        onPress: () => bloquearContaComMotivo("Denúncia / comportamento"),
      },
      {
        text: "Suspeita de fraude",
        onPress: () => bloquearContaComMotivo("Suspeita de fraude"),
      },
      {
        text: "Descumprimento das regras",
        onPress: () =>
          bloquearContaComMotivo("Descumprimento das regras do app"),
      },
      {
        text: "Outro motivo administrativo",
        onPress: () => bloquearContaComMotivo("Outro motivo administrativo"),
      },
    ]);
  }

  async function desbloquearConta() {
    try {
      if (!cliente) return;

      setProcessando(true);

      const banirClienteAdmin = httpsCallable(functions, "banirClienteAdmin");

      await banirClienteAdmin({
        clienteId: cliente.id,
        desbloquear: true,
      });

      Alert.alert("Sucesso", "Conta desbloqueada.");
    } catch (error) {
      console.log("Erro ao desbloquear cliente:", error);
      Alert.alert("Erro", "Não foi possível desbloquear a conta.");
    } finally {
      setProcessando(false);
    }
  }

  function confirmarDesbloquearConta() {
    if (!cliente) return;

    Alert.alert(
      "Desbloquear conta",
      `Deseja realmente desbloquear ${cliente.nome || "este cliente"}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Desbloquear", onPress: desbloquearConta },
      ]
    );
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

  if (carregandoDados) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando cliente...</Text>
      </View>
    );
  }

  if (!cliente) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Cliente não encontrado.</Text>
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
          title={cliente.nome || "Cliente"}
          subtitle="Gerencie os dados e status da conta"
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

        {!!erroTela && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Atualização com falha</Text>
            <Text style={styles.errorText}>{erroTela}</Text>
          </View>
        )}

        {!!alertaComportamento && (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Alerta automático</Text>
            <Text style={styles.alertText}>{alertaComportamento}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informações básicas</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Nome: </Text>
            {cliente.nome || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Email: </Text>
            {cliente.email || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Telefone: </Text>
            {cliente.telefone || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Cidade: </Text>
            {cliente.cidade || "Não informada"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Criado em: </Text>
            {formatarData(cliente.criadoEm)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Atualizado em: </Text>
            {formatarData(cliente.atualizadoEm)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Resumo de pedidos</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBadgePrimary}>
              <Text style={styles.summaryBadgeText}>
                Total: {resumoPedidos.total}
              </Text>
            </View>

            <View style={styles.summaryBadgeWarning}>
              <Text style={styles.summaryBadgeText}>
                Ativos: {resumoPedidos.ativos}
              </Text>
            </View>

            <View style={styles.summaryBadgeSuccess}>
              <Text style={styles.summaryBadgeText}>
                Concluídos: {resumoPedidos.concluidos}
              </Text>
            </View>

            <View style={styles.summaryBadgeDanger}>
              <Text style={styles.summaryBadgeText}>
                Cancelados: {resumoPedidos.cancelados}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBadgeNeutral}>
              <Text style={styles.summaryBadgeTextDark}>
                Taxa cancelamento: {resumoPedidos.taxaCancelamento}%
              </Text>
            </View>

            <View style={styles.summaryBadgeNeutral}>
              <Text style={styles.summaryBadgeTextDark}>
                Score: {resumoPedidos.score}
              </Text>
            </View>
          </View>

          <View style={styles.buttonGap}>
            <ActionButton
              title="VER PEDIDOS DO CLIENTE"
              onPress={abrirPedidosCliente}
              variant="neutral"
            />
          </View>

          {!!pedidoAtivo && (
            <View style={styles.buttonGap}>
              <ActionButton
                title="ABRIR PEDIDO ATIVO"
                onPress={abrirPedidoAtivo}
                variant="primary"
              />
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ações rápidas</Text>

          <View style={styles.buttonGap}>
            <ActionButton
              title="ABRIR WHATSAPP"
              onPress={abrirWhatsApp}
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Histórico visual</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Última atualização: </Text>
            {formatarData(cliente.atualizadoEm)}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Situação atual: </Text>
            {cliente.bloqueado ? "Conta bloqueada" : "Conta ativa"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Motivo atual: </Text>
            {cliente.motivoBloqueio || "Sem motivo registrado"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status da conta</Text>

          <View style={styles.badgesRow}>
            <View
              style={[
                styles.badge,
                cliente.bloqueado ? styles.badgeDanger : styles.badgeSuccess,
              ]}
            >
              <Text style={styles.badgeText}>
                {cliente.bloqueado ? "BLOQUEADO" : "ATIVO"}
              </Text>
            </View>
          </View>

          {!!cliente.bloqueado && !!cliente.motivoBloqueio && (
            <View style={styles.motivoBox}>
              <Text style={styles.motivoTitle}>Motivo do bloqueio</Text>
              <Text style={styles.motivoText}>{cliente.motivoBloqueio}</Text>
            </View>
          )}

          {!cliente.bloqueado ? (
            <View style={styles.buttonGap}>
              <ActionButton
                title={processando ? "PROCESSANDO..." : "BLOQUEAR CONTA"}
                onPress={bloquearConta}
                variant="danger"
                disabled={processando}
              />
            </View>
          ) : (
            <View style={styles.buttonGap}>
              <ActionButton
                title={processando ? "PROCESSANDO..." : "DESBLOQUEAR CONTA"}
                onPress={confirmarDesbloquearConta}
                variant="success"
                disabled={processando}
              />
            </View>
          )}
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
      color: theme.colors.textMuted,
      fontSize: 15,
      marginTop: 12,
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

    alertCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      padding: 16,
      marginBottom: 16,
    },

    alertTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
    },

    alertText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 12,
    },

    infoLine: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 6,
    },

    infoLabel: {
      color: theme.colors.text,
      fontWeight: "700",
    },

    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },

    summaryBadgePrimary: {
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    summaryBadgeWarning: {
      backgroundColor: theme.colors.warning,
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
      fontSize: 11,
      fontWeight: "800",
    },

    summaryBadgeTextDark: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: "800",
    },

    badgesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 6,
    },

    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.border,
    },

    badgeSuccess: {
      backgroundColor: theme.colors.success,
    },

    badgeDanger: {
      backgroundColor: theme.colors.danger,
    },

    badgeText: {
      color: "#fff",
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

    buttonGap: {
      marginTop: 10,
    },
  });
}
