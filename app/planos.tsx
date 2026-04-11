import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db, functions } from "../lib/firebase";

type PlanoId = "gratuito" | "mensal" | "turbo";

type ConfigApp = {
  precoPlanoMensal?: number;
  precoPlanoTurbo?: number;
};

type AlterarPlanoResponse = {
  ok?: boolean;
  plano?: PlanoId;
  planoNovoTexto?: string;
  mensagem?: string;
};

type PlanoInfo = {
  id: PlanoId;
  titulo: string;
  preco: string;
  subtitulo: string;
  destaque?: string;
  descricao: string;
  beneficios: string[];
  buttonLabel: string;
  variant: "neutral" | "primary" | "warning";
};

const PLANOS_BASE: Omit<PlanoInfo, "preco">[] = [
  {
    id: "gratuito",
    titulo: "Plano Básico",
    subtitulo: "Para começar no app",
    descricao:
      "Ideal para entrar no Nexo e começar a receber pedidos, mas com visibilidade mais limitada.",
    beneficios: [
      "Perfil ativo no app",
      "Recebimento de pedidos",
      "Visibilidade básica",
      "Aparece abaixo dos planos pagos",
    ],
    buttonLabel: "Continuar no básico",
    variant: "neutral",
  },
  {
    id: "mensal",
    titulo: "Plano Destaque",
    subtitulo: "Mais visibilidade e mais chances de receber contatos",
    destaque: "MAIS USADO",
    descricao:
      "Perfeito para quem quer aparecer melhor para os clientes e aumentar as chances de fechar mais atendimentos.",
    beneficios: [
      "Aparece antes dos planos gratuitos",
      "Mais destaque na lista",
      "Mais visibilidade para clientes",
      "Melhor presença no mapa",
    ],
    buttonLabel: "Quero mais visibilidade",
    variant: "primary",
  },
  {
    id: "turbo",
    titulo: "Plano Turbo",
    subtitulo: "Máximo destaque para ficar à frente da concorrência",
    destaque: "MAIS RESULTADO",
    descricao:
      "Plano para quem quer prioridade máxima de exposição e quer dominar a vitrine do Nexo.",
    beneficios: [
      "Topo da lista com prioridade máxima",
      "Destaque visual no perfil",
      "Mais força na vitrine do app",
      "Maior exposição para clientes",
    ],
    buttonLabel: "Quero ficar no topo",
    variant: "warning",
  },
];

