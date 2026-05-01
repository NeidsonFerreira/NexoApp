import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AdBanner } from "../../components/BannerAd";
import { AppHeader } from "../../components/AppHeader";
import { OfflineBanner } from "../../components/OfflineBanner";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

type Categoria = {
  nome: string;
  emoji: string;
  destaque?: boolean;
  descricao?: string;
};

const categorias: Categoria[] = [
  { nome: "Eletricista", emoji: "⚡", destaque: true, descricao: "Instalações, reparos e manutenção elétrica." },
  { nome: "Encanador", emoji: "🚰", destaque: true, descricao: "Vazamentos, torneiras, registros e canos." },
  { nome: "Chaveiro", emoji: "🔑", descricao: "Abertura de portas e troca de fechaduras." },
  { nome: "Mecânico", emoji: "🔧", descricao: "Reparos automotivos e diagnósticos." },
  { nome: "Tatuador", emoji: "🖊️", destaque: true, descricao: "Profissionais para tattoos e atendimento artístico." },
  { nome: "Barbeiro", emoji: "💈", destaque: true, descricao: "Corte, barba e estilo." },
  { nome: "Cabeleireiro", emoji: "💇", destaque: true, descricao: "Cortes, penteados e transformação visual." },
  { nome: "Manicure", emoji: "💅", descricao: "Unhas, esmaltação e cuidados." },
  { nome: "Esteticista", emoji: "🧴", descricao: "Cuidados estéticos e tratamentos." },
  { nome: "Maquiador(a)", emoji: "💄", descricao: "Maquiagem para eventos e atendimentos especiais." },
  { nome: "Diarista", emoji: "🧼", descricao: "Limpeza residencial e apoio doméstico." },
  { nome: "Faxineiro(a)", emoji: "🧹", descricao: "Limpeza geral e manutenção do ambiente." },
  { nome: "Marceneiro", emoji: "🪚", descricao: "Móveis, reparos e projetos em madeira." },
  { nome: "Pedreiro", emoji: "🧱", descricao: "Obras, reformas e acabamentos." },
  { nome: "Pintor", emoji: "🎨", descricao: "Pintura interna, externa e acabamento." },
  { nome: "Técnico de Ar Condicionado", emoji: "❄️", descricao: "Instalação e manutenção de ar-condicionado." },
  { nome: "Técnico de TV", emoji: "📺", descricao: "Configuração, reparo e instalação." },
  { nome: "Técnico de Celular", emoji: "📱", descricao: "Conserto, troca de peças e manutenção." },
  { nome: "Técnico de Informática", emoji: "💻", destaque: true, descricao: "Computadores, notebooks e suporte técnico." },
  { nome: "Lavador de Carro", emoji: "🚗", descricao: "Lavagem, estética e cuidados automotivos." },
  { nome: "Pet Groomer", emoji: "🐶", descricao: "Banho, tosa e cuidados com pets." },
  { nome: "Cozinheiro(a)", emoji: "🧑‍🍳", descricao: "Eventos, marmitas e culinária personalizada." },
  { nome: "DJ", emoji: "🎧", descricao: "Som e música para eventos." },
  { nome: "Fotógrafo", emoji: "📸", destaque: true, descricao: "Fotos profissionais para eventos e ensaios." },
  { nome: "Videomaker", emoji: "🎥", descricao: "Captação e produção de vídeo." },
  { nome: "Motoboy", emoji: "🛵", descricao: "Entregas rápidas e apoio logístico." },
  { nome: "Frete/Mudança", emoji: "🚚", descricao: "Mudanças, transporte e frete local." },
  { nome: "Contador", emoji: "🧾", descricao: "Apoio fiscal, contábil e financeiro." },
  { nome: "Advogado", emoji: "⚖️", descricao: "Atendimento jurídico e orientação profissional." },
];

