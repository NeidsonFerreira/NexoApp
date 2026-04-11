import { Redirect, router, useLocalSearchParams } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";
type VerificacaoStatus =
  | "nao_enviado"
  | "pendente"
  | "aprovado"
  | "rejeitado";

type ProfissionalDetalhe = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  servico?: string;
  descricao?: string;
  cidade?: string;
  tipoAtendimento?: "fixo" | "movel";
  endereco?: string;
  plano?: string;
  online?: boolean;
  bloqueado?: boolean;
  motivoBloqueio?: string;
  verificacaoStatus?: VerificacaoStatus;
  fotoPerfil?: string;
};

export default function AdminProfissionalDetalhe() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const params = useLocalSearchParams<{ id?: string }>();

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [profissional, setProfissional] = useState<ProfissionalDetalhe | null>(
    null
  );

  useEffect(() => {
    let ativo = true;

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

        if (!params.id || typeof params.id !== "string") {
          Alert.alert("Erro", "ID do profissional não encontrado.");
          if (ativo) setCarregandoDados(false);
          return;
        }

        const snapProf = await getDoc(doc(db, "users", params.id));

        if (!snapProf.exists()) {
          Alert.alert("Erro", "Profissional não encontrado.");
          if (ativo) setCarregandoDados(false);
          return;
        }

        const dadosProf = snapProf.data() as any;

        if (ativo) {
          setProfissional({
            id: snapProf.id,
            nome: dadosProf.nome || "",
            email: dadosProf.email || "",
            telefone: dadosProf.telefone || "",
            servico: dadosProf.servico || "",
            descricao: dadosProf.descricao || "",
            cidade: dadosProf.cidade || "",
            tipoAtendimento: dadosProf.tipoAtendimento || "fixo",
            endereco: dadosProf.endereco || "",
            plano: dadosProf.plano || "gratuito",
            online: dadosProf.online === true,
            bloqueado: dadosProf.bloqueado === true,
            motivoBloqueio: dadosProf.motivoBloqueio || "",
            verificacaoStatus:
              (dadosProf.verificacaoStatus as VerificacaoStatus) ||
              "nao_enviado",
            fotoPerfil: dadosProf.fotoPerfil || "",
          });
          setCarregandoDados(false);
        }
      } catch (error) {
        console.log("Erro ao carregar profissional:", error);
        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoDados(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
    };
  }, [params.id]);

  async function atualizarPlano(plano: "gratuito" | "mensal" | "turbo") {
    try {
      if (!profissional) return;

      setProcessando(true);

      await updateDoc(doc(db, "users", profissional.id), {
        plano,
      });

      setProfissional((prev) => (prev ? { ...prev, plano } : prev));

      Alert.alert("Sucesso", `Plano alterado para ${textoPlano(plano)}.`);
    } catch (error) {
      console.log("Erro ao atualizar plano:", error);
      Alert.alert("Erro", "Não foi possível atualizar o plano.");
    } finally {
      setProcessando(false);
    }
  }

  async function forcarOffline() {
    try {
      if (!profissional) return;

      setProcessando(true);

      await updateDoc(doc(db, "users", profissional.id), {
        online: false,
        latitude: null,
        longitude: null,
      });

      setProfissional((prev) => (prev ? { ...prev, online: false } : prev));

      Alert.alert("Sucesso", "Profissional colocado offline.");
    } catch (error) {
      console.log("Erro ao forçar offline:", error);
      Alert.alert("Erro", "Não foi possível colocar offline.");
    } finally {
      setProcessando(false);
    }
  }

  function confirmarForcarOffline() {
    if (!profissional) return;

    Alert.alert(
      "Forçar offline",
      `Deseja realmente colocar ${profissional.nome || "este profissional"} offline?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Confirmar", onPress: forcarOffline },
      ]
    );
  }

  async function bloquearContaComMotivo(motivoBloqueio: string) {
    try {
      if (!profissional) return;

      setProcessando(true);

      await updateDoc(doc(db, "users", profissional.id), {
        bloqueado: true,
        motivoBloqueio,
        online: false,
        latitude: null,
        longitude: null,
      });

      setProfissional((prev) =>
        prev
          ? {
              ...prev,
              bloqueado: true,
              motivoBloqueio,
              online: false,
            }
          : prev
      );

      Alert.alert("Sucesso", "Conta bloqueada.");
    } catch (error) {
      console.log("Erro ao bloquear conta:", error);
      Alert.alert("Erro", "Não foi possível bloquear a conta.");
    } finally {
      setProcessando(false);
    }
  }

  function bloquearConta() {
    Alert.alert(
      "Bloquear conta",
      "Escolha um motivo para o bloqueio.",
      [
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
      ]
    );
  }

  async function desbloquearConta() {
    try {
      if (!profissional) return;

      setProcessando(true);

      await updateDoc(doc(db, "users", profissional.id), {
        bloqueado: false,
        motivoBloqueio: "",
      });

      setProfissional((prev) =>
        prev
          ? {
              ...prev,
              bloqueado: false,
              motivoBloqueio: "",
            }
          : prev
      );

      Alert.alert("Sucesso", "Conta desbloqueada.");
    } catch (error) {
      console.log("Erro ao desbloquear conta:", error);
      Alert.alert("Erro", "Não foi possível desbloquear a conta.");
    } finally {
      setProcessando(false);
    }
  }

  function confirmarDesbloquearConta() {
    if (!profissional) return;

    Alert.alert(
      "Desbloquear conta",
      `Deseja realmente desbloquear ${profissional.nome || "este profissional"}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Desbloquear", onPress: desbloquearConta },
      ]
    );
  }

  function abrirDocumentos() {
    if (!profissional) return;

    router.push({
      pathname: "/admin/documentos-profissional",
      params: { id: profissional.id },
    });
  }

  function abrirAnalise() {
    if (!profissional) return;

    router.push({
      pathname: "/admin/documentos-profissional",
      params: { id: profissional.id },
    });
  }

  function textoPlano(plano?: string) {
    if (!plano || plano === "gratuito") return "GRATUITO";
    if (plano === "mensal") return "MENSAL";
    if (plano === "turbo") return "TURBO";
    return String(plano).toUpperCase();
  }

  function textoVerificacao(status?: VerificacaoStatus) {
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

  if (carregandoDados) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando profissional...</Text>
      </View>
    );
  }

  if (!profissional) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Profissional não encontrado.</Text>
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
          title={profissional.nome || "Profissional"}
          subtitle="Gerencie os dados e status da conta"
          showBackButton
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informações básicas</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Serviço: </Text>
            {profissional.servico || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Cidade: </Text>
            {profissional.cidade || "Não informada"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Email: </Text>
            {profissional.email || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Telefone: </Text>
            {profissional.telefone || "Não informado"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Atendimento: </Text>
            {profissional.tipoAtendimento === "movel" ? "Móvel" : "Fixo"}
          </Text>

          {!!profissional.endereco && (
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>Endereço: </Text>
              {profissional.endereco}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status da conta</Text>

          <View style={styles.badgesRow}>
            <View style={[styles.badge, styles.badgePlano]}>
              <Text style={styles.badgeText}>
                Plano: {textoPlano(profissional.plano)}
              </Text>
            </View>

            <View
              style={[
                styles.badge,
                profissional.verificacaoStatus === "aprovado" &&
                  styles.badgeSuccess,
                profissional.verificacaoStatus === "pendente" &&
                  styles.badgeWarning,
                profissional.verificacaoStatus === "rejeitado" &&
                  styles.badgeDanger,
                profissional.verificacaoStatus === "nao_enviado" &&
                  styles.badgeNeutral,
              ]}
            >
              <Text style={styles.badgeText}>
                {textoVerificacao(profissional.verificacaoStatus)}
              </Text>
            </View>

            <View
              style={[
                styles.badge,
                profissional.online ? styles.badgeSuccess : styles.badgeNeutral,
              ]}
            >
              <Text style={styles.badgeText}>
                {profissional.online ? "ONLINE" : "OFFLINE"}
              </Text>
            </View>

            <View
              style={[
                styles.badge,
                profissional.bloqueado ? styles.badgeDanger : styles.badgeSuccess,
              ]}
            >
              <Text style={styles.badgeText}>
                {profissional.bloqueado ? "BLOQUEADO" : "ATIVO"}
              </Text>
            </View>
          </View>

          {!!profissional.bloqueado && !!profissional.motivoBloqueio && (
            <View style={styles.motivoBox}>
              <Text style={styles.motivoTitle}>Motivo do bloqueio</Text>
              <Text style={styles.motivoText}>
                {profissional.motivoBloqueio}
              </Text>
            </View>
          )}

          <View style={styles.buttonGap}>
            <ActionButton
              title="VER DOCUMENTOS"
              onPress={abrirDocumentos}
              variant="neutral"
              disabled={processando}
            />
          </View>

          {profissional.verificacaoStatus === "pendente" && (
            <View style={styles.buttonGap}>
              <ActionButton
                title="ANALISAR VERIFICAÇÃO"
                onPress={abrirAnalise}
                variant="warning"
                disabled={processando}
              />
            </View>
          )}

          {profissional.online && (
            <View style={styles.buttonGap}>
              <ActionButton
                title={processando ? "PROCESSANDO..." : "FORÇAR OFFLINE"}
                onPress={confirmarForcarOffline}
                variant="warning"
                disabled={processando}
              />
            </View>
          )}

          {!profissional.bloqueado ? (
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Plano do profissional</Text>

          <View style={styles.buttonGap}>
            <ActionButton
              title={
                processando
                  ? "PROCESSANDO..."
                  : profissional.plano === "gratuito"
                  ? "PLANO GRATUITO (ATUAL)"
                  : "MUDAR PARA GRATUITO"
              }
              onPress={() => atualizarPlano("gratuito")}
              variant="neutral"
              disabled={processando || profissional.plano === "gratuito"}
            />
          </View>

          <View style={styles.buttonGap}>
            <ActionButton
              title={
                processando
                  ? "PROCESSANDO..."
                  : profissional.plano === "mensal"
                  ? "PLANO MENSAL (ATUAL)"
                  : "MUDAR PARA MENSAL"
              }
              onPress={() => atualizarPlano("mensal")}
              variant="primary"
              disabled={processando || profissional.plano === "mensal"}
            />
          </View>

          <View style={styles.buttonGap}>
            <ActionButton
              title={
                processando
                  ? "PROCESSANDO..."
                  : profissional.plano === "turbo"
                  ? "PLANO TURBO (ATUAL)"
                  : "MUDAR PARA TURBO"
              }
              onPress={() => atualizarPlano("turbo")}
              variant="warning"
              disabled={processando || profissional.plano === "turbo"}
            />
          </View>
        </View>

        {!!profissional.descricao && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Descrição</Text>
            <Text style={styles.descricao}>{profissional.descricao}</Text>
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
      color: theme.colors.textMuted,
      fontSize: 15,
      marginTop: 12,
      textAlign: "center",
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

    badgePlano: {
      backgroundColor: theme.colors.primary,
    },

    badgeSuccess: {
      backgroundColor: theme.colors.success,
    },

    badgeWarning: {
      backgroundColor: theme.colors.warning,
    },

    badgeDanger: {
      backgroundColor: theme.colors.danger,
    },

    badgeNeutral: {
      backgroundColor: theme.colors.border,
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

    descricao: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
    },
  });
}