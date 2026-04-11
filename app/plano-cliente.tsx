import { router } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { OfflineBanner } from "../components/OfflineBanner";
import { handleError } from "../lib/errorHandler";
import { auth, db } from "../lib/firebase";

type PlanoCliente = "gratuito" | "premium";

type DadosCliente = {
  nome?: string;
  planoCliente?: PlanoCliente;
};

export default function PlanoClienteScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [planoAtual, setPlanoAtual] = useState<PlanoCliente>("gratuito");

  useEffect(() => {
    carregarPlano();
  }, []);

  async function carregarPlano() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));

      if (!snap.exists()) {
        setNomeCliente("Cliente");
        setPlanoAtual("gratuito");
        return;
      }

      const dados = snap.data() as DadosCliente;

      setNomeCliente(dados.nome || "Cliente");
      setPlanoAtual(
        String(dados.planoCliente || "gratuito").toLowerCase() === "premium"
          ? "premium"
          : "gratuito"
      );
    } catch (error) {
      handleError(error, "PlanoCliente.carregarPlano");
      Alert.alert("Erro", "Não foi possível carregar seu plano.");
    } finally {
      setCarregando(false);
    }
  }

  async function ativarPremiumFake() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      setProcessando(true);

      await updateDoc(doc(db, "users", user.uid), {
        planoCliente: "premium",
      });

      setPlanoAtual("premium");

      Alert.alert(
        "Premium ativado",
        "Seu plano premium foi ativado com sucesso. Agora você navega sem anúncios e usa o app com menos fricção."
      );
    } catch (error) {
      handleError(error, "PlanoCliente.ativarPremiumFake");
      Alert.alert("Erro", "Não foi possível ativar o premium agora.");
    } finally {
      setProcessando(false);
    }
  }

  async function voltarParaGratuito() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        router.replace("/entrada");
        return;
      }

      setProcessando(true);

      await updateDoc(doc(db, "users", user.uid), {
        planoCliente: "gratuito",
      });

      setPlanoAtual("gratuito");

      Alert.alert(
        "Plano atualizado",
        "Sua conta voltou para o plano gratuito."
      );
    } catch (error) {
      handleError(error, "PlanoCliente.voltarParaGratuito");
      Alert.alert("Erro", "Não foi possível atualizar seu plano agora.");
    } finally {
      setProcessando(false);
    }
  }

  const premiumAtivo = planoAtual === "premium";

  const resumoUso = useMemo(() => {
    if (premiumAtivo) {
      return {
        icone: "diamond-outline" as const,
        cor: theme.colors.success,
        titulo: "Você está no Premium",
        texto: "Use o app sem anúncios e com uma experiência mais limpa.",
      };
    }

    return {
      icone: "card-outline" as const,
      cor: theme.colors.warning,
      titulo: `Olá, ${nomeCliente || "Cliente"}`,
      texto: "Você está no plano gratuito. Faça upgrade para navegar sem anúncios.",
    };
  }, [premiumAtivo, nomeCliente, theme.colors.success, theme.colors.warning]);

  if (carregando) {
    return (
      <ScreenContainer scroll={false}>
        <OfflineBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando plano...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader
        title="Plano do Cliente"
        subtitle="Escolha como você quer usar o Nexo"
        showBackButton
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Ionicons
              name={resumoUso.icone}
              size={22}
              color={resumoUso.cor}
            />
            <Text style={styles.heroTitle}>{resumoUso.titulo}</Text>
          </View>

          <Text style={styles.heroText}>{resumoUso.texto}</Text>

          <View style={styles.heroStatusRow}>
            <View style={styles.heroStatusPill}>
              <Text style={styles.heroStatusLabel}>Plano atual</Text>
              <Text
                style={
                  premiumAtivo
                    ? styles.planoAtualPremium
                    : styles.planoAtualGratuito
                }
              >
                {planoAtual}
              </Text>
            </View>

            <View style={styles.heroStatusPill}>
              <Text style={styles.heroStatusLabel}>Experiência</Text>
              <Text style={styles.heroStatusValue}>
                {premiumAtivo ? "Sem anúncios" : "Com anúncios"}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.cardPlano,
            planoAtual === "gratuito" && styles.cardPlanoAtivo,
          ]}
        >
          <View style={styles.topoPlano}>
            <View style={styles.tituloPlanoWrap}>
              <Ionicons
                name="flash-outline"
                size={20}
                color={theme.colors.warning}
              />
              <Text style={styles.tituloPlano}>Plano Gratuito</Text>
            </View>

            <View style={[styles.badgePlano, styles.badgeGratuito]}>
              <Text style={[styles.badgePlanoTexto, styles.badgeGratuitoTexto]}>
                {planoAtual === "gratuito" ? "ATUAL" : "DISPONÍVEL"}
              </Text>
            </View>
          </View>

          <Text style={styles.descricaoPlano}>
            Ideal para começar a usar o app sem custo.
          </Text>

          <View style={styles.listaBeneficios}>
            <Text style={styles.beneficioItem}>✅ Buscar profissionais</Text>
            <Text style={styles.beneficioItem}>✅ Fazer pedidos</Text>
            <Text style={styles.beneficioItem}>✅ Usar mapa e atendimento</Text>
            <Text style={styles.beneficioItem}>✅ Liberação diária do WhatsApp</Text>
            <Text style={styles.beneficioItem}>❌ Navegação sem anúncios</Text>
            <Text style={styles.beneficioItem}>❌ WhatsApp sem limite</Text>
          </View>

          <View style={styles.precoWrap}>
            <Text style={styles.precoPlanoGratis}>R$ 0,00</Text>
            <Text style={styles.precoSubtexto}>para sempre</Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title={
                processando
                  ? "PROCESSANDO..."
                  : planoAtual === "gratuito"
                  ? "PLANO ATUAL"
                  : "VOLTAR PARA GRATUITO"
              }
              onPress={voltarParaGratuito}
              variant="neutral"
              disabled={processando || planoAtual === "gratuito"}
            />
          </View>
        </View>

        <View
          style={[
            styles.cardPlano,
            styles.cardPlanoPremium,
            planoAtual === "premium" && styles.cardPlanoAtivoPremium,
          ]}
        >
          <View style={styles.topoPlano}>
            <View style={styles.tituloPlanoWrap}>
              <Ionicons
                name="diamond-outline"
                size={20}
                color={theme.colors.success}
              />
              <Text style={[styles.tituloPlano, styles.tituloPlanoPremium]}>
                Plano Premium
              </Text>
            </View>

            <View style={[styles.badgePlano, styles.badgePremium]}>
              <Text style={[styles.badgePlanoTexto, styles.badgePremiumTexto]}>
                {planoAtual === "premium" ? "ATIVO" : "MAIS VANTAJOSO"}
              </Text>
            </View>
          </View>

          <Text style={styles.descricaoPlano}>
            Para quem quer usar o app com mais conforto e menos fricção.
          </Text>

          <View style={styles.listaBeneficios}>
            <Text style={styles.beneficioItem}>✅ Buscar profissionais</Text>
            <Text style={styles.beneficioItem}>✅ Fazer pedidos</Text>
            <Text style={styles.beneficioItem}>✅ Usar mapa e atendimento</Text>
            <Text style={styles.beneficioItem}>✅ Navegação sem anúncios</Text>
            <Text style={styles.beneficioItem}>✅ WhatsApp direto sem limite diário</Text>
            <Text style={styles.beneficioItem}>✅ Experiência mais limpa e rápida</Text>
          </View>

          <View style={styles.precoWrap}>
            <Text style={styles.precoPlanoPremium}>R$ 9,90</Text>
            <Text style={styles.precoSubtexto}>por mês</Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title={
                processando
                  ? "PROCESSANDO..."
                  : planoAtual === "premium"
                  ? "PLANO ATIVO"
                  : "ATIVAR PREMIUM"
              }
              onPress={ativarPremiumFake}
              variant="success"
              disabled={processando || planoAtual === "premium"}
            />
          </View>
        </View>

        <View style={styles.compareCard}>
          <Text style={styles.compareTitle}>Resumo rápido</Text>
          <Text style={styles.compareText}>
            O plano premium é o ideal para quem usa o app com frequência e quer
            menos interrupção, mais agilidade e acesso mais direto aos profissionais.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Importante</Text>
          <Text style={styles.infoText}>
            Por enquanto, essa tela troca o plano direto no banco só para teste.
            Depois a gente conecta com pagamento real e trava essa mudança via backend.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    content: {
      paddingBottom: 40,
    },
    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      color: theme.colors.text,
      marginTop: 12,
      fontSize: 16,
    },
    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.xl,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 18,
      ...(theme.shadow?.card || {}),
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "bold",
      flex: 1,
    },
    heroText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 14,
    },
    heroStatusRow: {
      gap: 10,
    },
    heroStatusPill: {
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
    },
    heroStatusLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
      textTransform: "uppercase",
    },
    heroStatusValue: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "bold",
      textTransform: "capitalize",
    },
    planoAtualPremium: {
      color: theme.colors.success,
      fontWeight: "bold",
      fontSize: 15,
      textTransform: "capitalize",
    },
    planoAtualGratuito: {
      color: theme.colors.warning,
      fontWeight: "bold",
      fontSize: 15,
      textTransform: "capitalize",
    },
    cardPlano: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.xl,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 18,
      ...(theme.shadow?.card || {}),
    },
    cardPlanoPremium: {
      borderColor: theme.colors.success,
    },
    cardPlanoAtivo: {
      borderColor: theme.colors.warning,
    },
    cardPlanoAtivoPremium: {
      borderColor: theme.colors.success,
    },
    topoPlano: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    tituloPlanoWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    tituloPlano: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "bold",
    },
    tituloPlanoPremium: {
      color: theme.colors.success,
    },
    badgePlano: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },
    badgeGratuito: {
      backgroundColor: "rgba(245,158,11,0.12)",
      borderColor: theme.colors.warning,
    },
    badgePremium: {
      backgroundColor: "rgba(34,197,94,0.12)",
      borderColor: theme.colors.success,
    },
    badgePlanoTexto: {
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    badgeGratuitoTexto: {
      color: theme.colors.warning,
    },
    badgePremiumTexto: {
      color: theme.colors.success,
    },
    descricaoPlano: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 14,
    },
    listaBeneficios: {
      gap: 8,
      marginBottom: 16,
    },
    beneficioItem: {
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 21,
    },
    precoWrap: {
      marginBottom: 6,
    },
    precoPlanoGratis: {
      color: theme.colors.warning,
      fontSize: 28,
      fontWeight: "bold",
    },
    precoPlanoPremium: {
      color: theme.colors.success,
      fontSize: 28,
      fontWeight: "bold",
    },
    precoSubtexto: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    buttonTop: {
      marginTop: 12,
    },
    compareCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 18,
      ...(theme.shadow?.card || {}),
    },
    compareTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 8,
    },
    compareText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
    },
    infoCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...(theme.shadow?.card || {}),
    },
    infoTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 8,
    },
    infoText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
    },
  });
}