export default function Planos() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [carregando, setCarregando] = useState(false);
  const [carregandoPlanoAtual, setCarregandoPlanoAtual] = useState(true);
  const [planoAtual, setPlanoAtual] = useState<PlanoId | null>(null);
  const [planoProcessando, setPlanoProcessando] = useState<PlanoId | null>(
    null
  );
  const [precoMensal, setPrecoMensal] = useState(19.9);
  const [precoTurbo, setPrecoTurbo] = useState(49.9);

  const alterarPlanoProfissionalFn = httpsCallable<
    { plano: PlanoId },
    AlterarPlanoResponse
  >(functions, "alterarPlanoProfissional");

  useEffect(() => {
    carregarPlanoAtual();
  }, []);

  function formatarPreco(valor: number, gratis = false) {
    if (gratis) return "R$ 0";
    return `R$ ${valor.toFixed(2).replace(".", ",")}/mês`;
  }

  function normalizarPlano(valor: unknown): PlanoId {
    const plano = String(valor || "gratuito").toLowerCase();
    if (plano === "mensal" || plano === "turbo") return plano;
    return "gratuito";
  }

  const PLANOS: PlanoInfo[] = [
    { ...PLANOS_BASE[0], preco: formatarPreco(0, true) },
    { ...PLANOS_BASE[1], preco: formatarPreco(precoMensal) },
    { ...PLANOS_BASE[2], preco: formatarPreco(precoTurbo) },
  ];

  async function carregarPlanoAtual() {
    try {
      const user = auth.currentUser;

      if (!user) {
        setCarregandoPlanoAtual(false);
        return;
      }

      const [snapUser, snapConfig] = await Promise.all([
        getDoc(doc(db, "users", user.uid)),
        getDoc(doc(db, "configuracoes", "app")),
      ]);

      if (snapConfig.exists()) {
        const dadosConfig = snapConfig.data() as ConfigApp;

        setPrecoMensal(
          typeof dadosConfig.precoPlanoMensal === "number"
            ? dadosConfig.precoPlanoMensal
            : 19.9
        );

        setPrecoTurbo(
          typeof dadosConfig.precoPlanoTurbo === "number"
            ? dadosConfig.precoPlanoTurbo
            : 49.9
        );
      }

      if (snapUser.exists()) {
        const dados = snapUser.data() as any;
        setPlanoAtual(normalizarPlano(dados.plano));
      } else {
        setPlanoAtual("gratuito");
      }
    } catch (error) {
      console.log("Erro ao carregar plano atual:", error);
      setPlanoAtual("gratuito");
    } finally {
      setCarregandoPlanoAtual(false);
    }
  }

  async function escolherPlano(plano: PlanoId) {
    try {
      if (!auth.currentUser) {
        Alert.alert("Erro", "Usuário não autenticado.");
        return;
      }

      if (carregando || planoProcessando || planoAtual === plano) {
        return;
      }

      const mensagem =
        plano === "gratuito"
          ? "Você vai continuar com o plano Básico e perder o destaque pago. Deseja confirmar?"
          : `Deseja ativar o plano ${formatarPlano(plano)} agora?`;

      Alert.alert("Confirmar plano", mensagem, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async () => {
            try {
              setCarregando(true);
              setPlanoProcessando(plano);

              const result = await alterarPlanoProfissionalFn({ plano });
              const planoResposta = normalizarPlano(result.data?.plano || plano);

              await carregarPlanoAtual();
              setPlanoAtual(planoResposta);

              Alert.alert(
                "Sucesso",
                result.data?.mensagem ||
                  `Plano ${formatarPlano(planoResposta)} ativado 🚀`,
                [
                  {
                    text: "OK",
                    onPress: () => router.replace("/painel-profissional"),
                  },
                ]
              );
            } catch (error: any) {
              console.log("Erro ao alterar plano via function:", error);
              Alert.alert(
                "Erro",
                error?.message || "Não foi possível selecionar o plano."
              );
            } finally {
              setCarregando(false);
              setPlanoProcessando(null);
            }
          },
        },
      ]);
    } catch (error) {
      console.log("Erro ao preparar seleção de plano:", error);
      Alert.alert("Erro", "Não foi possível selecionar o plano.");
      setCarregando(false);
      setPlanoProcessando(null);
    }
  }

  function formatarPlano(plano: PlanoId) {
    switch (plano) {
      case "gratuito":
        return "Básico";
      case "mensal":
        return "Destaque";
      case "turbo":
        return "Turbo";
      default:
        return plano;
    }
  }

  function CardPlano({ plano }: { plano: PlanoInfo }) {
    const selecionado = planoAtual === plano.id;
    const recomendado = plano.id === "mensal";
    const turbo = plano.id === "turbo";

    return (
      <View
        style={[
          styles.card,
          recomendado && styles.cardRecomendado,
          turbo && styles.cardTurbo,
          selecionado && styles.cardSelecionado,
        ]}
      >
        <View style={styles.topoCard}>
          <View style={styles.textoTopo}>
            <Text style={styles.planoTitulo}>{plano.titulo}</Text>
            <Text style={styles.planoPreco}>{plano.preco}</Text>
            <Text style={styles.planoSubtitulo}>{plano.subtitulo}</Text>
          </View>

          {!!plano.destaque && (
            <View
              style={[
                styles.badge,
                recomendado && styles.badgeRecomendado,
                turbo && styles.badgeTurbo,
              ]}
            >
              <Text style={styles.badgeTexto}>{plano.destaque}</Text>
            </View>
          )}
        </View>

        <Text style={styles.descricao}>{plano.descricao}</Text>

        <View style={styles.beneficiosBox}>
          {plano.beneficios.map((beneficio) => (
            <Text key={beneficio} style={styles.beneficio}>
              • {beneficio}
            </Text>
          ))}
        </View>

        {selecionado && (
          <View style={styles.planoAtualBadge}>
            <Text style={styles.planoAtualTexto}>Plano atual</Text>
          </View>
        )}

        {plano.id === "gratuito" && planoAtual !== "gratuito" && (
          <Text style={styles.alertaDowngrade}>
            Ao voltar para o básico, seu perfil perde destaque e prioridade.
          </Text>
        )}

        <View style={styles.buttonTop}>
          <ActionButton
            title={
              selecionado
                ? "Plano atual"
                : planoProcessando === plano.id || carregando
                ? "Salvando..."
                : plano.buttonLabel
            }
            onPress={() => escolherPlano(plano.id)}
            variant={plano.variant}
            disabled={carregando || !!planoProcessando || selecionado}
          />
        </View>
      </View>
    );
  }

  if (carregandoPlanoAtual) {
    return (
      <View style={styles.page}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando planos...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Escolha seu plano"
          subtitle="Apareça mais, receba mais pedidos e destaque seu perfil no Nexo"
          showBackButton
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Seu plano atual</Text>
          <Text style={styles.heroPlan}>
            {formatarPlano(planoAtual || "gratuito")}
          </Text>
          <Text style={styles.heroText}>
            Profissionais com planos pagos ganham mais visibilidade e mais
            chances de receber contatos no app.
          </Text>

          <View style={styles.heroInfoBox}>
            <Text style={styles.heroInfoText}>
              Alterações de plano são aplicadas no seu perfil profissional.
            </Text>
            <Text style={styles.heroInfoText}>
              Mensal: {formatarPreco(precoMensal)} • Turbo:{" "}
              {formatarPreco(precoTurbo)}
            </Text>
          </View>
        </View>

        {PLANOS.map((plano) => (
          <CardPlano key={plano.id} plano={plano} />
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

    scrollContent: {
      paddingHorizontal: theme.spacing.md,
      paddingTop: 12,
      paddingBottom: 40,
    },

    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
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
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    heroTitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginBottom: 6,
    },

    heroPlan: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: "bold",
      marginBottom: 8,
    },

    heroText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },

    heroInfoBox: {
      marginTop: 12,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      padding: 12,
      gap: 6,
    },

    heroInfoText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "700",
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.04,
      shadowRadius: 10,
      elevation: 2,
    },

    cardRecomendado: {
      borderColor: theme.colors.primary,
      backgroundColor: isDark ? "#132844" : "#F4F8FF",
    },

    cardTurbo: {
      borderColor: theme.colors.warning,
      backgroundColor: isDark ? "#2a2314" : "#FFF7E8",
    },

    cardSelecionado: {
      borderWidth: 2,
    },

    topoCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },

    textoTopo: {
      flex: 1,
    },

    planoTitulo: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "bold",
    },

    planoPreco: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "800",
      marginTop: 10,
    },

    planoSubtitulo: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginTop: 6,
      lineHeight: 20,
    },

    badge: {
      borderRadius: theme.radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    badgeRecomendado: {
      backgroundColor: theme.colors.primary,
    },

    badgeTurbo: {
      backgroundColor: theme.colors.warning,
    },

    badgeTexto: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
    },

    descricao: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 14,
    },

    beneficiosBox: {
      marginTop: 14,
      gap: 8,
    },

    beneficio: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },

    alertaDowngrade: {
      marginTop: 12,
      color: theme.colors.warning,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "700",
    },

    planoAtualBadge: {
      alignSelf: "flex-start",
      marginTop: 14,
      backgroundColor: "rgba(34,197,94,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },

    planoAtualTexto: {
      color: theme.colors.success,
      fontSize: 12,
      fontWeight: "bold",
    },

    buttonTop: {
      marginTop: 16,
    },
  });
}