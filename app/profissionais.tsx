import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { auth, db, functions } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { AdBanner } from "../components/BannerAd";
import { OfflineBanner } from "../components/OfflineBanner";
import { handleError } from "../lib/errorHandler";
import { isOnline } from "../lib/network";
import { safeRequest } from "../lib/firebaseService";
import { logError, logEvent } from "../lib/logger";

type VerificacaoStatus =
  | "nao_enviado"
  | "pendente"
  | "aprovado"
  | "rejeitado";

type PlanoProfissional = "gratuito" | "mensal" | "turbo";
type PlanoCliente = "gratuito" | "premium";
type FiltroTipo = "todos" | "fixo" | "movel";
type Ordenacao = "relevancia" | "mais_proximos" | "melhor_avaliados";

type Profissional = {
  id: string;
  nome?: string;
  cidade?: string;
  servico?: string;
  servicos?: string[];
  servicoPrincipal?: string;
  telefone?: string;
  plano?: string;
  online?: boolean;
  descricao?: string;
  tipoAtendimento?: string;
  endereco?: string;
  fotoPerfil?: string;
  portfolio?: string[];
  latitude?: number | null;
  longitude?: number | null;
  distanciaTexto?: string;
  distanciaValor?: number | null;
  mediaAvaliacoes?: number | null;
  totalAvaliacoes?: number;
  verificacaoStatus?: VerificacaoStatus;
  bloqueado?: boolean;
  score?: number;
};

type AvaliacaoResumo = Record<
  string,
  {
    media: number;
    total: number;
  }
>;

type ClienteLocal = {
  latitude: number;
  longitude: number;
};

type LiberacaoWhatsappResponse = {
  ok?: boolean;
  liberado?: boolean;
  premium?: boolean;
  motivo?: string;
  data?: string;
  profissionalIdJaUsado?: string;
};

function planoDoProfissional(plano?: string): PlanoProfissional {
  if (plano === "mensal" || plano === "turbo") return plano;
  return "gratuito";
}

function prioridadePlano(plano?: string) {
  const normalizado = planoDoProfissional(plano);
  if (normalizado === "turbo") return 3;
  if (normalizado === "mensal") return 2;
  return 1;
}

function textoPlano(plano?: string) {
  const normalizado = planoDoProfissional(plano);
  if (normalizado === "turbo") return "TURBO";
  if (normalizado === "mensal") return "MENSAL";
  return "GRATUITO";
}

