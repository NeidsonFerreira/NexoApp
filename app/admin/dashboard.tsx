import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";

type UserItem = {
  id: string;
  tipo?: string;
  plano?: "gratuito" | "mensal" | "turbo";
  online?: boolean;
  bloqueado?: boolean;
  verificacaoStatus?: string;
};

type PedidoStatus =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado";

type PedidoItem = {
  id: string;
  status?: PedidoStatus;
};

type SuporteItem = {
  id: string;
  status?: "aberto" | "fechado";
};

type ConfigApp = {
  precoPlanoMensal?: number;
  precoPlanoTurbo?: number;
  appEmManutencao?: boolean;
  avisoGlobal?: string;
};

function pedidoAtivo(status?: PedidoStatus) {
  return (
    status === "aceito" ||
    status === "a_caminho" ||
    status === "chegou" ||
    status === "cliente_a_caminho" ||
    status === "cliente_chegou"
  );
}

export default function AdminDashboard() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pedidos, setPedidos] = useState<PedidoItem[]>([]);
  const [suportes, setSuportes] = useState<SuporteItem[]>([]);
  const [config, setConfig] = useState<ConfigApp>({
    precoPlanoMensal: 19.9,
    precoPlanoTurbo: 49.9,
    appEmManutencao: false,
    avisoGlobal: "",
  });
  const [carregandoDados, setCarregandoDados] = useState(true);

  useEffect(() => {
    let ativo = true;
    let unsubscribeUsers: (() => void) | undefined;
    let unsubscribePedidos: (() => void) | undefined;
    let unsubscribeSuportes: (() => void) | undefined;

    let usersLoaded = false;
    let pedidosLoaded = false;
    let suportesLoaded = false;

    function verificarFimCarregamento() {
      if (!ativo) return;

      if (usersLoaded && pedidosLoaded && suportesLoaded) {
        setCarregandoDados(false);
      }
    }

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

        const snapConfig = await getDoc(doc(db, "configuracoes", "app"));

        if (snapConfig.exists() && ativo) {
          const dadosConfig = snapConfig.data() as ConfigApp;

          setConfig({
            precoPlanoMensal: dadosConfig.precoPlanoMensal ?? 19.9,
            precoPlanoTurbo: dadosConfig.precoPlanoTurbo ?? 49.9,
            appEmManutencao: dadosConfig.appEmManutencao === true,
            avisoGlobal: dadosConfig.avisoGlobal || "",
          });
        }

        unsubscribeUsers = onSnapshot(
          collection(db, "users"),
          (snapshot) => {
            const lista = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }));

            if (ativo) {
              setUsers(lista);
            }

            usersLoaded = true;
            verificarFimCarregamento();
          },
          (error) => {
            console.log("Erro ao carregar users do dashboard:", error);
            usersLoaded = true;
            verificarFimCarregamento();
          }
        );

        unsubscribePedidos = onSnapshot(
          collection(db, "pedidos"),
          (snapshot) => {
            const lista = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }));

            if (ativo) {
              setPedidos(lista);
            }

            pedidosLoaded = true;
            verificarFimCarregamento();
          },
          (error) => {
            console.log("Erro ao carregar pedidos do dashboard:", error);
            pedidosLoaded = true;
            verificarFimCarregamento();
          }
        );

        unsubscribeSuportes = onSnapshot(
          collection(db, "suporte_chats"),
          (snapshot) => {
            const lista = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }));

            if (ativo) {
              setSuportes(lista);
            }

            suportesLoaded = true;
            verificarFimCarregamento();
          },
          (error) => {
            console.log("Erro ao carregar suportes do dashboard:", error);
            suportesLoaded = true;
            verificarFimCarregamento();
          }
        );
      } catch (error) {
        console.log("Erro ao carregar dashboard admin:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoDados(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeUsers) unsubscribeUsers();
      if (unsubscribePedidos) unsubscribePedidos();
      if (unsubscribeSuportes) unsubscribeSuportes();
    };
  }, []);

  const clientes = useMemo(
    () => users.filter((u) => u.tipo === "cliente"),
    [users]
  );

  const profissionais = useMemo(
    () => users.filter((u) => u.tipo === "profissional"),
    [users]
  );

  const admins = useMemo(
    () => users.filter((u) => u.tipo === "admin"),
    [users]
  );

  const clientesBloqueados = useMemo(
    () => clientes.filter((u) => u.bloqueado === true),
    [clientes]
  );

  const profissionaisBloqueados = useMemo(
    () => profissionais.filter((u) => u.bloqueado === true),
    [profissionais]
  );

  const profissionaisOnline = useMemo(
    () => profissionais.filter((u) => u.online === true),
    [profissionais]
  );

  const verificacoesPendentes = useMemo(
    () => profissionais.filter((u) => u.verificacaoStatus === "pendente"),
    [profissionais]
  );

  const pedidosAtivos = useMemo(
    () => pedidos.filter((p) => pedidoAtivo(p.status)),
    [pedidos]
  );

  const pedidosPendentes = useMemo(
    () => pedidos.filter((p) => p.status === "pendente"),
    [pedidos]
  );

  const pedidosConcluidos = useMemo(
    () => pedidos.filter((p) => p.status === "concluido"),
    [pedidos]
  );

  const pedidosRecusados = useMemo(
    () => pedidos.filter((p) => p.status === "recusado"),
    [pedidos]
  );

  const suportesAbertos = useMemo(
    () => suportes.filter((s) => s.status === "aberto"),
    [suportes]
  );

  const gratuitos = useMemo(
    () => profissionais.filter((u) => (u.plano || "gratuito") === "gratuito"),
    [profissionais]
  );

  const mensais = useMemo(
    () => profissionais.filter((u) => u.plano === "mensal"),
    [profissionais]
  );

  const turbo = useMemo(
    () => profissionais.filter((u) => u.plano === "turbo"),
    [profissionais]
  );

  const precoMensal = config.precoPlanoMensal ?? 19.9;
  const precoTurbo = config.precoPlanoTurbo ?? 49.9;

  const faturamentoEstimado = useMemo(() => {
    return mensais.length * precoMensal + turbo.length * precoTurbo;
  }, [mensais.length, turbo.length, precoMensal, precoTurbo]);

  function abrirVerificacoes() {
    router.push("/admin/verificacoes");
  }

  function abrirProfissionais() {
    router.push("/admin/profissionais");
  }

  function abrirClientes() {
    router.push("/admin/clientes");
  }

  function abrirPedidos() {
    router.push("/admin/pedidos");
  }

  function abrirSuporte() {
    router.push("/admin/suporte");
  }

  function abrirPlanos() {
    router.push("/admin/planos");
  }

  function abrirConfiguracoes() {
    router.push("/admin/configuracoes");
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
        <Text style={styles.loadingText}>Carregando dashboard...</Text>
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
          title="Dashboard Admin"
          subtitle="Visão geral do Nexo"
          showBackButton
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Resumo rápido</Text>
          <Text style={styles.heroText}>
            Acompanhe usuários, pedidos, suporte e faturamento estimado.
          </Text>
        </View>

        {!!config.avisoGlobal?.trim() && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Aviso global</Text>
            <Text style={styles.noticeText}>{config.avisoGlobal.trim()}</Text>
          </View>
        )}

        <View style={styles.alertRow}>
          <View style={styles.alertWarning}>
            <Text style={styles.alertTitle}>Verificações pendentes</Text>
            <Text style={styles.alertNumber}>{verificacoesPendentes.length}</Text>
          </View>

          <View style={styles.alertPrimary}>
            <Text style={styles.alertTitle}>Suportes abertos</Text>
            <Text style={styles.alertNumber}>{suportesAbertos.length}</Text>
          </View>
        </View>

        <View style={styles.alertRow}>
          <View
            style={[
              styles.alertMaintenance,
              config.appEmManutencao && styles.alertMaintenanceActive,
            ]}
          >
            <Text style={styles.alertTitle}>Modo manutenção</Text>
            <Text style={styles.alertNumber}>
              {config.appEmManutencao ? "ON" : "OFF"}
            </Text>
          </View>

          <View style={styles.alertSuccess}>
            <Text style={styles.alertTitle}>Profissionais online</Text>
            <Text style={styles.alertNumber}>{profissionaisOnline.length}</Text>
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{users.length}</Text>
            <Text style={styles.metricLabel}>Usuários totais</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{profissionais.length}</Text>
            <Text style={styles.metricLabel}>Profissionais</Text>
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{clientes.length}</Text>
            <Text style={styles.metricLabel}>Clientes</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{admins.length}</Text>
            <Text style={styles.metricLabel}>Admins</Text>
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.metricCardWarning}>
            <Text style={styles.metricNumber}>{verificacoesPendentes.length}</Text>
            <Text style={styles.metricLabel}>Verificações pendentes</Text>
          </View>

          <View style={styles.metricCardSuccess}>
            <Text style={styles.metricNumber}>{profissionaisOnline.length}</Text>
            <Text style={styles.metricLabel}>Profissionais online</Text>
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.metricCardDanger}>
            <Text style={styles.metricNumber}>
              {profissionaisBloqueados.length}
            </Text>
            <Text style={styles.metricLabel}>Profissionais bloqueados</Text>
          </View>

          <View style={styles.metricCardDanger}>
            <Text style={styles.metricNumber}>{clientesBloqueados.length}</Text>
            <Text style={styles.metricLabel}>Clientes bloqueados</Text>
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.metricCardPrimary}>
            <Text style={styles.metricNumber}>{pedidosAtivos.length}</Text>
            <Text style={styles.metricLabel}>Pedidos ativos</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{pedidosPendentes.length}</Text>
            <Text style={styles.metricLabel}>Pedidos pendentes</Text>
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.metricCardSuccess}>
            <Text style={styles.metricNumber}>{pedidosConcluidos.length}</Text>
            <Text style={styles.metricLabel}>Pedidos concluídos</Text>
          </View>

          <View style={styles.metricCardDanger}>
            <Text style={styles.metricNumber}>{pedidosRecusados.length}</Text>
            <Text style={styles.metricLabel}>Pedidos recusados</Text>
          </View>
        </View>

        <View style={styles.faturamentoCard}>
          <Text style={styles.faturamentoTitle}>Faturamento estimado mensal</Text>
          <Text style={styles.faturamentoValue}>
            R$ {faturamentoEstimado.toFixed(2).replace(".", ",")}
          </Text>
          <Text style={styles.faturamentoText}>
            Mensal: {mensais.length} × R$ {precoMensal.toFixed(2).replace(".", ",")}
            {"\n"}
            Turbo: {turbo.length} × R$ {precoTurbo.toFixed(2).replace(".", ",")}
          </Text>
        </View>

        <View style={styles.planosCard}>
          <Text style={styles.sectionTitle}>Distribuição de planos</Text>

          <View style={styles.planRow}>
            <View style={styles.planBadgeNeutral}>
              <Text style={styles.planBadgeText}>Gratuito: {gratuitos.length}</Text>
            </View>

            <View style={styles.planBadgePrimary}>
              <Text style={styles.planBadgeText}>Mensal: {mensais.length}</Text>
            </View>

            <View style={styles.planBadgeWarning}>
              <Text style={styles.planBadgeText}>Turbo: {turbo.length}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Acessos rápidos</Text>

        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickCard} onPress={abrirVerificacoes}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Verificações</Text>
            <Text style={styles.quickSubtitle}>Analisar documentos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={abrirProfissionais}>
            <Ionicons
              name="people-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Profissionais</Text>
            <Text style={styles.quickSubtitle}>Gerenciar contas</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={abrirClientes}>
            <Ionicons
              name="person-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Clientes</Text>
            <Text style={styles.quickSubtitle}>Ver usuários</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={abrirPedidos}>
            <Ionicons
              name="receipt-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Pedidos</Text>
            <Text style={styles.quickSubtitle}>Acompanhar fluxo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={abrirPlanos}>
            <Ionicons
              name="card-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Planos</Text>
            <Text style={styles.quickSubtitle}>Gerenciar monetização</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={abrirSuporte}>
            <Ionicons
              name="chatbubbles-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Suporte</Text>
            <Text style={styles.quickSubtitle}>Abrir chats</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={abrirConfiguracoes}>
            <Ionicons
              name="settings-outline"
              size={22}
              color={theme.colors.text}
            />
            <Text style={styles.quickTitle}>Configurações</Text>
            <Text style={styles.quickSubtitle}>Ajustes gerais do app</Text>
          </TouchableOpacity>
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

    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },

    heroTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 6,
    },

    heroText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },

    noticeCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      padding: 16,
    },

    noticeTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 6,
    },

    noticeText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },

    alertRow: {
      flexDirection: "row",
      gap: 10,
    },

    alertWarning: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      borderRadius: 18,
      padding: 16,
    },

    alertPrimary: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: 18,
      padding: 16,
    },

    alertSuccess: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: 18,
      padding: 16,
    },

    alertMaintenance: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      padding: 16,
    },

    alertMaintenanceActive: {
      borderColor: theme.colors.warning,
    },

    alertTitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginBottom: 6,
    },

    alertNumber: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "bold",
    },

    grid2: {
      flexDirection: "row",
      gap: 10,
    },

    metricCard: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },

    metricCardPrimary: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },

    metricCardSuccess: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },

    metricCardWarning: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
    },

    metricCardDanger: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: 18,
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

    faturamentoCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.success,
      padding: 16,
    },

    faturamentoTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 8,
    },

    faturamentoValue: {
      color: theme.colors.success,
      fontSize: 28,
      fontWeight: "bold",
      marginBottom: 8,
    },

    faturamentoText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },

    planosCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },

    sectionTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "bold",
      marginBottom: 10,
    },

    planRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    planBadgeNeutral: {
      backgroundColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },

    planBadgePrimary: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },

    planBadgeWarning: {
      backgroundColor: theme.colors.warning,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },

    planBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "bold",
    },

    quickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    quickCard: {
      width: "48%",
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      padding: 16,
      gap: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.14 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    quickTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "bold",
    },

    quickSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
  });
}