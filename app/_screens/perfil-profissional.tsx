import * as Location from "expo-location";
import { Redirect, useLocalSearchParams } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAppTheme } from "../../contexts/ThemeContext";
import { OfflineBanner } from "../../components/OfflineBanner";
import { handleError } from "../../lib/errorHandler";
import { auth, db, functions } from "../../lib/firebase";
import { isOnline } from "../../lib/network";

type StatusPedido =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado";

type Profissional = {
  id: string;
  nome?: string;
  servico?: string;
  servicos?: string[];
  servicoPrincipal?: string;
  descricao?: string;
  telefone?: string;
  cidade?: string;
  endereco?: string;
  tipoAtendimento?: "fixo" | "movel" | "ambos";
  fotoPerfil?: string;
  portfolio?: string[];
  online?: boolean;
  plano?: string;
  expoPushToken?: string;
  latitude?: number | null;
  longitude?: number | null;
  emAtendimento?: boolean;
  verificacaoStatus?: string;
};

type LiberacaoWhatsappResponse = {
  ok?: boolean;
  liberado?: boolean;
  premium?: boolean;
  motivo?: string;
  data?: string;
  profissionalIdJaUsado?: string;
};

const rewardedAdUnitId = __DEV__
  ? TestIds.REWARDED
  : "ca-app-pub-xxxxxxxxxxxxxxxx/yyyyyyyyyyyy"; // TROCAR PELO SEU ID REAL