function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (valor: number) => (valor * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function buscarCoordenadasEndereco(enderecoCompleto: string) {
  try {
    const resultado = await Location.geocodeAsync(enderecoCompleto);
    if (!resultado.length) return null;

    return {
      latitude: resultado[0].latitude,
      longitude: resultado[0].longitude,
    };
  } catch (error) {
    handleError(error, "Profissionais.buscarCoordenadasEndereco");
    return null;
  }
}

function formatarNota(media?: number | null, total?: number) {
  if (!media || !total) return "Sem avaliações";
  return `${media.toFixed(1)} ⭐ (${total})`;
}

function tagDecisao(prof: Profissional, menorDistancia: number | null) {
  if ((prof.mediaAvaliacoes || 0) >= 4.8 && (prof.totalAvaliacoes || 0) >= 5) {
    return "Melhor avaliado";
  }

  if (
    menorDistancia != null &&
    prof.distanciaValor != null &&
    Math.abs(prof.distanciaValor - menorDistancia) < 0.01
  ) {
    return "Mais próximo";
  }

  if (planoDoProfissional(prof.plano) === "turbo") {
    return "Maior destaque";
  }

  if (prof.online) {
    return "Disponível agora";
  }

  return "Boa opção";
}

function textoBotaoWhatsapp(
  prof: Profissional,
  planoCliente: PlanoCliente,
  liberandoId: string | null
) {
  if (liberandoId === prof.id) return "LIBERANDO...";
  const plano = planoDoProfissional(prof.plano);

  if (plano === "gratuito" && planoCliente !== "premium") {
    return "WPP 1X/DIA";
  }

  return "WHATSAPP";
}

export default function Profissionais() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ servico?: string }>();

  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busca, setBusca] = useState("");
  const [planoCliente, setPlanoCliente] = useState<PlanoCliente>("gratuito");
  const [somenteOnline, setSomenteOnline] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("relevancia");
  const [erroTela, setErroTela] = useState("");
  const [liberandoWppId, setLiberandoWppId] = useState<string | null>(null);

  const clienteLocalRef = useRef<ClienteLocal | null>(null);
    const carregandoRef = useRef(false);
  const ultimoRefreshRef = useRef(0);

  function podeRefrescar(intervaloMs = 4000) {
    const agora = Date.now();
    if (agora - ultimoRefreshRef.current < intervaloMs) {
      return false;
    }
    ultimoRefreshRef.current = agora;
    return true;
  }

  const servicoFiltro =
    typeof params.servico === "string" ? params.servico.trim() : "";

  async function carregarPlanoCliente() {
    try {
      const user = auth.currentUser;
      if (!user) {
        setPlanoCliente("gratuito");
        return;
      }

      const snap = await safeRequest(
        () => getDoc(doc(db, "users", user.uid)),
        {
          timeoutMs: 12000,
          tentativas: 2,
          exigirInternet: true,
          dedupeKey: `profissionais:planoCliente:${user.uid}`,
          priority: 6,
        }
      );

      if (!snap.exists()) {
        setPlanoCliente("gratuito");
        return;
      }

      const dados = snap.data() as any;

      setPlanoCliente(
        String(dados.planoCliente || "gratuito").toLowerCase() === "premium"
          ? "premium"
          : "gratuito"
      );
    } catch (error) {
      logError(error, "Profissionais.carregarPlanoCliente");
      handleError(error, "Profissionais.carregarPlanoCliente");
      setPlanoCliente("gratuito");
    }
  }

  async function carregarLocalCliente(): Promise<ClienteLocal | null> {
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (!permissao.granted) return null;

      const local = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: local.coords.latitude,
        longitude: local.coords.longitude,
      };
    } catch (error) {
      handleError(error, "Profissionais.carregarLocalCliente");
      return null;
    }
  }

    async function carregarResumoAvaliacoes(): Promise<AvaliacaoResumo> {
     try {
      const querySnapshot = await safeRequest(
        () => getDocs(collection(db, "avaliacoesResumo")),
        {
          timeoutMs: 15000,
          tentativas: 2,
          exigirInternet: true,
          dedupeKey: "profissionais:avaliacoesResumo",
          priority: 4,
        }
      );

      const mapa: AvaliacaoResumo = {};

      querySnapshot.forEach((docSnap) => {
        const dados = docSnap.data() as any;

        mapa[docSnap.id] = {
          media:
            typeof dados.media === "number"
              ? dados.media
              : typeof dados.mediaAvaliacoes === "number"
              ? dados.mediaAvaliacoes
              : 0,
          total:
            typeof dados.total === "number"
              ? dados.total
              : typeof dados.totalAvaliacoes === "number"
              ? dados.totalAvaliacoes
              : 0,
        };
      });

      return mapa;
    } catch (error) {
      logError(error, "Profissionais.carregarResumoAvaliacoes");
      handleError(error, "Profissionais.carregarResumoAvaliacoes");
      return {};
    }
  }

  async function buscarProfissionais() {
    if (carregandoRef.current) {
      return;
    }

    carregandoRef.current = true;

    try {
      setErroTela("");

      const [cliente, avaliacoesResumo] = await Promise.all([
        carregarLocalCliente(),
        carregarResumoAvaliacoes(),
      ]);

      clienteLocalRef.current = cliente;

      const q = query(
        collection(db, "users"),
        where("tipo", "==", "profissional"),
        where("verificacaoStatus", "==", "aprovado"),
        where("bloqueado", "==", false)
      );

      const querySnapshot = await safeRequest(
        () => getDocs(q),
        {
          timeoutMs: 20000,
          tentativas: 2,
          exigirInternet: true,
          dedupeKey: `profissionais:lista:${servicoFiltro || "todos"}`,
          priority: 8,
        }
      );

      const lista = await Promise.all(
        querySnapshot.docs.map(async (docSnap) => {
          try {
            const prof = docSnap.data() as Omit<Profissional, "id">;

            let lat = prof.latitude ?? null;
            let lon = prof.longitude ?? null;

            if (
              (lat == null || lon == null) &&
              prof.tipoAtendimento === "fixo" &&
              prof.endereco
            ) {
              const enderecoCompleto = `${prof.endereco}, ${prof.cidade || ""}`;
              const coords = await buscarCoordenadasEndereco(enderecoCompleto);

              if (coords) {
                lat = coords.latitude;
                lon = coords.longitude;
              }
            }

            let distanciaTexto = "Sem distância";
            let distanciaValor: number | null = null;

            if (cliente && lat != null && lon != null) {
              const km = calcularDistanciaKm(
                cliente.latitude,
                cliente.longitude,
                lat,
                lon
              );

              distanciaValor = km;
              distanciaTexto = `${km.toFixed(1)} km`;
            }

            const avaliacao = avaliacoesResumo[docSnap.id];

            const planoScore = prioridadePlano(prof.plano) * 1000;
            const notaScore = (avaliacao?.media ?? 0) * 100;
            const volumeScore = (avaliacao?.total ?? 0) * 2;
            const distanciaScore =
              distanciaValor != null ? Math.max(0, 100 - distanciaValor) : 0;
            const onlineScore = prof.online ? 50 : 0;

            return {
              id: docSnap.id,
              ...prof,
              latitude: lat,
              longitude: lon,
              distanciaTexto,
              distanciaValor,
              mediaAvaliacoes: avaliacao?.media ?? null,
              totalAvaliacoes: avaliacao?.total ?? 0,
              score:
                planoScore +
                notaScore +
                volumeScore +
                distanciaScore +
                onlineScore,
            } as Profissional;
          } catch (error) {
            logError(
              { error, profissionalId: docSnap.id },
              "Profissionais.mapProfissional"
            );
            return null;
          }
        })
      );

      const listaFinal = lista.filter(Boolean) as Profissional[];
      setProfissionais(listaFinal);

      logEvent(
        "profissionais_loaded",
        {
          total: listaFinal.length,
          filtroServico: servicoFiltro || null,
        },
        "Profissionais"
      );
    } catch (error: any) {
      logError(error, "Profissionais.buscarProfissionais");
      handleError(error, "Profissionais.buscarProfissionais");
      setErroTela(
        error?.message || "Não foi possível carregar os profissionais agora."
      );
      setProfissionais([]);
    } finally {
      carregandoRef.current = false;
    }
  }

  async function iniciar() {
    try {
      setCarregando(true);
      await Promise.all([carregarPlanoCliente(), buscarProfissionais()]);
    } finally {
      setCarregando(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    iniciar().catch((error) => handleError(error, "Profissionais.iniciar"));
  }, [servicoFiltro]);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("tipo", "==", "profissional"),
      where("verificacaoStatus", "==", "aprovado"),
      where("bloqueado", "==", false)
    );

    const unsubscribe = onSnapshot(
      q,
      () => {
        if (!podeRefrescar(4000)) return;

        buscarProfissionais().catch((error) => {
          logError(error, "Profissionais.snapshotRefresh");
          handleError(error, "Profissionais.snapshotRefresh");
        });
      },
      (error) => {
        logError(error, "Profissionais.snapshot");
        handleError(error, "Profissionais.snapshot");
      }
    );

    return () => unsubscribe();
  }, [servicoFiltro]);

  const profissionaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    let lista = [...profissionais];

    if (servicoFiltro) {
      lista = lista.filter((prof) => {
        const principal = String(
          prof.servicoPrincipal || prof.servico || ""
        ).toLowerCase();

        const todos = (prof.servicos || []).map((s) => s.toLowerCase());

        return (
          principal === servicoFiltro.toLowerCase() ||
          todos.includes(servicoFiltro.toLowerCase())
        );
      });
    }

    if (somenteOnline) {
      lista = lista.filter((prof) => prof.online === true);
    }

    if (filtroTipo !== "todos") {
      lista = lista.filter((prof) => prof.tipoAtendimento === filtroTipo);
    }

    if (termo) {
      lista = lista.filter((prof) => {
        const nome = (prof.nome || "").toLowerCase();
        const servico = (
          prof.servico ||
          prof.servicoPrincipal ||
          prof.servicos?.join(" ") ||
          ""
        ).toLowerCase();
        const cidade = (prof.cidade || "").toLowerCase();

        return (
          nome.includes(termo) ||
          servico.includes(termo) ||
          cidade.includes(termo)
        );
      });
    }

    if (ordenacao === "mais_proximos") {
      lista.sort(
        (a, b) => (a.distanciaValor ?? 999999) - (b.distanciaValor ?? 999999)
      );
    } else if (ordenacao === "melhor_avaliados") {
      lista.sort((a, b) => {
        const notaA = a.mediaAvaliacoes ?? 0;
        const notaB = b.mediaAvaliacoes ?? 0;
        if (notaA !== notaB) return notaB - notaA;
        return (b.totalAvaliacoes ?? 0) - (a.totalAvaliacoes ?? 0);
      });
    } else {
      lista.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    return lista;
  }, [busca, profissionais, servicoFiltro, somenteOnline, filtroTipo, ordenacao]);

  const exibirAnuncios = planoCliente !== "premium";
  const menorDistancia = useMemo(() => {
    const distancias = profissionaisFiltrados
      .map((p) => p.distanciaValor)
      .filter((v): v is number => typeof v === "number");
    if (!distancias.length) return null;
    return Math.min(...distancias);
  }, [profissionaisFiltrados]);

   async function onRefresh() {
    try {
      setRefreshing(true);
      await iniciar();
    } catch (error) {
      logError(error, "Profissionais.refresh");
      handleError(error, "Profissionais.refresh");
    } finally {
      setRefreshing(false);
    }
  }

  function abrirPerfil(prof: Profissional) {
    router.push({
      pathname: "/perfil-profissional",
      params: { id: prof.id },
    });
  }