export default function Servicos() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [busca, setBusca] = useState("");
  const [carregandoServico, setCarregandoServico] = useState<string | null>(null);

  // 🔥 NOVO
  const [planoCliente, setPlanoCliente] = useState<"gratuito" | "premium">("gratuito");

  useEffect(() => {
    async function carregarPlano() {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;

        const dados = snap.data() as any;

        setPlanoCliente(
          String(dados.planoCliente || "").toLowerCase() === "premium"
            ? "premium"
            : "gratuito"
        );
      } catch {}
    }

    carregarPlano();
  }, []);

  const exibirAnuncios = planoCliente !== "premium";

  const categoriasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return categorias;

    return categorias.filter((item) => {
      const nome = item.nome.toLowerCase();
      const descricao = (item.descricao || "").toLowerCase();
      return nome.includes(termo) || descricao.includes(termo);
    });
  }, [busca]);

  const destaques = useMemo(
    () => categorias.filter((item) => item.destaque).slice(0, 6),
    []
  );

  function abrirCategoria(nome: string) {
    if (carregandoServico) return;

    setCarregandoServico(nome);

    router.push({
      pathname: "/profissionais",
      params: { servico: nome },
    });

    setTimeout(() => {
      setCarregandoServico(null);
    }, 500);
  }

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader
        title="Serviços"
        subtitle="Escolha a categoria ideal e veja profissionais disponíveis"
        showBackButton
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.heroBadgeText}>Escolha inteligente</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>O que você precisa hoje?</Text>
          <Text style={styles.heroText}>
            Selecione uma categoria para ver profissionais disponíveis perto de você.
          </Text>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.searchTitle}>Buscar categoria</Text>
          <TextInput
            style={styles.inputBusca}
            placeholder="Ex: tatuador, eletricista, manicure..."
            placeholderTextColor={theme.colors.textMuted}
            value={busca}
            onChangeText={setBusca}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mais procurados</Text>
          <Text style={styles.sectionSubtitle}>
            Categorias com maior chance de clique e conversão
          </Text>
        </View>

        <View style={styles.destaquesWrap}>
          {destaques.map((item) => (
            <TouchableOpacity
              key={`highlight-${item.nome}`}
              style={styles.highlightCard}
              activeOpacity={0.92}
              onPress={() => abrirCategoria(item.nome)}
              disabled={!!carregandoServico}
            >
              <Text style={styles.highlightEmoji}>{item.emoji}</Text>
              <Text style={styles.highlightName}>{item.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 🔥 CORREÇÃO AQUI */}
        {exibirAnuncios && (
          <View style={styles.bannerWrap}>
            <AdBanner isPremium={false} />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Todas as categorias</Text>
          <Text style={styles.sectionSubtitle}>
            Escolha uma categoria para seguir para os profissionais
          </Text>
        </View>

        {categoriasFiltradas.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="search-outline" size={26} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum serviço encontrado</Text>
            <Text style={styles.emptyText}>
              Tente buscar por outro nome ou limpe a busca para ver todas as categorias.
            </Text>

            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setBusca("")}
              activeOpacity={0.92}
            >
              <Text style={styles.emptyButtonText}>Mostrar tudo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {categoriasFiltradas.map((item) => {
              const carregando = carregandoServico === item.nome;

              return (
                <TouchableOpacity
                  key={item.nome}
                  style={styles.card}
                  activeOpacity={0.94}
                  disabled={!!carregandoServico}
                  onPress={() => abrirCategoria(item.nome)}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardEmoji}>{item.emoji}</Text>

                    {item.destaque && (
                      <View style={styles.badgePopular}>
                        <Text style={styles.badgePopularText}>POPULAR</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.cardTitle}>{item.nome}</Text>

                  {!!item.descricao && (
                    <Text style={styles.cardText}>{item.descricao}</Text>
                  )}

                  <View style={styles.cardActionRow}>
                    <Text style={styles.cardActionText}>
                      {carregando ? "Abrindo..." : "Ver profissionais"}
                    </Text>
                    <Ionicons name="arrow-forward-outline" size={18} color={theme.colors.primary} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Não encontrou o que precisa?</Text>
          <Text style={styles.footerText}>
            Explore a lista com calma ou use a busca para encontrar a categoria ideal.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    content: {
      paddingBottom: 28,
    },
    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      marginBottom: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    heroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.cardSoft,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    heroBadgeText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800",
      marginBottom: 8,
    },
    heroText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    searchCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 14,
    },
    searchTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 10,
    },
    inputBusca: {
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
    },
    sectionHeader: {
      marginTop: 4,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "800",
      marginBottom: 4,
    },
    sectionSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    destaquesWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 14,
    },
    highlightCard: {
      width: "31%",
      minHeight: 98,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      padding: 10,
    },
    highlightEmoji: {
      fontSize: 24,
      marginBottom: 8,
    },
    highlightName: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
    },
    bannerWrap: {
      alignItems: "center",
      marginBottom: 16,
    },
    grid: {
      gap: 12,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      padding: 16,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    cardEmoji: {
      fontSize: 28,
    },
    badgePopular: {
      backgroundColor: theme.colors.warning,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgePopularText: {
      color: theme.colors.background,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 8,
    },
    cardText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    cardActionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 2,
    },
    cardActionText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: "800",
    },
    emptyCard: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      padding: 18,
      alignItems: "center",
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 10,
      marginBottom: 8,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginBottom: 14,
    },
    emptyButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    emptyButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "800",
    },
    footerCard: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 22,
      padding: 16,
      marginTop: 16,
    },
    footerTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 8,
    },
    footerText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