function coordenadaValida(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function statusBloqueiaNovoPedido(status?: StatusPedido) {
  return (
    status === "pendente" ||
    status === "aceito" ||
    status === "a_caminho" ||
    status === "chegou" ||
    status === "cliente_a_caminho" ||
    status === "cliente_chegou"
  );
}

function planoLiberaWhatsapp(plano?: string) {
  const planoNormalizado = String(plano || "").trim().toLowerCase();

  return (
    planoNormalizado === "mensal" ||
    planoNormalizado === "turbo" ||
    planoNormalizado === "premium" ||
    planoNormalizado === "pro"
  );
}

function textoPlano(plano?: string) {
  const p = String(plano || "gratuito").toLowerCase();
  if (p === "turbo") return "TURBO";
  if (p === "mensal") return "MENSAL";
  return "GRATUITO";
}

function formatarNota(media?: number | null, total?: number) {
  if (!media || !total) return "Sem avaliações";
  return `${media.toFixed(1)} ⭐ (${total})`;
}

function textoTipoAtendimento(tipo?: string) {
  if (tipo === "fixo") return "Atendimento em local fixo";
  if (tipo === "movel") return "Atendimento no local do cliente";
  if (tipo === "ambos") return "Atendimento fixo e móvel";
  return "Tipo de atendimento não informado";
}

function motivoEscolha(
  media?: number | null,
  total?: number,
  online?: boolean,
  plano?: string,
  distanciaTexto?: string
) {
  if ((media || 0) >= 4.8 && (total || 0) >= 5) return "Muito bem avaliado";
  if (String(plano || "").toLowerCase() === "turbo") return "Maior destaque";
  if (online) return "Disponível agora";
  if (distanciaTexto) return "Perto de você";
  return "Boa escolha";
}

export default function PerfilProfissional() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);
  const params = useLocalSearchParams<{ id?: string }>();

  const [profissional, setProfissional] = useState<Profissional | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedidoExistente, setPedidoExistente] = useState(false);
  const [usuarioAtual, setUsuarioAtual] = useState<User | null>(null);
  const [authPronto, setAuthPronto] = useState(false);
  const [semUser, setSemUser] = useState(false);

  const [mediaAvaliacoes, setMediaAvaliacoes] = useState<number | null>(null);
  const [totalAvaliacoes, setTotalAvaliacoes] = useState(0);
  const [distanciaTexto, setDistanciaTexto] = useState("");
  const [desbloqueandoWhatsapp, setDesbloqueandoWhatsapp] = useState(false);
  const [erroTela, setErroTela] = useState("");

  const whatsappLiberadoPorPlano = planoLiberaWhatsapp(profissional?.plano);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUsuarioAtual(user);
      setSemUser(!user);
      setAuthPronto(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    carregarProfissional();
  }, [params.id]);

  useEffect(() => {
    if (profissional?.id) {
      carregarAvaliacoes();
    }
  }, [profissional?.id]);

  useEffect(() => {
    if (profissional?.id && authPronto) {
      verificarPedidoExistente();
    }
  }, [profissional?.id, authPronto, usuarioAtual?.uid]);

  function calcularDistanciaKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) {
    const toRad = (value: number) => (value * Math.PI) / 180;
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

  async function calcularDistanciaDoPerfil(prof: Profissional) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setDistanciaTexto("");
        return;
      }

      const posicao = await Location.getCurrentPositionAsync({});
      const clienteLat = posicao.coords.latitude;
      const clienteLng = posicao.coords.longitude;

      let profLat = prof.latitude ?? null;
      let profLng = prof.longitude ?? null;

      if (
        (prof.tipoAtendimento === "fixo" || prof.tipoAtendimento === "ambos") &&
        !coordenadaValida(profLat, profLng) &&
        prof.endereco
      ) {
        const resultado = await Location.geocodeAsync(
          `${prof.endereco}, ${prof.cidade || ""}`
        );

        if (resultado.length > 0) {
          profLat = resultado[0].latitude;
          profLng = resultado[0].longitude;
        }
      }

      if (!coordenadaValida(profLat, profLng)) {
        setDistanciaTexto("");
        return;
      }

      const km = calcularDistanciaKm(
        clienteLat,
        clienteLng,
        profLat as number,
        profLng as number
      );

      setDistanciaTexto(`${km.toFixed(1)} km`);
    } catch (error) {
      handleError(error, "PerfilProfissional.calcularDistanciaDoPerfil");
      setDistanciaTexto("");
    }
  }

  async function carregarProfissional() {
    try {
      setErroTela("");
      if (!params.id) {
        setCarregando(false);
        setErroTela("Profissional não informado.");
        return;
      }

      const refDoc = doc(db, "users", String(params.id));
      const snap = await getDoc(refDoc);

      if (snap.exists()) {
        const prof: Profissional = {
          id: snap.id,
          ...(snap.data() as Omit<Profissional, "id">),
        };

        setProfissional(prof);
        await calcularDistanciaDoPerfil(prof);
      } else {
        setProfissional(null);
        setErroTela("Profissional não encontrado.");
      }
    } catch (error) {
      handleError(error, "PerfilProfissional.carregarProfissional");
      setErroTela("Não foi possível carregar o perfil agora.");
    } finally {
      setCarregando(false);
      setRefreshing(false);
    }
  }

  async function carregarAvaliacoes() {
    try {
      if (!profissional?.id) return;

      const q = query(
        collection(db, "avaliacoes"),
        where("profissionalId", "==", profissional.id)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setMediaAvaliacoes(null);
        setTotalAvaliacoes(0);
        return;
      }

      const notas = snapshot.docs
        .map((docSnap) => Number(docSnap.data().nota || 0))
        .filter((nota) => nota > 0);

      if (!notas.length) {
        setMediaAvaliacoes(null);
        setTotalAvaliacoes(0);
        return;
      }

      const soma = notas.reduce((acc, nota) => acc + nota, 0);
      const media = soma / notas.length;

      setMediaAvaliacoes(media);
      setTotalAvaliacoes(notas.length);
    } catch (error) {
      handleError(error, "PerfilProfissional.carregarAvaliacoes");
    }
  }

  async function verificarPedidoExistente() {
    try {
      if (!usuarioAtual?.uid || !profissional?.id) {
        setPedidoExistente(false);
        return;
      }

      const q = query(
        collection(db, "pedidos"),
        where("clienteId", "==", usuarioAtual.uid)
      );

      const snapshot = await getDocs(q);

      const existe = snapshot.docs.some((docSnap) => {
        const dados = docSnap.data() as { status?: StatusPedido };
        return statusBloqueiaNovoPedido(dados.status);
      });

      setPedidoExistente(existe);
    } catch (error) {
      handleError(error, "PerfilProfissional.verificarPedidoExistente");
    }
  }

  async function pegarLocalizacaoCliente() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return null;
      }

      const posicao = await Location.getCurrentPositionAsync({});

      return {
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
      };
    } catch (error) {
      handleError(error, "PerfilProfissional.pegarLocalizacaoCliente");
      return null;
    }
  }

  async function enviarPushParaProfissional(
    expoPushToken: string,
    nomeCliente: string,
    servico: string,
    pedidoId: string
  ) {
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: expoPushToken,
          title: "Novo pedido 🚀",
          body: `${nomeCliente} solicitou ${servico}`,
          sound: "default",
          priority: "high",
          data: {
            tela: "pedidos-profissional",
            pedidoId,
            profissionalId: profissional?.id || "",
            tipo: "novo_pedido",
          },
        }),
      });
    } catch (error) {
      handleError(error, "PerfilProfissional.enviarPushParaProfissional");
    }
  }

  async function solicitarServico() {
    try {
      if (enviando) return;
      setEnviando(true);

      if (!profissional) {
        Alert.alert("Erro", "Profissional não carregado.");
        return;
      }

      if (!authPronto) {
        Alert.alert("Aguarde", "Carregando sua sessão...");
        return;
      }

      if (!usuarioAtual) {
        Alert.alert("Erro", "Você precisa estar logado.");
        return;
      }

      if (!profissional.online) {
        Alert.alert(
          "Profissional indisponível",
          "Esse profissional está offline no momento."
        );
        return;
      }

      if (profissional.emAtendimento === true) {
        Alert.alert(
          "Profissional em atendimento",
          "Esse profissional já está em um atendimento ativo no momento."
        );
        return;
      }

      const qCliente = query(
        collection(db, "pedidos"),
        where("clienteId", "==", usuarioAtual.uid)
      );

      const snapshotCliente = await getDocs(qCliente);

      const pedidoEmAberto = snapshotCliente.docs.find((docSnap) => {
        const dados = docSnap.data() as { status?: StatusPedido };
        return statusBloqueiaNovoPedido(dados.status);
      });

      if (pedidoEmAberto) {
        Alert.alert(
          "Pedido já existe",
          "Você já possui um pedido em andamento ou aguardando atendimento."
        );
        setPedidoExistente(true);
        return;
      }

      const nomeCliente =
        usuarioAtual.displayName || usuarioAtual.email || "Cliente";
      const servico =
        profissional.servicoPrincipal ||
        profissional.servico ||
        profissional.servicos?.[0] ||
        "um serviço";
      const localCliente = await pegarLocalizacaoCliente();

      const pedidoRef = await addDoc(collection(db, "pedidos"), {
        profissionalId: profissional.id,
        clienteId: usuarioAtual.uid,
        nomeProfissional: profissional.nome || "",
        fotoProfissional: profissional.fotoPerfil || null,
        nomeCliente,
        emailCliente: usuarioAtual.email || "",
        fotoCliente: usuarioAtual.photoURL || null,
        servico,
        status: "pendente",
        criadoEm: serverTimestamp(),
        concluidoEm: null,
        latitudeCliente: localCliente?.latitude ?? null,
        longitudeCliente: localCliente?.longitude ?? null,
      });

      if (profissional.expoPushToken) {
        await enviarPushParaProfissional(
          profissional.expoPushToken,
          nomeCliente,
          servico,
          pedidoRef.id
        );
      }

      setPedidoExistente(true);
      Alert.alert("Sucesso", "Pedido enviado com sucesso 🚀");
    } catch (error: any) {
      handleError(error, "PerfilProfissional.solicitarServico");
      Alert.alert(
        "Erro",
        error?.message || "Erro ao enviar pedido."
      );
    } finally {
      setEnviando(false);
    }
  }

  async function abrirWhatsappDireto() {
    try {
      if (!profissional?.telefone) {
        Alert.alert("Aviso", "Telefone do profissional não disponível.");
        return;
      }

      const numeroLimpo = String(profissional.telefone).replace(/\D/g, "");

      if (!numeroLimpo) {
        Alert.alert("Aviso", "Telefone inválido.");
        return;
      }

      const numeroFinal = numeroLimpo.startsWith("55")
        ? numeroLimpo
        : `55${numeroLimpo}`;

      const mensagem = encodeURIComponent(
        `Olá ${profissional.nome || ""}, vi seu perfil no app e gostaria de mais informações sobre ${
          profissional.servicoPrincipal ||
          profissional.servico ||
          profissional.servicos?.[0] ||
          "o serviço"
        }.`
      );

      const url = `https://wa.me/${numeroFinal}?text=${mensagem}`;
      const canOpen = await Linking.canOpenURL(url);

      if (!canOpen) {
        Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      handleError(error, "PerfilProfissional.abrirWhatsappDireto");
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    }
  }

  async function mostrarAnuncioEDesbloquear(): Promise<boolean> {
    return new Promise((resolve) => {
      let ganhouRecompensa = false;

      const rewarded = RewardedAd.createForAdRequest(rewardedAdUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });

      const unsubscribeLoaded = rewarded.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => {
          rewarded.show();
        }
      );

      const unsubscribeReward = rewarded.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        async () => {
          ganhouRecompensa = true;
        }
      );

      const unsubscribeClosed = rewarded.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          cleanup();
          resolve(ganhouRecompensa);
        }
      );

      const unsubscribeError = rewarded.addAdEventListener(
        AdEventType.ERROR,
        (error) => {
          handleError(error, "PerfilProfissional.rewardedAd");
          cleanup();
          resolve(false);
        }
      );

      function cleanup() {
        unsubscribeLoaded();
        unsubscribeReward();
        unsubscribeClosed();
        unsubscribeError();
      }

      rewarded.load();
    });
  }

  async function desbloquearWhatsappPorAnuncio() {
    try {
      if (!profissional?.id) {
        Alert.alert("Erro", "Profissional não encontrado.");
        return;
      }

      if (!usuarioAtual?.uid) {
        Alert.alert("Erro", "Você precisa estar logado.");
        return;
      }

      if (!profissional.telefone) {
        Alert.alert("Aviso", "Telefone do profissional não disponível.");
        return;
      }

      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      setDesbloqueandoWhatsapp(true);

      const anuncioConcluido = await mostrarAnuncioEDesbloquear();

      if (!anuncioConcluido) {
        Alert.alert(
          "Não foi possível desbloquear",
          "O anúncio não foi concluído ou não carregou."
        );
        return;
      }

      const callable = httpsCallable<
        { profissionalId: string },
        LiberacaoWhatsappResponse
      >(functions, "liberarWhatsappDiario");

      const res = await callable({ profissionalId: profissional.id });

      if (!res.data?.liberado) {
        Alert.alert(
          "Limite diário atingido",
          "Você já usou sua liberação diária de WhatsApp hoje. Tente novamente amanhã ou assine o plano premium."
        );
        return;
      }

      Alert.alert(
        "WhatsApp liberado",
        "Liberação concluída. Agora vamos abrir o WhatsApp."
      );

      await abrirWhatsappDireto();
    } catch (error: any) {
      handleError(error, "PerfilProfissional.desbloquearWhatsappPorAnuncio");
      Alert.alert(
        "Erro",
        error?.message || "Não foi possível liberar o WhatsApp."
      );
    } finally {
      setDesbloqueandoWhatsapp(false);
    }
  }

  async function onPressWhatsapp() {
    if (whatsappLiberadoPorPlano) {
      await abrirWhatsappDireto();
      return;
    }

    await desbloquearWhatsappPorAnuncio();
  }

  function fotoPerfilFinal() {
    if (profissional?.fotoPerfil && String(profissional.fotoPerfil).trim() !== "") {
      return String(profissional.fotoPerfil);
    }

    return "https://i.pravatar.cc/300?img=32";
  }

  const fotosPortfolio = useMemo(() => {
    return profissional?.portfolio && profissional.portfolio.length > 0
      ? profissional.portfolio
      : [];
  }, [profissional?.portfolio]);

  if (carregando) {
    return (
      <ScreenContainer>
        <OfflineBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando perfil...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (semUser && authPronto) {
    return <Redirect href="/" />;
  }

  if (!profissional) {
    return (
      <ScreenContainer>
        <OfflineBanner />
        <View style={styles.center}>
          <Text style={styles.loadingText}>
            {erroTela || "Profissional não encontrado."}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader
        title="Perfil Profissional"
        subtitle="Veja detalhes, avaliações e solicite o serviço"
        showBackButton
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={carregarProfissional} />
        }
      >
        <View
          style={[
            styles.heroCard,
            String(profissional.plano || "").toLowerCase() === "turbo"
              ? styles.heroTurbo
              : String(profissional.plano || "").toLowerCase() === "mensal"
              ? styles.heroMensal
              : styles.heroGratuito,
          ]}
        >
          <View style={styles.topBadgeRow}>
            <View style={styles.choiceBadge}>
              <Text style={styles.choiceBadgeText}>
                {motivoEscolha(
                  mediaAvaliacoes,
                  totalAvaliacoes,
                  profissional.online,
                  profissional.plano,
                  distanciaTexto
                )}
              </Text>
            </View>

            <View
              style={[
                styles.planBadge,
                String(profissional.plano || "").toLowerCase() === "turbo"
                  ? styles.planBadgeWarning
                  : String(profissional.plano || "").toLowerCase() === "mensal"
                  ? styles.planBadgePrimary
                  : styles.planBadgeNeutral,
              ]}
            >
              <Text
                style={[
                  styles.planBadgeText,
                  String(profissional.plano || "").toLowerCase() === "turbo"
                    ? styles.planBadgeTextDark
                    : styles.planBadgeTextLight,
                ]}
              >
                {textoPlano(profissional.plano)}
              </Text>
            </View>
          </View>

          <Image source={{ uri: fotoPerfilFinal() }} style={styles.avatar} />

          <Text style={styles.nome}>{profissional.nome || "Sem nome"}</Text>

          <Text
            style={[
              styles.statusOnline,
              {
                color: profissional.online
                  ? theme.colors.success
                  : theme.colors.danger,
              },
            ]}
          >
            {profissional.online ? "🟢 Disponível agora" : "🔴 Offline"}
          </Text>

          <Text style={styles.servico}>
            ✂{" "}
            {profissional.servicoPrincipal ||
              profissional.servico ||
              profissional.servicos?.[0] ||
              "Serviço não informado"}
          </Text>

          <View style={styles.boxAvaliacao}>
            <Text style={styles.textoAvaliacao}>
              {formatarNota(mediaAvaliacoes, totalAvaliacoes)}
            </Text>
          </View>

          <View style={styles.infoPillsWrap}>
            <Text style={styles.infoPill}>
              {textoTipoAtendimento(profissional.tipoAtendimento)}
            </Text>
            {!!distanciaTexto && <Text style={styles.infoPill}>{distanciaTexto}</Text>}
            {!!profissional.cidade && (
              <Text style={styles.infoPill}>🏙 {profissional.cidade}</Text>
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Descrição</Text>
          <Text style={styles.descricao}>
            {profissional.descricao || "Sem descrição"}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Confiança</Text>

          <View style={styles.confidenceItem}>
            <Text style={styles.confidenceTitle}>Verificação</Text>
            <Text style={styles.confidenceText}>
              {String(profissional.verificacaoStatus || "").toLowerCase() === "aprovado"
                ? "Perfil aprovado"
                : "Sem verificação confirmada"}
            </Text>
          </View>

          <View style={styles.confidenceItem}>
            <Text style={styles.confidenceTitle}>Avaliações</Text>
            <Text style={styles.confidenceText}>
              {formatarNota(mediaAvaliacoes, totalAvaliacoes)}
            </Text>
          </View>

          <View style={styles.confidenceItem}>
            <Text style={styles.confidenceTitle}>Endereço / atendimento</Text>
            <Text style={styles.confidenceText}>
              {profissional.tipoAtendimento === "fixo"
                ? `📌 ${profissional.endereco || "Endereço não informado"}`
                : profissional.tipoAtendimento === "ambos"
                ? `📌 ${profissional.endereco || "Endereço não informado"} • 🚗 Atendimento móvel`
                : "🚗 Atendimento no seu local"}
            </Text>
          </View>
        </View>

        {!!fotosPortfolio.length && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Portfólio</Text>
            <View style={styles.galeria}>
              {fotosPortfolio.slice(0, 6).map((foto, index) => (
                <Image
                  key={index}
                  source={{ uri: foto }}
                  style={styles.fotoTrabalho}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.botaoItem}>
          <ActionButton
            title={
              pedidoExistente
                ? "Pedido em andamento"
                : !profissional.online
                ? "Indisponível"
                : !authPronto
                ? "Carregando..."
                : enviando
                ? "Enviando..."
                : "Solicitar"
            }
            variant="primary"
            onPress={solicitarServico}
            disabled={
              pedidoExistente ||
              enviando ||
              !authPronto ||
              !profissional.online
            }
          />
        </View>

        <View style={styles.botaoItem}>
          <ActionButton
            title={
              whatsappLiberadoPorPlano
                ? "WhatsApp"
                : desbloqueandoWhatsapp
                ? "Carregando anúncio..."
                : "WPP 1x/dia"
            }
            variant={whatsappLiberadoPorPlano ? "success" : "warning"}
            onPress={onPressWhatsapp}
            disabled={!profissional.telefone || desbloqueandoWhatsapp}
          />
        </View>

        {!whatsappLiberadoPorPlano && (
          <Text style={styles.unlockInfo}>
            No plano gratuito, o WhatsApp é liberado ao assistir 1 anúncio e validado pelo sistema uma vez por dia.
          </Text>
        )}

        {!profissional.telefone && (
          <Text style={styles.telefoneAusente}>
            Este profissional ainda não cadastrou telefone.
          </Text>
        )}
      </View>
    </ScreenContainer>
  );
}

function createStyles(theme: any, themeMode?: "light" | "dark") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 160,
    },
    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    loadingText: {
      color: theme.colors.text,
      marginTop: 12,
      fontSize: 16,
      textAlign: "center",
      lineHeight: 22,
    },
    heroCard: {
      borderRadius: theme.radius.xl,
      padding: 20,
      alignItems: "center",
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.28 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      marginBottom: 14,
    },
    heroTurbo: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.warning,
    },
    heroMensal: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.primary,
    },
    heroGratuito: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
    },
    topBadgeRow: {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
      gap: 10,
    },
    choiceBadge: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    choiceBadgeText: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: "800",
    },
    planBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    planBadgeNeutral: {
      backgroundColor: theme.colors.border,
    },
    planBadgePrimary: {
      backgroundColor: theme.colors.primary,
    },
    planBadgeWarning: {
      backgroundColor: theme.colors.warning,
    },
    planBadgeText: {
      fontSize: 11,
      fontWeight: "800",
    },
    planBadgeTextLight: {
      color: "#fff",
    },
    planBadgeTextDark: {
      color: "#1f2937",
    },
    avatar: {
      width: 140,
      height: 140,
      borderRadius: 70,
      marginBottom: 14,
      backgroundColor: theme.colors.cardSoft,
    },
    nome: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "bold",
      textAlign: "center",
      lineHeight: 34,
    },
    statusOnline: {
      marginTop: 6,
      fontWeight: "bold",
      fontSize: 14,
      textAlign: "center",
    },
    servico: {
      color: theme.colors.textSecondary,
      marginTop: 6,
      fontSize: 18,
      textAlign: "center",
      lineHeight: 24,
    },
    boxAvaliacao: {
      marginTop: 12,
      marginBottom: 6,
    },
    textoAvaliacao: {
      color: theme.colors.warning,
      fontSize: 18,
      fontWeight: "bold",
      textAlign: "center",
    },
    infoPillsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
      marginTop: 10,
    },
    infoPill: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700",
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      textAlign: "center",
    },
    sectionCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.xl,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 14,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 10,
    },
    descricao: {
      color: theme.colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
    },
    confidenceItem: {
      marginBottom: 12,
    },
    confidenceTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800",
      marginBottom: 4,
    },
    confidenceText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    galeria: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      width: "100%",
    },
    fotoTrabalho: {
      width: "48%",
      height: 120,
      borderRadius: 16,
      backgroundColor: theme.colors.cardSoft,
    },
    bottomSpace: {
      height: 10,
    },
    bottomBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 18,
    },
    botoes: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
      alignItems: "stretch",
    },
    botaoItem: {
      marginBottom: 10,
    },
    unlockInfo: {
      color: theme.colors.textMuted,
      fontSize: 12,
      textAlign: "center",
      lineHeight: 18,
    },
    telefoneAusente: {
      color: theme.colors.danger,
      fontSize: 12,
      marginTop: 8,
      textAlign: "center",
      lineHeight: 18,
    },
  });
}