async function abrirWhatsapp(prof: any) {
  const telefone = String(prof?.telefone || "").replace(/\D/g, "");

  if (!telefone) {
    Alert.alert(
      "Contato indisponível",
      "Esse profissional ainda não informou WhatsApp."
    );
    return;
  }

  try {
    const planoProf = planoDoProfissional(prof?.plano);
    const online = await isOnline();

    if (!online) {
      Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
      return;
    }

    const texto = encodeURIComponent(
      `Olá${prof?.nome ? `, ${prof.nome}` : ""}! Vi seu perfil no app e gostaria de solicitar um serviço.`
    );

    const urlWhatsapp = `https://wa.me/55${telefone}?text=${texto}`;

    if (planoProf !== "gratuito" || planoCliente === "premium") {
      await Linking.openURL(urlWhatsapp);
      return;
    }

    Alert.alert(
      "Liberação diária",
      "Profissionais do plano gratuito liberam WhatsApp 1 vez por dia após anúncio em vídeo.\n\nDeseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar",
          onPress: async () => {
            try {
              setLiberandoWppId(prof?.id || null);

              const callable = httpsCallable<
                { profissionalId: string },
                LiberacaoWhatsappResponse
              >(functions, "liberarWhatsappDiario");

              const res = await safeRequest(
                () => callable({ profissionalId: String(prof?.id || "") }),
                {
                  timeoutMs: 20000,
                  tentativas: 1,
                  exigirInternet: true,
                  dedupeKey: `profissionais:wpp:${String(prof?.id || "")}`,
                  priority: 10,
                }
              );

              const data = res.data;

              if (!data?.liberado) {
                Alert.alert(
                  "Limite diário atingido",
                  "Você já usou sua liberação diária de WhatsApp hoje.\nTente novamente amanhã ou assine o plano premium."
                );
                return;
              }

              await Linking.openURL(urlWhatsapp);
            } catch (error: any) {
              logError(error, "Profissionais.liberarWhatsappDiario");
              handleError(error, "Profissionais.liberarWhatsappDiario");
              Alert.alert(
                "Erro",
                error?.message || "Não foi possível liberar o WhatsApp agora."
              );
            } finally {
              setLiberandoWppId(null);
            }
          },
        },
      ]
    );
  } catch (error) {
    logError(error, "Profissionais.abrirWhatsapp");
    handleError(error, "Profissionais.abrirWhatsapp");
    Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
  }
}

  function abrirSolicitacao(prof: Profissional) {
    router.push({
      pathname: "/solicitar-servico",
      params: { profissionalId: prof.id },
    });
  }

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader
        title={servicoFiltro ? `Profissionais de ${servicoFiltro}` : "Profissionais"}
        subtitle="Escolha com mais segurança e mais chance de acertar"
        onBack={() => router.back()}
        showBackButton
      />

      {planoCliente === "premium" ? (
        <View style={styles.premiumBanner}>
          <Text style={styles.premiumBannerTitle}>Cliente Premium</Text>
          <Text style={styles.premiumBannerText}>
            Você está navegando sem anúncios.
          </Text>
        </View>
      ) : (
        <View style={styles.topAdBanner}>
          <Text style={styles.topAdLabel}>Publicidade</Text>
          <Text style={styles.topAdTitle}>Quer navegar sem anúncios?</Text>
          <Text style={styles.topAdText}>
            Assine o plano premium do cliente e tenha uma experiência mais limpa.
          </Text>
          <View style={styles.topAdButtonWrap}>
            <ActionButton
              title="PLANO PREMIUM"
              onPress={() => router.push("/plano-cliente")}
              variant="warning"
            />
          </View>
        </View>
      )}

      <View style={styles.searchCard}>
        <Text style={styles.searchTitle}>Buscar profissional</Text>
        <TextInput
          style={styles.inputBusca}
          placeholder="Buscar por nome, serviço ou cidade"
          placeholderTextColor={theme.colors.textMuted}
          value={busca}
          onChangeText={setBusca}
        />

        <View style={styles.filtersWrap}>
          <TouchableOpacity
            style={[styles.filterChip, somenteOnline && styles.filterChipActive]}
            onPress={() => setSomenteOnline((v) => !v)}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.filterChipText,
                somenteOnline && styles.filterChipTextActive,
              ]}
            >
              Só online
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              filtroTipo === "fixo" && styles.filterChipActive,
            ]}
            onPress={() => setFiltroTipo(filtroTipo === "fixo" ? "todos" : "fixo")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroTipo === "fixo" && styles.filterChipTextActive,
              ]}
            >
              Fixo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              filtroTipo === "movel" && styles.filterChipActive,
            ]}
            onPress={() => setFiltroTipo(filtroTipo === "movel" ? "todos" : "movel")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroTipo === "movel" && styles.filterChipTextActive,
              ]}
            >
              Móvel
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sortWrap}>
          <TouchableOpacity
            style={[
              styles.sortChip,
              ordenacao === "relevancia" && styles.sortChipActive,
            ]}
            onPress={() => setOrdenacao("relevancia")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.sortChipText,
                ordenacao === "relevancia" && styles.sortChipTextActive,
              ]}
            >
              Relevância
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortChip,
              ordenacao === "mais_proximos" && styles.sortChipActive,
            ]}
            onPress={() => setOrdenacao("mais_proximos")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.sortChipText,
                ordenacao === "mais_proximos" && styles.sortChipTextActive,
              ]}
            >
              Mais próximos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortChip,
              ordenacao === "melhor_avaliados" && styles.sortChipActive,
            ]}
            onPress={() => setOrdenacao("melhor_avaliados")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.sortChipText,
                ordenacao === "melhor_avaliados" && styles.sortChipTextActive,
              ]}
            >
              Melhor avaliados
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {!exibirAnuncios ? null : (
        <View style={styles.topBannerWrap}>
          <AdBanner isPremium={false} />
        </View>
      )}

      {carregando ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.stateText}>Carregando profissionais...</Text>
        </View>
      ) : erroTela ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Falha ao carregar</Text>
          <Text style={styles.stateText}>{erroTela}</Text>
          <View style={styles.emptyActions}>
            <ActionButton title="TENTAR NOVAMENTE" onPress={iniciar} variant="primary" />
          </View>
        </View>
      ) : profissionaisFiltrados.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Nenhum profissional encontrado</Text>
          <Text style={styles.stateText}>
            Tente mudar os filtros, buscar outro termo ou abrir o mapa para ampliar a busca.
          </Text>

          <View style={styles.emptyActions}>
            <ActionButton
              title="ABRIR MAPA"
              onPress={() => router.push("/mapa")}
              variant="primary"
            />
            <ActionButton
              title="LIMPAR FILTROS"
              onPress={() => {
                setBusca("");
                setSomenteOnline(true);
                setFiltroTipo("todos");
                setOrdenacao("relevancia");
              }}
              variant="secondary"
            />
          </View>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {profissionaisFiltrados.map((prof, index) => {
            const plano = planoDoProfissional(prof.plano);
            const tag = tagDecisao(prof, menorDistancia);

            const avatarBorderColor =
              plano === "turbo"
                ? "#EAB308"
                : plano === "mensal"
                ? theme.colors.primary
                : theme.colors.success;

            return (
              <View key={prof.id}>
                <TouchableOpacity
                  activeOpacity={0.96}
                  style={[
                    styles.card,
                    plano === "turbo"
                      ? styles.cardTurbo
                      : plano === "mensal"
                      ? styles.cardMensal
                      : styles.cardGratuito,
                  ]}
                  onPress={() => abrirPerfil(prof)}
                >
                  <View style={styles.tagRow}>
                    <View style={styles.tagDecision}>
                      <Text style={styles.tagDecisionText}>{tag}</Text>
                    </View>

                    <View
                      style={[
                        styles.badgePlano,
                        plano === "turbo"
                          ? styles.badgeTurbo
                          : plano === "mensal"
                          ? styles.badgeMensal
                          : styles.badgeGratuito,
                      ]}
                    >
                      <Text style={styles.badgePlanoText}>{textoPlano(prof.plano)}</Text>
                    </View>
                  </View>

                  <View style={styles.topRow}>
                    <View
                      style={[
                        styles.avatarBorder,
                        {
                          borderColor: avatarBorderColor,
                        },
                      ]}
                    >
                      {prof.fotoPerfil ? (
                        <Image source={{ uri: prof.fotoPerfil }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.avatarFallbackText}>
                            {String(prof.nome || "P").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.topInfo}>
                      <Text style={styles.nome} numberOfLines={1}>
                        {prof.nome || "Profissional"}
                      </Text>

                      <Text style={styles.meta} numberOfLines={1}>
                        {prof.servicoPrincipal ||
                          prof.servico ||
                          prof.servicos?.[0] ||
                          "Serviço não informado"}
                        {" • "}
                        {prof.cidade || "Cidade não informada"}
                      </Text>

                      <Text style={styles.rating}>
                        {formatarNota(prof.mediaAvaliacoes, prof.totalAvaliacoes)}
                      </Text>

                      <View style={styles.infoRow}>
                        <Text style={styles.infoPill}>
                          {prof.online ? "🟢 Online" : "⚪ Offline"}
                        </Text>
                        <Text style={styles.infoPill}>
                          {prof.tipoAtendimento === "fixo"
                            ? "📍 Fixo"
                            : prof.tipoAtendimento === "movel"
                            ? "🚗 Móvel"
                            : "ℹ️ Atendimento"}
                        </Text>
                        <Text style={styles.infoPill}>
                          {prof.distanciaTexto || "Sem distância"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {!!prof.descricao && (
                    <Text style={styles.descricao} numberOfLines={3}>
                      {prof.descricao}
                    </Text>
                  )}

                  <View style={styles.actionsWrap}>
                    <ActionButton
                      title="SOLICITAR SERVIÇO"
                      onPress={() => abrirSolicitacao(prof)}
                      variant="primary"
                    />

                    <ActionButton
                      title={textoBotaoWhatsapp(prof, planoCliente, liberandoWppId)}
                      onPress={() => abrirWhatsapp(prof)}
                      variant={
                        planoDoProfissional(prof.plano) === "gratuito" &&
                        planoCliente !== "premium"
                          ? "warning"
                          : "success"
                      }
                    />
                  </View>
                </TouchableOpacity>

                {exibirAnuncios && (index + 1) % 4 === 0 && (
                  <View style={styles.midBannerWrap}>
                    <AdBanner isPremium={false} />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    premiumBanner: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: 22,
      padding: 16,
      marginBottom: 14,
    },
    premiumBannerTitle: {
      color: theme.colors.success,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 6,
    },
    premiumBannerText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    topAdBanner: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      borderRadius: 22,
      padding: 16,
      marginBottom: 14,
    },
    topAdLabel: {
      color: theme.colors.warning,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    topAdTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 6,
    },
    topAdText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    topAdButtonWrap: {
      marginTop: 4,
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
      marginBottom: 12,
    },
    filtersWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 10,
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.cardSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    filterChipText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    filterChipTextActive: {
      color: "#fff",
    },
    sortWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    sortChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sortChipActive: {
      borderColor: theme.colors.success,
      backgroundColor: "rgba(34,197,94,0.12)",
    },
    sortChipText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    sortChipTextActive: {
      color: theme.colors.success,
    },
    topBannerWrap: {
      marginBottom: 14,
      alignItems: "center",
    },
    midBannerWrap: {
      marginTop: 4,
      marginBottom: 14,
      alignItems: "center",
    },
    stateBox: {
      paddingVertical: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    stateCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      alignItems: "center",
    },
    stateTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 8,
      textAlign: "center",
    },
    stateText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 8,
    },
    emptyActions: {
      gap: 10,
      marginTop: 16,
      width: "100%",
    },
    listContent: {
      paddingBottom: 20,
    },
    card: {
      borderRadius: 24,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
    },
    cardGratuito: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
    },
    cardMensal: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.primary,
    },
    cardTurbo: {
      backgroundColor: theme.colors.card,
      borderColor: "#EAB308",
    },
    tagRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    tagDecision: {
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    tagDecisionText: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: "800",
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    avatarBorder: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2.5,
      padding: 2,
      marginRight: 12,
    },
    avatar: {
      width: "100%",
      height: "100%",
      borderRadius: 999,
    },
    avatarFallback: {
      flex: 1,
      borderRadius: 999,
      backgroundColor: theme.colors.cardSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarFallbackText: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800",
    },
    topInfo: {
      flex: 1,
    },
    nome: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 4,
    },
    meta: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 6,
    },
    rating: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 8,
    },
    infoRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    infoPill: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgePlano: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeTurbo: {
      backgroundColor: "rgba(234,179,8,0.15)",
    },
    badgeMensal: {
      backgroundColor: "rgba(59,130,246,0.12)",
    },
    badgeGratuito: {
      backgroundColor: "rgba(34,197,94,0.12)",
    },
    badgePlanoText: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    descricao: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 12,
      marginBottom: 14,
    },
    actionsWrap: {
      gap: 10,
      marginTop: 2,
    },
  });
}
