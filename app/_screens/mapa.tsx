import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { httpsCallable } from "firebase/functions";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db, functions } from "../../lib/firebase";
import { safeRequest } from "../../lib/firebaseService";
import { logError, logEvent } from "../../lib/logger";
import { handleError } from "../../lib/errorHandler";
import { OfflineBanner } from "../../components/OfflineBanner";

type VerificacaoStatus =
  | "nao_enviado"
  | "pendente"
  | "aprovado"
  | "rejeitado";

type Profissional = {
  id: string;
  nome?: string;
  servico?: string;
  tipoAtendimento?: "fixo" | "movel";
  endereco?: string;
  cidade?: string;
  descricao?: string;
  telefone?: string;
  fotoPerfil?: string;
  latitude?: number | null;
  longitude?: number | null;
  online?: boolean;
  verificacaoStatus?: VerificacaoStatus;
  bloqueado?: boolean;
  plano?: string;
};

type ClienteSelecionado = {
  id?: string;
  latitude: number;
  longitude: number;
  nome?: string;
  fotoPerfil?: string;
};

type ContaAtual = {
  id: string;
  tipo?: "cliente" | "profissional";
  tipoAtendimento?: "fixo" | "movel";
  latitude?: number | null;
  longitude?: number | null;
  endereco?: string;
  cidade?: string;
};

type UserBase = {
  pedidoAtivoId?: string | null;
  emAtendimento?: boolean;
};

type AvaliacoesMap = Record<
  string,
  {
    media: number;
    total: number;
  }
>;

type Coordenadas = {
  latitude: number;
  longitude: number;
};

type RotaInfo = {
  distanciaKm: number;
  duracaoMin: number;
  duracaoTransitoMin?: number;
  nivelTransito?: "livre" | "moderado" | "intenso";
};

type RotaStep = {
  instruction: string;
  startLocation: Coordenadas;
  endLocation: Coordenadas;
  distanceMeters: number;
  maneuver?: string;
};

type OpcoesBuscaRota = {
  /** Força nova chamada à API mesmo com deslocamento < 50 m na origem (ex.: rerota fora da rota). */
  ignorarLimiteOrigem?: boolean;
};

type MarcadorEstabelecimentoProps = {
  latitude: number;
  longitude: number;
  styles: any;
  tracksViewChanges: boolean;
};

const MarcadorEstabelecimentoFixoMemo = memo(function MarcadorEstabelecimentoFixoMemo({
  latitude,
  longitude,
  styles,
  tracksViewChanges,
}: MarcadorEstabelecimentoProps) {
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      title="Local do profissional"
      tracksViewChanges={tracksViewChanges}
    >
      <View style={styles.markerBaseLocal}>
        <View style={[styles.markerInner, styles.markerMe]} />
      </View>
    </Marker>
  );
});

type MarcadorClienteMapaProps = {
  latitude: number;
  longitude: number;
  title: string;
  styles: any;
  tracksViewChanges: boolean;
  onPress: () => void;
};

const MarcadorClienteMapaMemo = memo(function MarcadorClienteMapaMemo({
  latitude,
  longitude,
  title,
  styles,
  tracksViewChanges,
  onPress,
}: MarcadorClienteMapaProps) {
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      title={title}
      tracksViewChanges={tracksViewChanges}
      onPress={onPress}
    >
      <View style={styles.markerBaseLocal}>
        <View style={[styles.markerInner, styles.markerCliente]} />
      </View>
    </Marker>
  );
});

type MarcadorVeiculoMapaProps = {
  coordinate: Coordenadas;
  rotation: number;
  styles: any;
  tracksViewChanges: boolean;
};

const MarcadorVeiculoMapaMemo = memo(function MarcadorVeiculoMapaMemo({
  coordinate,
  rotation,
  styles,
  tracksViewChanges,
}: MarcadorVeiculoMapaProps) {
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={rotation}
      zIndex={999}
      tracksViewChanges={tracksViewChanges}
    >
      <View style={styles.vehicleMarkerOuter}>
        <View style={styles.vehicleMarkerInner}>
          <Text style={styles.vehicleMarkerIcon}>▲</Text>
        </View>
      </View>
    </Marker>
  );
});

type MarcadorProfissionalListaProps = {
  profId: string;
  latitude: number;
  longitude: number;
  borderColor: string;
  markerSize: number;
  imageSize: number;
  fotoUri: string;
  styles: any;
  tracksViewChanges: boolean;
  onSelectProf: (id: string) => void;
};

const MAX_PROFISSIONAIS_MAPA_INICIAL = 20;

const MarcadorProfissionalListaItem = memo(function MarcadorProfissionalListaItem({
  profId,
  latitude,
  longitude,
  borderColor,
  markerSize,
  imageSize,
  fotoUri,
  styles,
  tracksViewChanges,
  onSelectProf,
}: MarcadorProfissionalListaProps) {
  const onPress = useCallback(() => {
    onSelectProf(profId);
  }, [profId, onSelectProf]);

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      onPress={onPress}
    >
      <View collapsable={false} style={styles.markerWrapper}>
        <View
          style={[
            styles.markerBubble,
            {
              width: markerSize,
              height: markerSize,
              borderRadius: markerSize / 2,
              borderColor,
            },
          ]}
        >
          <Image
            source={{ uri: fotoUri }}
            style={{
              width: imageSize,
              height: imageSize,
              borderRadius: imageSize / 2,
            }}
          />
        </View>
      </View>
    </Marker>
  );
});

type PedidoStatus =
  | ""
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado";

function pedidoEhAtivo(status?: string | null) {
  const s = String(status || "").trim();

  return (
    s === "pendente" ||
    s === "aceito" ||
    s === "a_caminho" ||
    s === "chegou" ||
    s === "cliente_a_caminho" ||
    s === "cliente_chegou"
  );
}

type ClientePerfil = {
  id: string;
  nome?: string;
  fotoPerfil?: string;
  email?: string;
};

function emojiServico(servico?: string) {
  const nome = String(servico || "").toLowerCase();

  if (nome.includes("eletric")) return "⚡";
  if (nome.includes("encan")) return "🚰";
  if (nome.includes("chave")) return "🔑";
  if (nome.includes("mec")) return "🔧";
  if (nome.includes("tatu")) return "🖊️";
  if (nome.includes("barbe")) return "💈";
  if (nome.includes("cabele")) return "💇";
  if (nome.includes("manicure")) return "💅";
  if (nome.includes("estetic")) return "🧴";
  if (nome.includes("maqui")) return "💄";
  if (nome.includes("diar")) return "🧼";
  if (nome.includes("faxin")) return "🧹";
  if (nome.includes("marcene")) return "🪚";
  if (nome.includes("pedre")) return "🧱";
  if (nome.includes("pintor")) return "🎨";
  if (nome.includes("ar condicionado")) return "❄️";
  if (nome.includes("tv")) return "📺";
  if (nome.includes("celular")) return "📱";
  if (nome.includes("informática") || nome.includes("informatica")) return "💻";
  if (nome.includes("lavador")) return "🚗";
  if (nome.includes("pet")) return "🐶";
  if (nome.includes("cozin")) return "🧑‍🍳";
  if (nome.includes("dj")) return "🎧";
  if (nome.includes("fotóg") || nome.includes("fotog")) return "📸";
  if (nome.includes("video")) return "🎥";
  if (nome.includes("motoboy")) return "🛵";
  if (
    nome.includes("frete") ||
    nome.includes("mudança") ||
    nome.includes("mudanca")
  )
    return "🚚";
  if (nome.includes("contador")) return "🧾";
  if (nome.includes("advogado")) return "⚖️";

  return "🛠️";
}

function Mapa() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();

  const [contaAtual, setContaAtual] = useState<ContaAtual | null>(null);
  const [localAtual, setLocalAtual] = useState<Coordenadas | null>(null);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [profissionalSelecionado, setProfissionalSelecionado] =
    useState<Profissional | null>(null);
  const [clienteSelecionado, setClienteSelecionado] =
    useState<ClienteSelecionado | null>(null);
  const [clientePerfil, setClientePerfil] = useState<ClientePerfil | null>(
    null
  );
  const [avaliacoesMap, setAvaliacoesMap] = useState<AvaliacoesMap>({});
  const [carregando, setCarregando] = useState(true);

  const [rotaCoords, setRotaCoords] = useState<Coordenadas[]>([]);
  const [rotaInfo, setRotaInfo] = useState<RotaInfo | null>(null);
  const [carregandoRota, setCarregandoRota] = useState(false);

  const [seguindoCamera, setSeguindoCamera] = useState(true);
  const [headingAtual, setHeadingAtual] = useState(0);

  const [desbloqueandoWhatsapp, setDesbloqueandoWhatsapp] = useState(false);
  const [acaoMapaBloqueada, setAcaoMapaBloqueada] = useState(false);
  const [whatsappLiberadoHojeId, setWhatsappLiberadoHojeId] = useState("");
  const whatsappLiberadoHoje =
    !!profissionalSelecionado?.id &&
    whatsappLiberadoHojeId === profissionalSelecionado.id;

  const mapRef = useRef<MapView>(null);
  const intervalRotaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchUsuarioRef = useRef<Location.LocationSubscription | null>(null);

  const localAtualRef = useRef<Coordenadas | null>(null);
  const profissionalSelecionadoRef = useRef<Profissional | null>(null);
  const clienteSelecionadoRef = useRef<ClienteSelecionado | null>(null);
  const seguindoCameraRef = useRef(true);

  const animationFrameRef = useRef<number | null>(null);
  const animacaoInicioRef = useRef<number | null>(null);
  const origemAnimacaoRef = useRef<Coordenadas | null>(null);
  const destinoAnimacaoRef = useRef<Coordenadas | null>(null);
  const rotaStepsRef = useRef<RotaStep[]>([]);
  const stepAtualIndexRef = useRef(0);
  const ultimaInstrucaoFaladaRef = useRef("");
  const ultimoAvisoCurtoRef = useRef("");
  const ultimoAvisoLongoRef = useRef("");
  const distanciaAvisoStepRef = useRef<number | null>(null);

  const [vozAtiva, setVozAtiva] = useState(true);
  const [proximaInstrucao, setProximaInstrucao] = useState("");
  const [distanciaProximaInstrucao, setDistanciaProximaInstrucao] =
    useState<number | null>(null);
  const [coordenadaSnapNaVia, setCoordenadaSnapNaVia] =
    useState<Coordenadas | null>(null);
  const [distanciaForaDaRota, setDistanciaForaDaRota] =
    useState<number | null>(null);
  const [rerotando, setRerotando] = useState(false);
  const [aguardandoContextoTrajeto, setAguardandoContextoTrajeto] = useState(false);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [tracksViewMarcadores, setTracksViewMarcadores] = useState(true);
  const [proximoManeuver, setProximoManeuver] = useState("");

  const ultimaRerotaEmRef = useRef(0);
  const contagemForaDaRotaRef = useRef(0);
  const destinoRotaAtualRef = useRef<Coordenadas | null>(null);
  const ultimaPosicaoSuavizadaRef = useRef<Coordenadas | null>(null);
  const ultimoHeadingSuavizadoRef = useRef(0);
  const [animandoManobra, setAnimandoManobra] = useState(false);
  const [stepMudando, setStepMudando] = useState(false);

  const geocodeCacheRef = useRef<Record<string, Coordenadas>>({});
  const aberturaRapidaFeitaRef = useRef(false);
  const avaliacoesCarregadasRef = useRef(false);
  const ultimaChaveRotaRef = useRef("");
  const buscandoRotaRef = useRef(false);
  const liberandoWhatsappRef = useRef(false);
  const ultimaCameraEmRef = useRef(0);
  const ultimaChaveDestinoCameraRef = useRef("");
  const baseProfissionalFixoRef = useRef<Coordenadas | null>(null);
  const ultimaRotaPedidoEmRef = useRef(0);
  const ultimaOrigemRotaSucessoRef = useRef<{
    origemLat: number;
    origemLng: number;
    chaveDest: string;
  } | null>(null);
  const navegadorComInstrucaoVozRef = useRef(false);
  const ultimoFitClienteProFixoRef = useRef<{
    lat: number;
    lng: number;
    em: number;
  } | null>(null);
  const limparRotaRef = useRef<() => void>(() => {});
  const trajetoAtivoRef = useRef(false);
  const profissionaisRenderRef = useRef<Profissional[]>([]);

  const params = useLocalSearchParams<{
    profissionalId?: string;
    clienteId?: string;
    clienteLat?: string;
    clienteLng?: string;
    clienteNome?: string;
    pedidoStatus?: string;
    profLat?: string;
    profLng?: string;
    pedidoId?: string;
  }>();

  const clienteIdParam = params.clienteId ? String(params.clienteId) : "";
  const clienteLatParam = params.clienteLat ? Number(params.clienteLat) : null;
  const clienteLngParam = params.clienteLng ? Number(params.clienteLng) : null;
  const profLatParam = params.profLat ? Number(params.profLat) : null;
  const profLngParam = params.profLng ? Number(params.profLng) : null;
  const clienteNomeParam = params.clienteNome
    ? String(params.clienteNome)
    : "Cliente";
  const pedidoStatusParam: PedidoStatus = params.pedidoStatus
    ? (String(params.pedidoStatus) as PedidoStatus)
    : "";

  const [pedidoAtivoIdFallback, setPedidoAtivoIdFallback] = useState("");
  const [profissionalIdFallback, setProfissionalIdFallback] = useState("");
  const [clienteIdFallback, setClienteIdFallback] = useState("");
  const [clienteLatFallback, setClienteLatFallback] = useState<number | null>(null);
  const [clienteLngFallback, setClienteLngFallback] = useState<number | null>(null);
  const [clienteNomeFallback, setClienteNomeFallback] = useState("Cliente");
  const [pedidoStatusFallback, setPedidoStatusFallback] = useState<PedidoStatus>("");
  const [coordenadasEstabelecimentoFixo, setCoordenadasEstabelecimentoFixo] =
    useState<Coordenadas | null>(null);

  const profissionalIdAtivo = params.profissionalId
    ? String(params.profissionalId)
    : profissionalIdFallback;

  const clienteIdAtivo = clienteIdParam || clienteIdFallback;
  const clienteCoordsFromParamsValid = coordenadaValida(
    clienteLatParam,
    clienteLngParam
  );
  const clienteLatAtivo = clienteCoordsFromParamsValid
    ? clienteLatParam
    : clienteLatFallback;
  const clienteLngAtivo = clienteCoordsFromParamsValid
    ? clienteLngParam
    : clienteLngFallback;
  const clienteNomeAtivo = clienteNomeParam || clienteNomeFallback || "Cliente";
  const pedidoStatusAtivo: PedidoStatus = pedidoStatusParam || pedidoStatusFallback;

  const pedidoIdParam = params.pedidoId ? String(params.pedidoId) : "";
  const pedidoIdAtivo = (pedidoIdParam || pedidoAtivoIdFallback).trim();

  const clienteRotaPronto =
    !!clienteSelecionado &&
    coordenadaValida(clienteSelecionado.latitude, clienteSelecionado.longitude);

  const baseProfissionalFixo: Coordenadas | null = useMemo(() => {
    if (coordenadaValida(profLatParam, profLngParam)) {
      return {
        latitude: profLatParam as number,
        longitude: profLngParam as number,
      };
    }
    if (coordenadasEstabelecimentoFixo) {
      return coordenadasEstabelecimentoFixo;
    }
    return null;
  }, [profLatParam, profLngParam, coordenadasEstabelecimentoFixo]);

  useEffect(() => {
    baseProfissionalFixoRef.current = baseProfissionalFixo;
  }, [baseProfissionalFixo]);

  // 1. VALIDAÇÃO DE SEGURANÇA (O que você já tinha, mantive igual)
  useEffect(() => {
    const veioDoFluxoDeTrajeto =
      !!profissionalIdAtivo ||
      !!clienteIdParam ||
      coordenadaValida(clienteLatAtivo, clienteLngAtivo) ||
      pedidoStatusAtivo === "a_caminho" ||
      pedidoStatusAtivo === "cliente_a_caminho";

    if (!veioDoFluxoDeTrajeto) {
      setAguardandoContextoTrajeto(false);
      return;
    }

    const faltaContextoMinimo =
      !contaAtual ||
      !pedidoStatusAtivo ||
      (pedidoStatusAtivo === "cliente_a_caminho" || pedidoStatusAtivo === "a_caminho") &&
      !profissionalIdAtivo &&
      !clienteIdParam;

    if (faltaContextoMinimo) {
      setAguardandoContextoTrajeto(true);
      return;
    }

    const precisaProfissional = contaAtual?.tipo === "cliente" && !!profissionalIdAtivo;
    const precisaCliente = contaAtual?.tipo === "profissional" && (pedidoStatusAtivo === "a_caminho" || pedidoStatusAtivo === "cliente_a_caminho");

    if (precisaProfissional && !profissionalSelecionado) {
      setAguardandoContextoTrajeto(true);
      return;
    }

    if (precisaCliente && !clienteSelecionado && !coordenadaValida(clienteLatAtivo, clienteLngAtivo)) {
      setAguardandoContextoTrajeto(true);
      return;
    }

    setAguardandoContextoTrajeto(false);
  }, [
    contaAtual, profissionalSelecionado, clienteSelecionado, profissionalIdAtivo,
    clienteIdAtivo, clienteLatParam, clienteLngParam, pedidoStatusAtivo,
  ]);

  // --- 1. SINCRONIZADORES (Manter igual ao seu original) ---
  useEffect(() => { localAtualRef.current = localAtual; }, [localAtual]);
  useEffect(() => { profissionalSelecionadoRef.current = profissionalSelecionado; }, [profissionalSelecionado]);
  useEffect(() => { clienteSelecionadoRef.current = clienteSelecionado; }, [clienteSelecionado]);
  useEffect(() => { seguindoCameraRef.current = seguindoCamera; }, [seguindoCamera]);

  useEffect(() => {
    if (!mapaPronto) return;
    setTracksViewMarcadores(true);
    const id = setTimeout(() => setTracksViewMarcadores(false), 600);
    return () => clearTimeout(id);
  }, [mapaPronto]);

  // --- 4. AVALIAÇÕES ---
  useEffect(() => {
    if (!profissionais.length) return;
    avaliacoesCarregadasRef.current = false;
    carregarAvaliacoes();
  }, [profissionais]);

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

  function planoDoProfissional(plano?: string) {
    const p = String(plano || "gratuito").toLowerCase();
    if (p === "turbo") return "turbo";
    if (p === "mensal") return "mensal";
    return "gratuito";
  }


  function prioridadePlano(plano?: string) {
    const p = planoDoProfissional(plano);
    if (p === "turbo") return 1;
    if (p === "mensal") return 2;
    return 3;
  }

  function raioMaximoPorPlano(plano?: string) {
    const p = planoDoProfissional(plano);
    if (p === "turbo") return 8;
    if (p === "mensal") return 8;
    return 6;
  }

  
  function podeAtualizarCamera(intervaloMs = 900) {
    const agora = Date.now();
    if (agora - ultimaCameraEmRef.current < intervaloMs) {
      return false;
    }
    ultimaCameraEmRef.current = agora;
    return true;
  }

  function chaveCoordenadas(
    origem?: Coordenadas | null,
    destino?: Coordenadas | null
  ) {
    if (!origem || !destino) return "";
    return [
      origem.latitude.toFixed(5),
      origem.longitude.toFixed(5),
      destino.latitude.toFixed(5),
      destino.longitude.toFixed(5),
    ].join("|");
  }

  function whatsappDiretoLiberado(prof?: Profissional | null) {
    if (!prof) return false;
    return planoDoProfissional(prof.plano) !== "gratuito";
  }

  async function liberarWhatsappPorAnuncio() {
    if (!profissionalSelecionado?.id) return;
    if (desbloqueandoWhatsapp || acaoMapaBloqueada || liberandoWhatsappRef.current) return;

    if (!String(profissionalSelecionado.telefone || "").trim()) {
      Alert.alert(
        "WhatsApp indisponível",
        "Esse profissional ainda não cadastrou um telefone válido."
      );
      return;
    }

    Alert.alert(
      "Desbloquear WhatsApp",
      "Esse profissional está no plano gratuito. Ao continuar, o sistema vai validar sua liberação diária.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Continuar",
          onPress: async () => {
            try {
              liberandoWhatsappRef.current = true;
              setDesbloqueandoWhatsapp(true);
              setAcaoMapaBloqueada(true);

              const fn = httpsCallable<
                { profissionalId: string },
                {
                  ok?: boolean;
                  liberado?: boolean;
                  premium?: boolean;
                  motivo?: string;
                }
              >(functions, "liberarWhatsappDiario");

              const result = await safeRequest(
                () =>
                  fn({
                    profissionalId: profissionalSelecionado.id,
                  }),
                {
                  timeoutMs: 20000,
                  tentativas: 1,
                  exigirInternet: true,
                  dedupeKey: `mapa:wpp:${profissionalSelecionado.id}`,
                  priority: 10,
                }
              );

              if (!result.data?.liberado) {
                Alert.alert(
                  "Limite diário atingido",
                  "Você já usou sua liberação diária de WhatsApp hoje. Tente novamente amanhã ou assine o premium."
                );
                return;
              }

              Alert.alert(
                "WhatsApp liberado",
                "Contato liberado com sucesso para hoje."
              );

              setWhatsappLiberadoHojeId(profissionalSelecionado.id);
              abrirWhatsapp(profissionalSelecionado.telefone);
              logEvent(
                "mapa_whatsapp_liberado",
                { profissionalId: profissionalSelecionado.id },
                "Mapa"
              );
            } catch (error) {
              logError(error, "Mapa.liberarWhatsappPorAnuncio");
              handleError(error, "Mapa.liberarWhatsappPorAnuncio");
              Alert.alert("Erro", "Não foi possível liberar agora.");
            } finally {
              liberandoWhatsappRef.current = false;
              setDesbloqueandoWhatsapp(false);
              setTimeout(() => setAcaoMapaBloqueada(false), 1200);
            }
          },
        },
      ]
    );
  }

  function limparRota() {
    setRotaCoords([]);
    setRotaInfo(null);
    setCoordenadaSnapNaVia(null);
    setDistanciaForaDaRota(null);
    setRerotando(false);
    setProximoManeuver("");
    contagemForaDaRotaRef.current = 0;
    destinoRotaAtualRef.current = null;
    ultimaChaveDestinoCameraRef.current = "";
    ultimaOrigemRotaSucessoRef.current = null;
    ultimoFitClienteProFixoRef.current = null;
    resetarNavegacaoVoz();

    if (intervalRotaRef.current) {
      clearInterval(intervalRotaRef.current);
      intervalRotaRef.current = null;
    }
  }

  limparRotaRef.current = limparRota;

  function pararRastreamentoUsuario() {
    if (watchUsuarioRef.current) {
      watchUsuarioRef.current.remove();
      watchUsuarioRef.current = null;
    }
  }

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


  function interpolar(valorAtual: number, valorNovo: number, fator = 0.18) {
    return valorAtual + (valorNovo - valorAtual) * fator;
  }

  function suavizarCoordenada(destino: Coordenadas) {
    const anterior = ultimaPosicaoSuavizadaRef.current;

    if (!anterior) {
      ultimaPosicaoSuavizadaRef.current = destino;
      return destino;
    }

    const distanciaMetros =
      calcularDistanciaKm(
        anterior.latitude,
        anterior.longitude,
        destino.latitude,
        destino.longitude
      ) * 1000;

    const fator = distanciaMetros > 60 ? 0.55 : distanciaMetros > 20 ? 0.3 : 0.18;

    const suavizada = {
      latitude: interpolar(anterior.latitude, destino.latitude, fator),
      longitude: interpolar(anterior.longitude, destino.longitude, fator),
    };

    ultimaPosicaoSuavizadaRef.current = suavizada;
    return suavizada;
  }

  function normalizarAngulo(angulo: number) {
    let valor = angulo % 360;
    if (valor < 0) valor += 360;
    return valor;
  }

  function suavizarHeading(novoHeading: number) {
    const atual = ultimoHeadingSuavizadoRef.current || 0;
    let delta = ((novoHeading - atual + 540) % 360) - 180;
    const suavizado = normalizarAngulo(atual + delta * 0.22);
    ultimoHeadingSuavizadoRef.current = suavizado;
    return suavizado;
  }

  function iconeManobra(maneuver?: string, instrucao?: string) {
    const valor = `${maneuver || ""} ${instrucao || ""}`.toLowerCase();
    if (valor.includes("uturn") || valor.includes("retorno")) return "↩";
    if (valor.includes("slight-left") || valor.includes("mantenha-se à esquerda")) return "⬃";
    if (valor.includes("slight-right") || valor.includes("mantenha-se à direita")) return "⬂";
    if (valor.includes("left")) return "←";
    if (valor.includes("right")) return "→";
    if (valor.includes("merge")) return "⇆";
    if (valor.includes("roundabout")) return "⟳";
    return "↑";
  }

  function textoLanePremium(instrucao?: string, maneuver?: string) {
    const valor = `${instrucao || ""} ${maneuver || ""}`.toLowerCase();
    if (valor.includes("mantenha-se à esquerda")) return "Faixa ideal: esquerda";
    if (valor.includes("mantenha-se à direita")) return "Faixa ideal: direita";
    if (valor.includes("left")) return "Prepare-se para a esquerda";
    if (valor.includes("right")) return "Prepare-se para a direita";
    return "Siga pela faixa central";
  }

  function limparTextoInstrucao(html: string) {
    return String(html || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function capitalizar(texto: string) {
    const valor = String(texto || "").trim();
    if (!valor) return "";
    return valor.charAt(0).toUpperCase() + valor.slice(1);
  }

  function arredondarDistanciaFalado(metros: number) {
    if (metros <= 30) return 30;
    if (metros <= 50) return 50;
    if (metros <= 75) return 70;
    if (metros <= 100) return 100;
    if (metros <= 150) return 150;
    if (metros <= 200) return 200;
    if (metros <= 300) return 300;
    if (metros <= 500) return 500;
    return Math.round(metros / 100) * 100;
  }

  function normalizarInstrucaoVoz(instrucao: string, maneuver?: string) {
    let texto = String(instrucao || "").trim();

    if (!texto) return "";

    const viaMatch = texto.match(/na rotatória, pegue a ([0-9ªºa]+) saída/i);
    if (viaMatch?.[1]) {
      return `na rotatória, pegue a ${viaMatch[1]} saída`;
    }

    const replacements: Array<[RegExp, string]> = [
      [/siga para o norte/gi, "siga em frente"],
      [/siga para o sul/gi, "siga em frente"],
      [/siga para o leste/gi, "siga em frente"],
      [/siga para o oeste/gi, "siga em frente"],
      [/continue em frente/gi, "siga em frente"],
      [/continue reto/gi, "siga em frente"],
      [/vire levemente à esquerda/gi, "vire um pouco à esquerda"],
      [/vire levemente à direita/gi, "vire um pouco à direita"],
      [/faça uma curva fechada à esquerda/gi, "faça o retorno à esquerda"],
      [/faça uma curva fechada à direita/gi, "faça o retorno à direita"],
      [/pegue a rampa/gi, "pegue a entrada"],
      [/mantenha-se à esquerda/gi, "mantenha-se à esquerda"],
      [/mantenha-se à direita/gi, "mantenha-se à direita"],
      [/o destino estará à esquerda/gi, "o destino fica à esquerda"],
      [/o destino estará à direita/gi, "o destino fica à direita"],
    ];

    replacements.forEach(([regex, value]) => {
      texto = texto.replace(regex, value);
    });

    if (maneuver === "turn-right" && !/direita/i.test(texto)) {
      texto = `vire à direita ${texto}`.trim();
    }

    if (maneuver === "turn-left" && !/esquerda/i.test(texto)) {
      texto = `vire à esquerda ${texto}`.trim();
    }

    if (maneuver === "straight" && !/siga em frente/i.test(texto)) {
      texto = `siga em frente ${texto}`.trim();
    }

    texto = texto
      .replace(/^siga em frente para permanecer em/gi, "siga em frente em")
      .replace(/^destino/gi, "seu destino")
      .replace(/\s+/g, " ")
      .trim();

    return texto.replace(/[.]$/, "");
  }

  function montarFraseDeAviso(instrucao: string, metros?: number | null) {
    const texto = normalizarInstrucaoVoz(instrucao);

    if (!texto) return "";

    if (!metros || metros <= 0) {
      return capitalizar(texto);
    }

    return `Em ${arredondarDistanciaFalado(metros)} metros, ${texto}`;
  }

  function resetarNavegacaoVoz() {
    rotaStepsRef.current = [];
    stepAtualIndexRef.current = 0;
    ultimaInstrucaoFaladaRef.current = "";
    distanciaAvisoStepRef.current = null;
    setProximaInstrucao("");
    setDistanciaProximaInstrucao(null);
    setProximoManeuver("");
    try {
      Speech.stop();
    } catch {}
  }

  async function falarInstrucao(instrucao: string) {
    if (!navegadorComInstrucaoVozRef.current) return;
    if (!vozAtiva) return;

    const texto = capitalizar(String(instrucao || "").trim());
    if (!texto) return;
    if (ultimaInstrucaoFaladaRef.current === texto) return;

    ultimaInstrucaoFaladaRef.current = texto;

    try {
      const falando = await Speech.isSpeakingAsync();
      if (falando) {
        await Speech.stop();
      }

      Speech.speak(texto, {
        language: "pt-BR",
        pitch: 1.0,
        rate: 0.92,
      });
    } catch (error) {
      handleError(error, "Mapa.falarInstrucao");
    }
  }

  function atualizarNavegacaoPorVoz(origem?: Coordenadas | null) {
    if (!navegadorComInstrucaoVozRef.current) return;

    const local = origem || localAtualRef.current;
    const steps = rotaStepsRef.current;

    if (!local || !steps.length) return;

    let indice = stepAtualIndexRef.current;
    if (indice >= steps.length) return;

    const stepAtual = steps[indice];
    const distanciaFimMetros =
      calcularDistanciaKm(
        local.latitude,
        local.longitude,
        stepAtual.endLocation.latitude,
        stepAtual.endLocation.longitude
      ) * 1000;

    const instrucaoAtual = normalizarInstrucaoVoz(
      stepAtual.instruction,
      stepAtual.maneuver
    );

    setProximaInstrucao(capitalizar(instrucaoAtual));
    setDistanciaProximaInstrucao(Math.max(0, Math.round(distanciaFimMetros)));

    if (!vozAtiva) return;

    if (indice === 0 && ultimaInstrucaoFaladaRef.current === "") {
      const fraseInicial =
        stepAtual.distanceMeters > 120
          ? `Inicie o trajeto. ${fraseNaturalLonga(instrucaoAtual, Math.min(stepAtual.distanceMeters, 300))}`
          : capitalizar(instrucaoAtual);

      falarInstrucao(fraseInicial);
      ultimoAvisoLongoRef.current = fraseInicial;
      distanciaAvisoStepRef.current = arredondarDistanciaFalado(
        Math.max(30, stepAtual.distanceMeters)
      );
      return;
    }

    if (distanciaFimMetros <= 14) {
      stepAtualIndexRef.current = indice + 1;
      ultimoAvisoCurtoRef.current = "";
      ultimoAvisoLongoRef.current = "";

      if (stepAtualIndexRef.current >= steps.length) {
        setProximaInstrucao("Você chegou ao destino");
        setDistanciaProximaInstrucao(0);
        falarInstrucao("Você chegou ao destino");
        return;
      }

      const proximo = steps[stepAtualIndexRef.current];
      distanciaAvisoStepRef.current = null;

      setStepMudando(true);
      setAnimandoManobra(true);
      setTimeout(() => setStepMudando(false), 900);
      setTimeout(() => setAnimandoManobra(false), 1800);

      const fraseProxima = fraseNaturalLonga(
        normalizarInstrucaoVoz(proximo.instruction, proximo.maneuver),
        Math.max(40, Math.min(proximo.distanceMeters, 200))
      );
      falarInstrucao(fraseProxima);
      ultimoAvisoLongoRef.current = fraseProxima;
      return;
    }

    const thresholds = [300, 200, 120, 80, 50, 30].filter(
      (valor) => valor < Math.max(stepAtual.distanceMeters, 35)
    );

    const proximoAviso = thresholds.find(
      (valor) =>
        distanciaFimMetros <= valor && distanciaAvisoStepRef.current !== valor
    );

    if (typeof proximoAviso === "number") {
      distanciaAvisoStepRef.current = proximoAviso;
      const frase = fraseNaturalLonga(instrucaoAtual, proximoAviso);
      if (ultimoAvisoLongoRef.current !== frase) {
        ultimoAvisoLongoRef.current = frase;
        falarInstrucao(frase);
      }
      return;
    }

    if (distanciaFimMetros <= 18) {
      const fraseCurta = fraseNaturalCurta(instrucaoAtual);
      if (ultimoAvisoCurtoRef.current !== fraseCurta) {
        ultimoAvisoCurtoRef.current = fraseCurta;
        falarInstrucao(fraseCurta);
      }
    }
  }

  function encontrarIndiceMaisProximo(
    coords: Coordenadas[],
    referencia: Coordenadas | null
  ) {
    if (!referencia || !coords.length) return 0;

    let menorDistancia = Number.POSITIVE_INFINITY;
    let melhorIndice = 0;

    coords.forEach((coord, index) => {
      const distancia = calcularDistanciaKm(
        referencia.latitude,
        referencia.longitude,
        coord.latitude,
        coord.longitude
      );

      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        melhorIndice = index;
      }
    });

    return melhorIndice;
  }

  function calcularBearing(origem: Coordenadas, destino: Coordenadas) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const toDeg = (value: number) => (value * 180) / Math.PI;

    const lat1 = toRad(origem.latitude);
    const lat2 = toRad(destino.latitude);
    const dLng = toRad(destino.longitude - origem.longitude);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function projetarCoordenadaEmPlano(coord: Coordenadas, latitudeBase: number) {
    const metrosPorGrauLat = 110540;
    const metrosPorGrauLng = 111320 * Math.cos((latitudeBase * Math.PI) / 180);

    return {
      x: coord.longitude * metrosPorGrauLng,
      y: coord.latitude * metrosPorGrauLat,
    };
  }

  function encontrarPontoMaisProximoNaRota(
    coords: Coordenadas[],
    referencia: Coordenadas
  ) {
    if (!coords.length) {
      return {
        ponto: referencia,
        distanciaMetros: Number.POSITIVE_INFINITY,
        indiceBase: 0,
      };
    }

    if (coords.length === 1) {
      return {
        ponto: coords[0],
        distanciaMetros:
          calcularDistanciaKm(
            referencia.latitude,
            referencia.longitude,
            coords[0].latitude,
            coords[0].longitude
          ) * 1000,
        indiceBase: 0,
      };
    }

    const latitudeBase = referencia.latitude;
    const pontoReferencia = projetarCoordenadaEmPlano(referencia, latitudeBase);

    let melhor = {
      ponto: coords[0],
      distanciaMetros: Number.POSITIVE_INFINITY,
      indiceBase: 0,
    };

    for (let i = 0; i < coords.length - 1; i += 1) {
      const inicio = projetarCoordenadaEmPlano(coords[i], latitudeBase);
      const fim = projetarCoordenadaEmPlano(coords[i + 1], latitudeBase);

      const dx = fim.x - inicio.x;
      const dy = fim.y - inicio.y;
      const comprimento2 = dx * dx + dy * dy;
      const t =
        comprimento2 === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((pontoReferencia.x - inicio.x) * dx +
                  (pontoReferencia.y - inicio.y) * dy) /
                  comprimento2
              )
            );

      const x = inicio.x + dx * t;
      const y = inicio.y + dy * t;
      const distancia = Math.sqrt(
        Math.pow(pontoReferencia.x - x, 2) + Math.pow(pontoReferencia.y - y, 2)
      );

      if (distancia < melhor.distanciaMetros) {
        melhor = {
          ponto: {
            latitude:
              coords[i].latitude +
              (coords[i + 1].latitude - coords[i].latitude) * t,
            longitude:
              coords[i].longitude +
              (coords[i + 1].longitude - coords[i].longitude) * t,
          },
          distanciaMetros: distancia,
          indiceBase: i,
        };
      }
    }

    return melhor;
  }

  function obterDestinoAtual(): Coordenadas | null {
    if (
      (rotaClienteIndoAteProfissionalFixo ||
        rotaClienteAcompanhandoProfissionalMovel) &&
      profissionalSelecionadoRef.current &&
      coordenadaValida(
        profissionalSelecionadoRef.current.latitude,
        profissionalSelecionadoRef.current.longitude
      )
    ) {
      return {
        latitude: profissionalSelecionadoRef.current.latitude as number,
        longitude: profissionalSelecionadoRef.current.longitude as number,
      };
    }

    if (
      (rotaProfissionalAcompanhandoClienteFixo ||
        rotaProfissionalIndoAteClienteMovel) &&
      clienteSelecionadoRef.current &&
      coordenadaValida(
        clienteSelecionadoRef.current.latitude,
        clienteSelecionadoRef.current.longitude
      )
    ) {
      return {
        latitude: clienteSelecionadoRef.current.latitude,
        longitude: clienteSelecionadoRef.current.longitude,
      };
    }

    return null;
  }

  function deveGuiarPeloUsuarioAtual() {
    return rotaClienteIndoAteProfissionalFixo || rotaProfissionalIndoAteClienteMovel;
  }

  function easeInOutCubic(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function animarAteNovaPosicao(destino: Coordenadas) {
    const origem = localAtualRef.current;

    if (!origem) {
      setLocalAtual(destino);
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    origemAnimacaoRef.current = origem;
    destinoAnimacaoRef.current = destino;
    animacaoInicioRef.current = null;

    const distancia = calcularDistanciaKm(
      origem.latitude,
      origem.longitude,
      destino.latitude,
      destino.longitude
    );

    const duracao = Math.min(1800, Math.max(600, distancia * 20000));

    const step = (timestamp: number) => {
      if (!origemAnimacaoRef.current || !destinoAnimacaoRef.current) return;

      if (animacaoInicioRef.current === null) {
        animacaoInicioRef.current = timestamp;
      }

      const tempoDecorrido = timestamp - animacaoInicioRef.current;
      const progressoBruto = Math.min(tempoDecorrido / duracao, 1);
      const progresso = easeInOutCubic(progressoBruto);

      const novaLatitude =
        origemAnimacaoRef.current.latitude +
        (destinoAnimacaoRef.current.latitude -
          origemAnimacaoRef.current.latitude) *
          progresso;

      const novaLongitude =
        origemAnimacaoRef.current.longitude +
        (destinoAnimacaoRef.current.longitude -
          origemAnimacaoRef.current.longitude) *
          progresso;

      setLocalAtual({
        latitude: novaLatitude,
        longitude: novaLongitude,
      });

      if (progressoBruto < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
        origemAnimacaoRef.current = null;
        destinoAnimacaoRef.current = null;
        animacaoInicioRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }

  async function iniciarRastreamentoUsuario() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      pararRastreamentoUsuario();

      watchUsuarioRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 4500,
          distanceInterval: 8,
        },
        (pos) => {
          const latitude = pos.coords.latitude;
          const longitude = pos.coords.longitude;

          if (!coordenadaValida(latitude, longitude)) return;

          const destinoSuavizado = suavizarCoordenada({ latitude, longitude });
          animarAteNovaPosicao(destinoSuavizado);

          if (
            typeof pos.coords.heading === "number" &&
            Number.isFinite(pos.coords.heading) &&
            pos.coords.heading >= 0
          ) {
            setHeadingAtual(suavizarHeading(pos.coords.heading));
          }
        }
      );
    } catch (error) {
      console.log("Erro ao iniciar rastreamento:", error);
    }
  }

  const rotaClienteIndoAteProfissionalFixo =
    contaAtual?.tipo === "cliente" &&
    profissionalSelecionado?.tipoAtendimento === "fixo" &&
    pedidoStatusAtivo === "cliente_a_caminho";

  const rotaClienteAcompanhandoProfissionalMovel =
    contaAtual?.tipo === "cliente" &&
    profissionalSelecionado?.tipoAtendimento === "movel" &&
    pedidoStatusAtivo === "a_caminho";

  const rotaProfissionalAcompanhandoClienteFixo =
    contaAtual?.tipo === "profissional" &&
    contaAtual?.tipoAtendimento === "fixo" &&
    !!clienteSelecionado &&
    pedidoStatusAtivo === "cliente_a_caminho";

  const rotaProfissionalIndoAteClienteMovel =
    contaAtual?.tipo === "profissional" &&
    contaAtual?.tipoAtendimento === "movel" &&
    !!clienteSelecionado &&
    pedidoStatusAtivo === "a_caminho";

  const trajetoAtivo =
    rotaClienteIndoAteProfissionalFixo ||
    rotaClienteAcompanhandoProfissionalMovel ||
    rotaProfissionalAcompanhandoClienteFixo ||
    rotaProfissionalIndoAteClienteMovel;

  trajetoAtivoRef.current = trajetoAtivo;

  const navegacaoComVozNavegador =
    rotaClienteIndoAteProfissionalFixo || rotaProfissionalIndoAteClienteMovel;
  const motoristaDaRota = navegacaoComVozNavegador;

  useEffect(() => {
    navegadorComInstrucaoVozRef.current = navegacaoComVozNavegador;
    if (!navegacaoComVozNavegador) {
      try {
        Speech.stop();
      } catch {}
      resetarNavegacaoVoz();
    }
  }, [navegacaoComVozNavegador]);

  useEffect(() => {
    // Voz TTS habilitada apenas para quem está dirigindo no fluxo atual.
    if (!motoristaDaRota && vozAtiva) {
      setVozAtiva(false);
    }
  }, [motoristaDaRota, vozAtiva]);

  function seguirUsuarioNoMapa() {
    if (!mapRef.current) return;
    if (!seguindoCameraRef.current) return;
    if (!mapaPronto) return;

    const centro =
      rotaProfissionalAcompanhandoClienteFixo && clienteSelecionadoRef.current
        ? {
            latitude: clienteSelecionadoRef.current.latitude,
            longitude: clienteSelecionadoRef.current.longitude,
          }
        : coordenadaSnapNaVia || localAtualRef.current;

    if (!centro) return;
    if (!podeAtualizarCamera()) return;

    const usandoBaseFixa = false;

    const distanciaCurva =
      typeof distanciaProximaInstrucao === "number" &&
      Number.isFinite(distanciaProximaInstrucao)
        ? distanciaProximaInstrucao
        : null;

    const pertoDaCurva =
      distanciaCurva !== null &&
      distanciaCurva <= 120 &&
      proximaInstrucao &&
      !/chegou ao destino/i.test(proximaInstrucao);

    mapRef.current.animateCamera(
      {
        center: {
          latitude: centro.latitude,
          longitude: centro.longitude,
        },
        pitch: trajetoAtivo ? (pertoDaCurva ? 64 : 55) : 0,
        heading: usandoBaseFixa ? 0 : headingAtual || 0,
        zoom: trajetoAtivo ? (pertoDaCurva ? 19.4 : 18) : 16,
        altitude: pertoDaCurva ? 520 : 800,
      },
      { duration: 1100 }
    );
  }

  function pegarGoogleMapsApiKey() {
    const expoConfig = (Constants as any)?.expoConfig ?? {};
    const manifest2Extra = (Constants as any)?.manifest2?.extra ?? {};
    const expoClientExtra = manifest2Extra?.expoClient?.extra ?? {};

    return (
      expoConfig?.extra?.googleMapsApiKey ||
      expoConfig?.android?.config?.googleMaps?.apiKey ||
      expoConfig?.ios?.config?.googleMapsApiKey ||
      manifest2Extra?.googleMapsApiKey ||
      expoClientExtra?.googleMapsApiKey ||
      ""
    );
  }

  async function fetchJsonSingleRead(url: string, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      const rawText = await response.text();
      let data: any = null;

      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch (parseError) {
          throw new Error(
            `Resposta inválida da API (${response.status}): ${rawText.slice(0, 180)}`
          );
        }
      }

      if (!response.ok) {
        const erroApi =
          data?.error_message ||
          data?.status ||
          `Falha HTTP ${response.status}`;
        throw new Error(String(erroApi));
      }

      return { response, data };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function decodificarPolyline(encoded: string) {
    const poly: Coordenadas[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += deltaLat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += deltaLng;

      poly.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return poly;
  }

  async function buscarCoordenadasEndereco(enderecoCompleto: string) {
    try {
      const chave = String(enderecoCompleto || "").trim().toLowerCase();
      if (chave && geocodeCacheRef.current[chave]) {
        return geocodeCacheRef.current[chave];
      }
      const googleMapsApiKey = pegarGoogleMapsApiKey();

      if (googleMapsApiKey) {
        const url =
          `https://maps.googleapis.com/maps/api/geocode/json?address=` +
          `${encodeURIComponent(enderecoCompleto)}` +
          `&language=pt-BR&region=br&key=${googleMapsApiKey}`;

        const { data } = await fetchJsonSingleRead(url, 20000);

        if (
          data?.status === "OK" &&
          Array.isArray(data.results) &&
          data.results.length > 0
        ) {
          const location = data.results[0]?.geometry?.location;

          if (coordenadaValida(location?.lat, location?.lng)) {
            const coords = {
              latitude: location.lat,
              longitude: location.lng,
            };
            if (chave) geocodeCacheRef.current[chave] = coords;
            return coords;
          }
        }
      }

      const resultado = await Location.geocodeAsync(enderecoCompleto);

      if (!resultado.length) return null;

      const latitude = resultado[0].latitude;
      const longitude = resultado[0].longitude;

      if (!coordenadaValida(latitude, longitude)) return null;

      const coords = { latitude, longitude };
      if (chave) geocodeCacheRef.current[chave] = coords;
      return coords;
    } catch (error) {
      handleError(error, "Mapa.buscarCoordenadasEndereco");
      return null;
    }
  }

  useEffect(() => {
    if (!contaAtual || contaAtual.tipo !== "profissional" || contaAtual.tipoAtendimento !== "fixo") {
      setCoordenadasEstabelecimentoFixo(null);
      return;
    }

    const contaFixa = contaAtual;

    if (coordenadaValida(profLatParam, profLngParam)) {
      setCoordenadasEstabelecimentoFixo({
        latitude: profLatParam as number,
        longitude: profLngParam as number,
      });
      return;
    }

    let cancelado = false;

    async function resolverEstabelecimento() {
      const endereco = String(contaFixa.endereco || "").trim();
      const cidade = String(contaFixa.cidade || "").trim();

      if (endereco && cidade) {
        const coords = await buscarCoordenadasEndereco(`${endereco}, ${cidade}`);
        if (!cancelado && coords) {
          setCoordenadasEstabelecimentoFixo(coords);
          return;
        }
      }

      if (
        !cancelado &&
        coordenadaValida(contaFixa.latitude, contaFixa.longitude)
      ) {
        setCoordenadasEstabelecimentoFixo({
          latitude: contaFixa.latitude as number,
          longitude: contaFixa.longitude as number,
        });
        return;
      }

      if (!cancelado) {
        setCoordenadasEstabelecimentoFixo(null);
      }
    }

    resolverEstabelecimento();

    return () => {
      cancelado = true;
    };
  }, [
    contaAtual?.id,
    contaAtual?.tipo,
    contaAtual?.tipoAtendimento,
    contaAtual?.endereco,
    contaAtual?.cidade,
    contaAtual?.latitude,
    contaAtual?.longitude,
    profLatParam,
    profLngParam,
  ]);

  useEffect(() => {
    if (!pedidoIdAtivo) return;
    if (!rotaProfissionalAcompanhandoClienteFixo && !rotaProfissionalIndoAteClienteMovel) {
      return;
    }

    const refPedido = doc(db, "pedidos", pedidoIdAtivo);
    const unsub = onSnapshot(refPedido, (snap) => {
      if (!snap.exists()) return;

      const d = snap.data() as any;
      if (!coordenadaValida(d.latitudeCliente, d.longitudeCliente)) return;

      const lat = Number(d.latitudeCliente);
      const lng = Number(d.longitudeCliente);

      setClienteSelecionado((prev) => {
        const idCliente =
          String(d.clienteId || prev?.id || clienteIdAtivo || "").trim() ||
          clienteIdAtivo;
        const nome = String(
          d.nomeCliente || prev?.nome || clienteNomeAtivo || "Cliente"
        ).trim();

        return {
          id: idCliente,
          latitude: lat,
          longitude: lng,
          nome,
          fotoPerfil: prev?.fotoPerfil,
        };
      });

      if (!rotaProfissionalAcompanhandoClienteFixo) {
        return;
      }

      const agora = Date.now();
      if (agora - ultimaRotaPedidoEmRef.current < 4200) return;
      ultimaRotaPedidoEmRef.current = agora;

      const base = baseProfissionalFixoRef.current;
      if (base && coordenadaValida(base.latitude, base.longitude)) {
        buscarRotaNoApp(lat, lng, base.latitude, base.longitude).catch(() => {});
      }
    });

    return () => unsub();
  }, [
    pedidoIdAtivo,
    rotaProfissionalAcompanhandoClienteFixo,
    rotaProfissionalIndoAteClienteMovel,
    clienteIdAtivo,
    clienteNomeAtivo,
  ]);

  function distanciaTextoDoProfissional(prof: Profissional) {
    if (!localAtual || !coordenadaValida(prof.latitude, prof.longitude)) {
      return "Sem distância";
    }

    const km = calcularDistanciaKm(
      localAtual.latitude,
      localAtual.longitude,
      prof.latitude as number,
      prof.longitude as number
    );

    return `${km.toFixed(1)} km`;
  }

  async function carregarAvaliacoes() {
    try {
      if (avaliacoesCarregadasRef.current) return;

      const mapaFinal: AvaliacoesMap = {};
      const idsSemResumo: string[] = [];

      profissionais.forEach((prof) => {
        const dadosProf = prof as any;
        const media =
          Number(dadosProf.mediaAvaliacoes || dadosProf.media || 0);
        const total =
          Number(dadosProf.totalAvaliacoes || dadosProf.total || 0);

        if (media > 0 && total > 0) {
          mapaFinal[prof.id] = { media, total };
        } else {
          idsSemResumo.push(prof.id);
        }
      });

      if (idsSemResumo.length) {
        const snap = await getDocs(collection(db, "avaliacoes"));
        const agrupado: Record<string, number[]> = {};

        snap.docs.forEach((docSnap) => {
          const dados = docSnap.data() as any;
          const profissionalId = String(dados.profissionalId || "");
          const nota = Number(dados.nota || 0);

          if (!profissionalId || nota <= 0) return;
          if (!idsSemResumo.includes(profissionalId)) return;

          if (!agrupado[profissionalId]) {
            agrupado[profissionalId] = [];
          }

          agrupado[profissionalId].push(nota);
        });

        Object.keys(agrupado).forEach((profissionalId) => {
          const notas = agrupado[profissionalId];
          const soma = notas.reduce((acc, nota) => acc + nota, 0);
          const media = soma / notas.length;

          mapaFinal[profissionalId] = {
            media,
            total: notas.length,
          };
        });
      }

      setAvaliacoesMap(mapaFinal);
      avaliacoesCarregadasRef.current = true;
    } catch (error) {
      handleError(error, "Mapa.carregarAvaliacoes");
    }
  }


  async function carregarContextoPedidoAtivo(userId: string) {
    try {
      const snapUser = await getDoc(doc(db, "users", userId));

      if (!snapUser.exists()) return;

      const dadosUser = snapUser.data() as UserBase;
      let pedidoAtivoId = String(dadosUser.pedidoAtivoId || "").trim();
      const tipoAtual = String(((snapUser.data() as any)?.tipo || "")).trim();

      async function limparContextoTravado() {
        setPedidoAtivoIdFallback("");
        setProfissionalIdFallback("");
        setClienteIdFallback("");
        setClienteLatFallback(null);
        setClienteLngFallback(null);
        setClienteNomeFallback("Cliente");
        setPedidoStatusFallback("");

        await setDoc(
          doc(db, "users", userId),
          { pedidoAtivoId: null, emAtendimento: false },
          { merge: true }
        );
      }

      if (!pedidoAtivoId) {
        if (tipoAtual === "cliente") {
          const q = query(
            collection(db, "pedidos"),
            where("clienteId", "==", userId)
          );
          const snapPedidos = await getDocs(q);
          const pedidoAtivo = snapPedidos.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .find((pedido: any) => pedidoEhAtivo(pedido.status));

          if (pedidoAtivo?.id) {
            pedidoAtivoId = pedidoAtivo.id;
            await setDoc(
              doc(db, "users", userId),
              { pedidoAtivoId, emAtendimento: true },
              { merge: true }
            );
          }
        } else if (tipoAtual === "profissional") {
          const q = query(
            collection(db, "pedidos"),
            where("profissionalId", "==", userId)
          );
          const snapPedidos = await getDocs(q);
          const pedidoAtivo = snapPedidos.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .find((pedido: any) => pedidoEhAtivo(pedido.status));

          if (pedidoAtivo?.id) {
            pedidoAtivoId = pedidoAtivo.id;
            await setDoc(
              doc(db, "users", userId),
              { pedidoAtivoId, emAtendimento: true },
              { merge: true }
            );
          }
        }
      }

      if (!pedidoAtivoId) {
        await limparContextoTravado();
        return;
      }

      setPedidoAtivoIdFallback(pedidoAtivoId);

      const snapPedidoAtivo = await getDoc(doc(db, "pedidos", pedidoAtivoId));
      if (!snapPedidoAtivo.exists()) {
        await limparContextoTravado();
        return;
      }

      const pedido = snapPedidoAtivo.data() as any;

      if (!pedidoEhAtivo(pedido.status)) {
        await limparContextoTravado();
        return;
      }

      setPedidoStatusFallback((pedido.status || "") as PedidoStatus);
      if (!params.profissionalId && pedido.profissionalId) {
        setProfissionalIdFallback(String(pedido.profissionalId));
      }
      if (!clienteIdParam && pedido.clienteId) {
        setClienteIdFallback(String(pedido.clienteId));
      }
      if (
        !coordenadaValida(clienteLatParam, clienteLngParam) &&
        coordenadaValida(pedido.latitudeCliente, pedido.longitudeCliente)
      ) {
        setClienteLatFallback(Number(pedido.latitudeCliente));
        setClienteLngFallback(Number(pedido.longitudeCliente));
      }
      if (!clienteNomeParam && pedido.nomeCliente) {
        setClienteNomeFallback(String(pedido.nomeCliente));
      }
    } catch (error) {
      console.log("Erro ao carregar contexto do pedido ativo:", error);
    }
  }

  async function carregarContaELocal() {
    try {
      const user = auth.currentUser;

      if (user) {
        try {
          const snapConta = await getDoc(doc(db, "users", user.uid));
          if (snapConta.exists()) {
            const contaData = {
              id: snapConta.id,
              ...(snapConta.data() as any),
            };
            setContaAtual(contaData);
            await carregarContextoPedidoAtivo(user.uid);

            if (coordenadaValida(clienteLatAtivo, clienteLngAtivo)) {
              setClienteSelecionado({
                id: clienteIdAtivo || undefined,
                latitude: clienteLatAtivo as number,
                longitude: clienteLngAtivo as number,
                nome: clienteNomeAtivo,
              });
            }

            if (
              contaData.tipo === "profissional" &&
              contaData.tipoAtendimento === "fixo" &&
              coordenadaValida(clienteLatAtivo, clienteLngAtivo) &&
              (coordenadaValida(profLatParam, profLngParam) ||
                (String(contaData.endereco || "").trim() &&
                  String(contaData.cidade || "").trim()))
            ) {
              if (!aberturaRapidaFeitaRef.current) {
                aberturaRapidaFeitaRef.current = true;
                setCarregando(false);
              }
              return true;
            }
          }
        } catch (error) {
          console.log("Erro ao carregar conta atual:", error);
        }
      }

      const ultimaPosicao = await Location.getLastKnownPositionAsync({ maxAge: 60000 }).catch(() => null);

      if (
        ultimaPosicao &&
        coordenadaValida(ultimaPosicao.coords.latitude, ultimaPosicao.coords.longitude)
      ) {
        const inicial = {
          latitude: ultimaPosicao.coords.latitude,
          longitude: ultimaPosicao.coords.longitude,
        };

        setLocalAtual(inicial);

        if (
          typeof ultimaPosicao.coords.heading === "number" &&
          Number.isFinite(ultimaPosicao.coords.heading) &&
          ultimaPosicao.coords.heading >= 0
        ) {
          setHeadingAtual(ultimaPosicao.coords.heading);
        }

        if (!aberturaRapidaFeitaRef.current) {
          aberturaRapidaFeitaRef.current = true;
          if (!aberturaRapidaFeitaRef.current) {
            aberturaRapidaFeitaRef.current = true;
            setCarregando(false);
          }
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        if (!aberturaRapidaFeitaRef.current) {
          if (!aberturaRapidaFeitaRef.current) {
            aberturaRapidaFeitaRef.current = true;
            setCarregando(false);
          }
        }
        return false;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (!coordenadaValida(loc.coords.latitude, loc.coords.longitude)) {
        if (!aberturaRapidaFeitaRef.current) {
          if (!aberturaRapidaFeitaRef.current) {
            aberturaRapidaFeitaRef.current = true;
            setCarregando(false);
          }
        }
        return false;
      }

      const precisaAtualizarPosicao =
        !localAtualRef.current ||
        calcularDistanciaKm(
          localAtualRef.current.latitude,
          localAtualRef.current.longitude,
          loc.coords.latitude,
          loc.coords.longitude
        ) > 0.03;

      if (precisaAtualizarPosicao) {
        setLocalAtual({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }

      if (
        typeof loc.coords.heading === "number" &&
        Number.isFinite(loc.coords.heading) &&
        loc.coords.heading >= 0
      ) {
        setHeadingAtual(loc.coords.heading);
      }

      if (!aberturaRapidaFeitaRef.current) {
        aberturaRapidaFeitaRef.current = true;
        setCarregando(false);
      }

      iniciarRastreamentoUsuario().catch((error) => {
        handleError(error, "Mapa.iniciarRastreamentoBackground");
      });

      return true;
    } catch (error) {
      handleError(error, "Mapa.carregarContaELocal");
      if (!aberturaRapidaFeitaRef.current) {
        setCarregando(false);
      }
      return false;
    }
  }

  useEffect(() => {
    let unsubscribeProfissionais: (() => void) | undefined;
    let ativo = true;

    async function iniciarMapa() {
      const ok = await carregarContaELocal();

      if (!ok || !ativo) return;

      setTimeout(() => {
        if (!ativo || trajetoAtivo) return;
        carregarAvaliacoes().catch((error) => {
          console.log("Erro ao carregar avaliações em background:", error);
        });
      }, 1500);

      const q = query(
        collection(db, "users"),
        where("tipo", "==", "profissional"),
        where("verificacaoStatus", "==", "aprovado"),
        where("bloqueado", "==", false),
        where("online", "==", true)
      );

      unsubscribeProfissionais = onSnapshot(
        q,
        async (snapshot) => {
          const listaBruta: Profissional[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as any),
          }));

          const listaComCoords = await Promise.all(
            listaBruta.map(async (prof) => {
              const podeAparecer =
                prof.online === true &&
                prof.verificacaoStatus === "aprovado" &&
                prof.bloqueado !== true;

              if (!podeAparecer) return null;

              if (
                prof.tipoAtendimento === "fixo" &&
                prof.endereco &&
                prof.cidade &&
                !coordenadaValida(prof.latitude, prof.longitude)
              ) {
                const coords = await buscarCoordenadasEndereco(
                  `${prof.endereco}, ${prof.cidade}`
                );

                if (coords) {
                  return {
                    ...prof,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  };
                }
              }

              if (coordenadaValida(prof.latitude, prof.longitude)) {
                return prof;
              }

              return null;
            })
          );

          const profissionaisValidos = listaComCoords.filter(
            (prof): prof is Profissional =>
              !!prof && coordenadaValida(prof.latitude, prof.longitude)
          );

          setProfissionais(profissionaisValidos);

          if (profissionalIdAtivo) {
            const prof = profissionaisValidos.find(
              (p) => p.id === String(profissionalIdAtivo)
            );

            setProfissionalSelecionado(prof || null);
          }

          if (!aberturaRapidaFeitaRef.current) {
            aberturaRapidaFeitaRef.current = true;
            setCarregando(false);
          }

          setTimeout(() => {
            if (!mapRef.current) return;

            if (coordenadaValida(clienteLatAtivo, clienteLngAtivo)) {
              mapRef.current.animateToRegion(
                {
                  latitude: clienteLatAtivo as number,
                  longitude: clienteLngAtivo as number,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                },
                800
              );
              return;
            }

            if (profissionalIdAtivo) {
              const prof = profissionaisValidos.find(
                (p) => p.id === String(profissionalIdAtivo)
              );

              if (prof && coordenadaValida(prof.latitude, prof.longitude)) {
                mapRef.current.animateToRegion(
                  {
                    latitude: prof.latitude as number,
                    longitude: prof.longitude as number,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015,
                  },
                  800
                );
                return;
              }
            }

            if (localAtualRef.current) {
              mapRef.current.animateToRegion(
                {
                  latitude: localAtualRef.current.latitude,
                  longitude: localAtualRef.current.longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                },
                800
              );
            }
          }, 500);
        },
        (error) => {
          handleError(error, "Mapa.snapshotProfissionais");
          if (!aberturaRapidaFeitaRef.current) {
            aberturaRapidaFeitaRef.current = true;
            setCarregando(false);
          }
        }
      );
    }

    iniciarMapa();

    return () => {
      ativo = false;
      if (unsubscribeProfissionais) unsubscribeProfissionais();
      seguindoCameraRef.current = false;
      pararRastreamentoUsuario();
      limparRota();
      try { Speech.stop(); } catch {}
    };
  }, []);

  useEffect(() => {
    let unsubscribeProfissional: (() => void) | undefined;

    async function ouvirProfissionalTempoReal() {
      if (!profissionalIdAtivo) return;

      const refProf = doc(db, "users", String(profissionalIdAtivo));

      unsubscribeProfissional = onSnapshot(refProf, async (snap) => {
        if (!snap.exists()) {
          setProfissionalSelecionado(null);
          return;
        }

        const dados = snap.data() as any;

        const podeAparecer =
          dados.online === true &&
          dados.verificacaoStatus === "aprovado" &&
          dados.bloqueado !== true;

        if (!podeAparecer) {
          setProfissionalSelecionado(null);
          return;
        }

        let atualizado: Profissional = {
          id: snap.id,
          ...dados,
        };

        if (
          atualizado.tipoAtendimento === "fixo" &&
          atualizado.endereco &&
          atualizado.cidade &&
          !coordenadaValida(atualizado.latitude, atualizado.longitude)
        ) {
          const coords = await buscarCoordenadasEndereco(
            `${atualizado.endereco}, ${atualizado.cidade}`
          );

          if (coords) {
            atualizado = {
              ...atualizado,
              latitude: coords.latitude,
              longitude: coords.longitude,
            };
          }
        }

        if (!coordenadaValida(atualizado.latitude, atualizado.longitude)) {
          setProfissionalSelecionado(null);
          return;
        }

        setProfissionalSelecionado(atualizado);
      });
    }

    ouvirProfissionalTempoReal();

    return () => {
      if (unsubscribeProfissional) unsubscribeProfissional();
    };
  }, [params.profissionalId]);

  useEffect(() => {
    let cancelado = false;

    async function carregarClientePerfil() {
      if (!clienteIdAtivo) {
        setClientePerfil(null);
        return;
      }

      const nomeFallback =
        clienteSelecionado?.nome || clienteNomeAtivo || "Cliente";
      const fotoFallback = clienteSelecionado?.fotoPerfil || "";
      const emailFallback = clientePerfil?.email || "";

      if (contaAtual?.tipo === "profissional") {
        setClientePerfil({
          id: clienteIdAtivo,
          nome: nomeFallback,
          fotoPerfil: fotoFallback,
          email: emailFallback,
        });
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", clienteIdAtivo));

        if (!snap.exists() || cancelado) {
          setClientePerfil({
            id: clienteIdAtivo,
            nome: nomeFallback,
            fotoPerfil: fotoFallback,
            email: emailFallback,
          });
          return;
        }

        const dados = snap.data() as any;

        setClientePerfil({
          id: snap.id,
          nome: dados.nome || nomeFallback || dados.email || "Cliente",
          fotoPerfil: dados.fotoPerfil || fotoFallback || "",
          email: dados.email || emailFallback || "",
        });

        setClienteSelecionado((prev) =>
          prev
            ? {
                ...prev,
                id: snap.id,
                nome: dados.nome || nomeFallback || dados.email || "Cliente",
                fotoPerfil: dados.fotoPerfil || fotoFallback || "",
              }
            : prev
        );
      } catch (error: any) {
        const code = String(error?.code || "");
        const message = String(error?.message || "");

        if (
          code.includes("permission") ||
          message.toLowerCase().includes("insufficient permissions")
        ) {
          if (!cancelado) {
            setClientePerfil({
              id: clienteIdAtivo,
              nome: nomeFallback,
              fotoPerfil: fotoFallback,
              email: emailFallback,
            });
          }
          return;
        }

        handleError(error, "Mapa.carregarClientePerfil");
      }
    }

    carregarClientePerfil();

    return () => {
      cancelado = true;
    };
  }, [
    clienteIdAtivo,
    clienteNomeAtivo,
    clienteSelecionado?.nome,
    clienteSelecionado?.fotoPerfil,
    clientePerfil?.email,
    contaAtual?.tipo,
  ]);


  function nivelTransitoPorAtraso(
    duracaoBaseMin?: number,
    duracaoComTransitoMin?: number
  ): "livre" | "moderado" | "intenso" {
    if (
      typeof duracaoBaseMin !== "number" ||
      typeof duracaoComTransitoMin !== "number" ||
      duracaoBaseMin <= 0
    ) {
      return "livre";
    }

    const diferenca = duracaoComTransitoMin - duracaoBaseMin;
    const percentual = diferenca / duracaoBaseMin;

    if (percentual >= 0.35 || diferenca >= 12) return "intenso";
    if (percentual >= 0.15 || diferenca >= 5) return "moderado";
    return "livre";
  }

  async function buscarRotaNoApp(
    origemLat: number,
    origemLng: number,
    destinoLat: number,
    destinoLng: number,
    opcoes?: OpcoesBuscaRota
  ) {
    try {
      if (
        !coordenadaValida(origemLat, origemLng) ||
        !coordenadaValida(destinoLat, destinoLng)
      ) {
        throw new Error("Coordenadas inválidas para traçar rota");
      }

      const chaveDest = `${destinoLat.toFixed(4)}|${destinoLng.toFixed(4)}`;
      const origemSucesso = ultimaOrigemRotaSucessoRef.current;
      // Evita chamadas repetidas ao Directions (equivalente a limitar MapViewDirections):
      // mesmo destino e origem quase parada (< 50 m) não refaz a requisição.
      if (
        !opcoes?.ignorarLimiteOrigem &&
        origemSucesso &&
        origemSucesso.chaveDest === chaveDest
      ) {
        const metrosOrigem =
          calcularDistanciaKm(
            origemSucesso.origemLat,
            origemSucesso.origemLng,
            origemLat,
            origemLng
          ) * 1000;
        if (metrosOrigem < 50) {
          return;
        }
      }

      const chaveRota =
        `${origemLat.toFixed(4)}:${origemLng.toFixed(4)}->${destinoLat.toFixed(4)}:${destinoLng.toFixed(4)}`;

      if (buscandoRotaRef.current && ultimaChaveRotaRef.current === chaveRota) {
        return;
      }

      buscandoRotaRef.current = true;
      ultimaChaveRotaRef.current = chaveRota;
      setCarregandoRota(true);

      const googleMapsApiKey = pegarGoogleMapsApiKey();

      if (!googleMapsApiKey) {
        throw new Error("Google Maps API Key não encontrada no app.json");
      }

      destinoRotaAtualRef.current = {
        latitude: destinoLat,
        longitude: destinoLng,
      };

      const url =
        `https://maps.googleapis.com/maps/api/directions/json?origin=` +
        `${origemLat},${origemLng}` +
        `&destination=${destinoLat},${destinoLng}` +
        `&mode=driving&departure_time=now&traffic_model=best_guess&language=pt-BR&region=br&key=${googleMapsApiKey}`;

      const { data } = await fetchJsonSingleRead(url, 20000);

      if (
        !data ||
        data.status !== "OK" ||
        !Array.isArray(data.routes) ||
        data.routes.length === 0
      ) {
        throw new Error(
          `Resposta de rota inválida: ${data?.status || "sem status"}`
        );
      }

      const rota = data.routes[0];
      const overviewPoints = rota?.overview_polyline?.points;

      if (!overviewPoints) {
        throw new Error("Rota sem polyline");
      }

      const coords = decodificarPolyline(overviewPoints);

      if (!coords.length) {
        throw new Error("Polyline vazia");
      }

      const comInstrucaoVoz = navegadorComInstrucaoVozRef.current;

      const legs = Array.isArray(rota.legs) ? rota.legs : [];
      const stepsExtraidos: RotaStep[] = comInstrucaoVoz
        ? (legs.flatMap((leg: any) =>
            Array.isArray(leg?.steps)
              ? leg.steps
                  .map((step: any) => {
                    const instruction = limparTextoInstrucao(
                      step?.html_instructions || ""
                    );
                    const startLat = step?.start_location?.lat;
                    const startLng = step?.start_location?.lng;
                    const endLat = step?.end_location?.lat;
                    const endLng = step?.end_location?.lng;

                    if (
                      !instruction ||
                      !coordenadaValida(startLat, startLng) ||
                      !coordenadaValida(endLat, endLng)
                    ) {
                      return null;
                    }

                    return {
                      instruction,
                      startLocation: {
                        latitude: startLat,
                        longitude: startLng,
                      },
                      endLocation: {
                        latitude: endLat,
                        longitude: endLng,
                      },
                      distanceMeters: Number(step?.distance?.value || 0),
                      maneuver: step?.maneuver || "",
                    } as RotaStep;
                  })
                  .filter(Boolean)
              : []
          ) as RotaStep[])
        : [];

      if (comInstrucaoVoz) {
        rotaStepsRef.current = stepsExtraidos;
        stepAtualIndexRef.current = 0;
        ultimaInstrucaoFaladaRef.current = "";
        distanciaAvisoStepRef.current = null;
        setProximaInstrucao(
          stepsExtraidos[0]
            ? capitalizar(
                normalizarInstrucaoVoz(
                  stepsExtraidos[0].instruction,
                  stepsExtraidos[0].maneuver
                )
              )
            : ""
        );
        setProximoManeuver(stepsExtraidos[0]?.maneuver || "");
        setDistanciaProximaInstrucao(
          stepsExtraidos[0]?.distanceMeters
            ? Math.max(0, Math.round(stepsExtraidos[0].distanceMeters))
            : null
        );
      } else {
        rotaStepsRef.current = [];
        stepAtualIndexRef.current = 0;
        ultimaInstrucaoFaladaRef.current = "";
        distanciaAvisoStepRef.current = null;
        setProximaInstrucao("");
        setProximoManeuver("");
        setDistanciaProximaInstrucao(null);
      }

      const distanciaMetros = legs.reduce(
        (acc: number, leg: any) => acc + (leg?.distance?.value || 0),
        0
      );
      const duracaoSegundos = legs.reduce(
        (acc: number, leg: any) => acc + (leg?.duration?.value || 0),
        0
      );
      const duracaoTransitoSegundos = legs.reduce(
        (acc: number, leg: any) => acc + (leg?.duration_in_traffic?.value || 0),
        0
      );

      const duracaoBaseMin =
        duracaoSegundos > 0
          ? Math.max(1, Math.round(duracaoSegundos / 60))
          : Math.max(
              1,
              Math.round(
                (calcularDistanciaKm(
                  origemLat,
                  origemLng,
                  destinoLat,
                  destinoLng
                ) /
                  30) *
                  60
              )
            );

      const duracaoComTransitoMin =
        duracaoTransitoSegundos > 0
          ? Math.max(1, Math.round(duracaoTransitoSegundos / 60))
          : duracaoBaseMin;

      setRotaCoords(coords);
      setCoordenadaSnapNaVia(null);
      setDistanciaForaDaRota(null);
      contagemForaDaRotaRef.current = 0;
      setRotaInfo({
        distanciaKm:
          distanciaMetros > 0
            ? distanciaMetros / 1000
            : calcularDistanciaKm(origemLat, origemLng, destinoLat, destinoLng),
        duracaoMin: duracaoBaseMin,
        duracaoTransitoMin: duracaoComTransitoMin,
        nivelTransito: nivelTransitoPorAtraso(
          duracaoBaseMin,
          duracaoComTransitoMin
        ),
      });

      ultimaOrigemRotaSucessoRef.current = {
        origemLat,
        origemLng,
        chaveDest,
      };

      if (comInstrucaoVoz) {
        atualizarNavegacaoPorVoz({
          latitude: origemLat,
          longitude: origemLng,
        });
      }

      const chaveDestinoCamera = `${destinoLat.toFixed(4)}|${destinoLng.toFixed(4)}`;
      const destinoMudouParaCamera =
        ultimaChaveDestinoCameraRef.current !== chaveDestinoCamera;
      if (destinoMudouParaCamera) {
        ultimaChaveDestinoCameraRef.current = chaveDestinoCamera;
      }

      if (
        destinoMudouParaCamera &&
        mapRef.current &&
        coords.length > 1 &&
        podeAtualizarCamera(1200)
      ) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: {
            top: 140,
            right: 48,
            bottom: 320,
            left: 48,
          },
          animated: true,
        });
      }
    } catch (error) {
      logError(error, "Mapa.buscarRotaNoApp");
      console.log("Erro ao buscar rota no Google Directions:", error);
      setRotaCoords([]);
      setRotaInfo(null);
      resetarNavegacaoVoz();
    } finally {
      buscandoRotaRef.current = false;
      setCarregandoRota(false);
      setRerotando(false);
    }
  }

  function iniciarLoopRota(
    obterDestino: () => Coordenadas | null,
    intervaloMs = 12000
  ) {
    const origem = localAtualRef.current;
    const destinoInicial = obterDestino();

    if (!origem || !destinoInicial) return;

    buscarRotaNoApp(
      origem.latitude,
      origem.longitude,
      destinoInicial.latitude,
      destinoInicial.longitude
    );

    if (intervalRotaRef.current) {
      clearInterval(intervalRotaRef.current);
    }

    intervalRotaRef.current = setInterval(() => {
      const origemAtual = localAtualRef.current;
      const destino = obterDestino();

      if (!origemAtual || !destino) return;

      const destinoAnterior = destinoRotaAtualRef.current;
      const mudouDestino =
        !destinoAnterior ||
        calcularDistanciaKm(
          destinoAnterior.latitude,
          destinoAnterior.longitude,
          destino.latitude,
          destino.longitude
        ) > 0.03;

      if (!mudouDestino && carregandoRota) return;

      buscarRotaNoApp(
        origemAtual.latitude,
        origemAtual.longitude,
        destino.latitude,
        destino.longitude
      );
    }, intervaloMs);
  }

  function seguirRotaAteProfissional() {
    iniciarLoopRota(() => {
      const prof = profissionalSelecionadoRef.current;

      if (prof && coordenadaValida(prof.latitude, prof.longitude)) {
        return {
          latitude: prof.latitude as number,
          longitude: prof.longitude as number,
        };
      }

      return null;
    });
  }

  function seguirRotaAteCliente() {
    if (rotaProfissionalAcompanhandoClienteFixo && baseProfissionalFixo) {
      const cliente = clienteSelecionadoRef.current;
      if (!cliente) return;

      buscarRotaNoApp(
        cliente.latitude,
        cliente.longitude,
        baseProfissionalFixo.latitude,
        baseProfissionalFixo.longitude
      );

      if (intervalRotaRef.current) {
        clearInterval(intervalRotaRef.current);
      }

      intervalRotaRef.current = setInterval(() => {
        const clienteAtual = clienteSelecionadoRef.current;
        if (!clienteAtual) return;

        buscarRotaNoApp(
          clienteAtual.latitude,
          clienteAtual.longitude,
          baseProfissionalFixo.latitude,
          baseProfissionalFixo.longitude
        );
      }, 15000);

      return;
    }

    iniciarLoopRota(() => {
      const cliente = clienteSelecionadoRef.current;

      if (cliente && coordenadaValida(cliente.latitude, cliente.longitude)) {
        return {
          latitude: cliente.latitude,
          longitude: cliente.longitude,
        };
      }

      return null;
    });
  }

  useEffect(() => {
    if (!trajetoAtivo || !localAtual || rotaCoords.length < 2) {
      setCoordenadaSnapNaVia(null);
      setDistanciaForaDaRota(null);
      contagemForaDaRotaRef.current = 0;
      return;
    }

    if (!deveGuiarPeloUsuarioAtual()) {
      setCoordenadaSnapNaVia(null);
      setDistanciaForaDaRota(null);
      contagemForaDaRotaRef.current = 0;
      return;
    }

    const pontoMaisProximo = encontrarPontoMaisProximoNaRota(rotaCoords, localAtual);
    const distancia = Math.max(0, Math.round(pontoMaisProximo.distanciaMetros));
    const snapPermitido = distancia <= 45;

    setDistanciaForaDaRota(distancia);
    setCoordenadaSnapNaVia(snapPermitido ? pontoMaisProximo.ponto : null);
    atualizarNavegacaoPorVoz(snapPermitido ? pontoMaisProximo.ponto : localAtual);

    if (distancia > 35) {
      contagemForaDaRotaRef.current += 1;
    } else {
      contagemForaDaRotaRef.current = 0;
    }

    const prontoParaRerota = contagemForaDaRotaRef.current >= 2;
    const agora = Date.now();
    const cooldownOk = agora - ultimaRerotaEmRef.current > 12000;
    const destino = obterDestinoAtual();

    if (
      prontoParaRerota &&
      cooldownOk &&
      destino &&
      !carregandoRota &&
      !rerotando
    ) {
      ultimaRerotaEmRef.current = agora;
      contagemForaDaRotaRef.current = 0;
      setRerotando(true);
      buscarRotaNoApp(
        localAtual.latitude,
        localAtual.longitude,
        destino.latitude,
        destino.longitude,
        { ignorarLimiteOrigem: true }
      );
    }
  }, [
    trajetoAtivo,
    rotaCoords,
    localAtual?.latitude,
    localAtual?.longitude,
    carregandoRota,
    rerotando,
    rotaClienteIndoAteProfissionalFixo,
    rotaProfissionalIndoAteClienteMovel,
  ]);

  useEffect(() => {
    if (!trajetoAtivo) {
      limparRota();
      return;
    }

    if (
      rotaClienteIndoAteProfissionalFixo ||
      rotaClienteAcompanhandoProfissionalMovel
    ) {
      seguirRotaAteProfissional();
      return;
    }

    if (
      rotaProfissionalAcompanhandoClienteFixo ||
      rotaProfissionalIndoAteClienteMovel
    ) {
      seguirRotaAteCliente();
      return;
    }
  }, [
    trajetoAtivo,
    rotaClienteIndoAteProfissionalFixo,
    rotaClienteAcompanhandoProfissionalMovel,
    rotaProfissionalAcompanhandoClienteFixo,
    rotaProfissionalIndoAteClienteMovel,
    localAtual?.latitude,
    localAtual?.longitude,
    profissionalSelecionado?.latitude,
    profissionalSelecionado?.longitude,
    clienteRotaPronto,
    baseProfissionalFixo?.latitude,
    baseProfissionalFixo?.longitude,
  ]);

  useEffect(() => {
    if (!trajetoAtivo) return;

    const id = setTimeout(() => {
      seguirUsuarioNoMapa();
    }, 120);

    return () => clearTimeout(id);
  }, [
    localAtual?.latitude,
    localAtual?.longitude,
    headingAtual,
    seguindoCamera,
    trajetoAtivo,
    distanciaProximaInstrucao,
    proximaInstrucao,
  ]);

  useEffect(() => {
    return () => {
      seguindoCameraRef.current = false;
      pararRastreamentoUsuario();

      if (intervalRotaRef.current) {
        clearInterval(intervalRotaRef.current);
        intervalRotaRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  function abrirWhatsapp(telefone?: string) {
    if (!telefone) return;
    const numero = telefone.replace(/\D/g, "");
    Linking.openURL(`https://wa.me/55${numero}`);
  }

  function handleWhatsappPress(prof: Profissional) {
    const liberadoDireto = whatsappDiretoLiberado(prof);

    if (liberadoDireto) {
      abrirWhatsapp(prof.telefone);
      return;
    }

    Alert.alert(
      "Contato bloqueado",
      "Esse profissional está no plano gratuito. Você pode desbloquear o WhatsApp com validação diária do sistema.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Desbloquear",
          onPress: liberarWhatsappPorAnuncio,
        },
      ]
    );
  }

  function abrirPerfil(prof: Profissional) {
    router.push({
      pathname: "/perfil-profissional",
      params: {
        id: prof.id,
      },
    });
  }

  function fotoPadrao(foto?: string) {
    if (foto && foto.trim() !== "") return foto;
    return "https://i.pravatar.cc/300?img=32";
  }

  function fotoCliente() {
    if (
      clienteSelecionado?.fotoPerfil &&
      clienteSelecionado.fotoPerfil.trim() !== ""
    ) {
      return clienteSelecionado.fotoPerfil;
    }

    if (clientePerfil?.fotoPerfil && clientePerfil.fotoPerfil.trim() !== "") {
      return clientePerfil.fotoPerfil;
    }

    return "https://i.pravatar.cc/300?img=12";
  }

  function nomeClienteFinal() {
    return (
      clienteSelecionado?.nome ||
      clientePerfil?.nome ||
      clientePerfil?.email ||
      clienteNomeParam ||
      "Cliente"
    );
  }

  function textoStatusTrajeto() {
    if (rotaClienteIndoAteProfissionalFixo) {
      return "Você está a caminho do profissional";
    }

    if (rotaClienteAcompanhandoProfissionalMovel) {
      return "Profissional a caminho";
    }

    if (rotaProfissionalAcompanhandoClienteFixo) {
      return "Cliente a caminho";
    }

    if (rotaProfissionalIndoAteClienteMovel) {
      return "Você está a caminho do cliente";
    }

    return "";
  }

  

function fraseNaturalLonga(instrucao: string, metros?: number | null) {
  const texto = normalizarInstrucaoVoz(instrucao);
  if (!texto) return "";
  if (!metros || metros <= 0) return capitalizar(texto);
  return `Em ${arredondarDistanciaFalado(metros)} metros, ${texto}`;
}

function fraseNaturalCurta(instrucao: string) {
  const texto = normalizarInstrucaoVoz(instrucao);
  if (!texto) return "";
  if (/retorno/i.test(texto)) return "Faça o retorno agora";
  if (/direita/i.test(texto)) return "Agora vire à direita";
  if (/esquerda/i.test(texto)) return "Agora vire à esquerda";
  if (/mantenha-se/i.test(texto)) return capitalizar(texto);
  return `Agora, ${texto}`;
}

function limparNomeVia(instrucao: string) {
  return String(instrucao || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textoETA() {
    if (!rotaInfo) return "";

    if (rotaInfo.duracaoMin <= 1) {
      return "Chegada iminente";
    }

    if (rotaInfo.duracaoMin < 60) {
      return `Chega em cerca de ${rotaInfo.duracaoMin} min`;
    }

    const horas = Math.floor(rotaInfo.duracaoMin / 60);
    const minutos = rotaInfo.duracaoMin % 60;

    if (minutos === 0) {
      return `Chega em cerca de ${horas}h`;
    }

    return `Chega em cerca de ${horas}h ${minutos}min`;
  }

  function textoDistanciaProximaInstrucao() {
    if (
      typeof distanciaProximaInstrucao !== "number" ||
      !Number.isFinite(distanciaProximaInstrucao)
    ) {
      return "";
    }

    if (distanciaProximaInstrucao >= 1000) {
      return `${(distanciaProximaInstrucao / 1000).toFixed(1)} km`;
    }

    return `${Math.max(0, Math.round(distanciaProximaInstrucao))} m`;
  }

  function textoForaDaRota() {
    if (
      typeof distanciaForaDaRota !== "number" ||
      !Number.isFinite(distanciaForaDaRota) ||
      distanciaForaDaRota <= 12
    ) {
      return "";
    }

    return `Fora da rota: ${Math.round(distanciaForaDaRota)} m`;
  }

  function obterVisualManeuver(maneuver?: string) {
    const m = String(maneuver || "").toLowerCase();

    if (m.includes("uturn") || m.includes("turn-sharp-left") || m.includes("turn-sharp-right")) {
      return { icone: "↺", titulo: "Retorno", subtitulo: "Faça o retorno", destaque: "retorno" };
    }

    if (m.includes("roundabout")) {
      return { icone: "⟳", titulo: "Rotatória", subtitulo: "Pegue a saída indicada", destaque: "rotatoria" };
    }

    if (m.includes("fork-right") || m.includes("ramp-right") || m.includes("keep-right") || m.includes("merge") || m.includes("turn-slight-right") || m.includes("turn-right")) {
      return { icone: "↱", titulo: "Direita", subtitulo: "Vire à direita", destaque: "direita" };
    }

    if (m.includes("fork-left") || m.includes("ramp-left") || m.includes("keep-left") || m.includes("turn-slight-left") || m.includes("turn-left")) {
      return { icone: "↰", titulo: "Esquerda", subtitulo: "Vire à esquerda", destaque: "esquerda" };
    }

    if (m.includes("arrive")) {
      return { icone: "⬤", titulo: "Destino", subtitulo: "Você chegou", destaque: "destino" };
    }

    return { icone: "↑", titulo: "Siga", subtitulo: "Siga em frente", destaque: "reto" };
  }


  function obterLaneGuidance(maneuver?: string, instrucao?: string) {
    const m = String(maneuver || "").toLowerCase();
    const i = String(instrucao || "").toLowerCase();

    if (m.includes("keep-right") || m.includes("fork-right") || m.includes("ramp-right") || m.includes("merge")) {
      return {
        titulo: "Mantenha-se nas faixas da direita",
        lanes: [
          { icon: "↑", active: false },
          { icon: "↱", active: true },
          { icon: "↱", active: true },
        ],
      };
    }

    if (m.includes("keep-left") || m.includes("fork-left") || m.includes("ramp-left")) {
      return {
        titulo: "Mantenha-se nas faixas da esquerda",
        lanes: [
          { icon: "↰", active: true },
          { icon: "↰", active: true },
          { icon: "↑", active: false },
        ],
      };
    }

    if (m.includes("turn-right") || m.includes("turn-slight-right")) {
      return {
        titulo: "Use a faixa da direita",
        lanes: [
          { icon: "↑", active: false },
          { icon: "↱", active: true },
        ],
      };
    }

    if (m.includes("turn-left") || m.includes("turn-slight-left")) {
      return {
        titulo: "Use a faixa da esquerda",
        lanes: [
          { icon: "↰", active: true },
          { icon: "↑", active: false },
        ],
      };
    }

    if (m.includes("uturn") || m.includes("turn-sharp-left") || m.includes("turn-sharp-right")) {
      return {
        titulo: "Prepare-se para retornar",
        lanes: [
          { icon: "↺", active: true },
          { icon: "↺", active: true },
        ],
      };
    }

    if (m.includes("roundabout") || i.includes("rotatória") || i.includes("rotatoria")) {
      return {
        titulo: "Acompanhe a saída da rotatória",
        lanes: [
          { icon: "⟳", active: true },
          { icon: "⟳", active: true },
          { icon: "⟳", active: true },
        ],
      };
    }

    return {
      titulo: "Permaneça nas faixas centrais",
      lanes: [
        { icon: "↑", active: true },
        { icon: "↑", active: true },
        { icon: "↑", active: true },
      ],
    };
  }

  const avaliacaoAtual = profissionalSelecionado
    ? avaliacoesMap[profissionalSelecionado.id]
    : null;
  const [regiaoVisivelMapa, setRegiaoVisivelMapa] = useState<Region | null>(null);
  const [carregandoMarcadores, setCarregandoMarcadores] = useState(false);

  const profissionaisRender = useMemo(() => {
    if (!localAtual) {
      return profissionais
        .filter((prof) => coordenadaValida(prof.latitude, prof.longitude))
        .sort((a, b) => {
          const prioridadeA = prioridadePlano(a.plano);
          const prioridadeB = prioridadePlano(b.plano);

          if (prioridadeA !== prioridadeB) {
            return prioridadeA - prioridadeB;
          }

          return String(a.nome || "").localeCompare(String(b.nome || ""));
        });
    }

    return profissionais
      .map((prof) => {
        if (!coordenadaValida(prof.latitude, prof.longitude)) {
          return null;
        }

        const distanciaKm = calcularDistanciaKm(
          localAtual.latitude,
          localAtual.longitude,
          prof.latitude as number,
          prof.longitude as number
        );

        const raioMaximoKm = raioMaximoPorPlano(prof.plano);

        if (distanciaKm > raioMaximoKm) {
          return null;
        }

        return {
          ...prof,
          distanciaKmCalculada: distanciaKm,
          prioridadePlanoCalculada: prioridadePlano(prof.plano),
        };
      })
      .filter(
        (
          prof
        ): prof is Profissional & {
          distanciaKmCalculada: number;
          prioridadePlanoCalculada: number;
        } => !!prof
      )
      .sort((a, b) => {
        if (a.prioridadePlanoCalculada !== b.prioridadePlanoCalculada) {
          return a.prioridadePlanoCalculada - b.prioridadePlanoCalculada;
        }

        return a.distanciaKmCalculada - b.distanciaKmCalculada;
      });
  }, [profissionais, localAtual]);

  const profissionaisNoMapa = useMemo(() => {
    if (!regiaoVisivelMapa) {
      return profissionaisRender.slice(0, MAX_PROFISSIONAIS_MAPA_INICIAL);
    }

    const minLat = regiaoVisivelMapa.latitude - regiaoVisivelMapa.latitudeDelta / 2;
    const maxLat = regiaoVisivelMapa.latitude + regiaoVisivelMapa.latitudeDelta / 2;
    const minLng = regiaoVisivelMapa.longitude - regiaoVisivelMapa.longitudeDelta / 2;
    const maxLng = regiaoVisivelMapa.longitude + regiaoVisivelMapa.longitudeDelta / 2;

    return profissionaisRender.filter((prof) => {
      if (!coordenadaValida(prof.latitude, prof.longitude)) return false;
      const lat = prof.latitude as number;
      const lng = prof.longitude as number;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });
  }, [profissionaisRender, regiaoVisivelMapa]);

  profissionaisRenderRef.current = profissionaisRender;

  const onSelectProfNoMapa = useCallback((id: string) => {
    const lista = profissionaisRenderRef.current;
    const prof = lista.find((p) => p.id === id);
    if (!prof) return;
    setProfissionalSelecionado(prof);
    if (!trajetoAtivoRef.current) {
      limparRotaRef.current();
    }
  }, []);

  const handleClienteMarcadorPress = useCallback(() => {
    setProfissionalSelecionado(null);
    if (!trajetoAtivoRef.current) {
      limparRotaRef.current();
    }
  }, []);

  const tituloMarcadorCliente = nomeClienteFinal();

  const regiaoInicial: Region =
    rotaProfissionalAcompanhandoClienteFixo &&
    baseProfissionalFixo &&
    clienteSelecionado &&
    coordenadaValida(clienteSelecionado.latitude, clienteSelecionado.longitude)
      ? {
          latitude:
            (baseProfissionalFixo.latitude + clienteSelecionado.latitude) / 2,
          longitude:
            (baseProfissionalFixo.longitude + clienteSelecionado.longitude) / 2,
          latitudeDelta:
            Math.max(
              0.01,
              Math.abs(baseProfissionalFixo.latitude - clienteSelecionado.latitude) * 1.8
            ),
          longitudeDelta:
            Math.max(
              0.01,
              Math.abs(baseProfissionalFixo.longitude - clienteSelecionado.longitude) * 1.8
            ),
        }
      : rotaProfissionalAcompanhandoClienteFixo && baseProfissionalFixo
      ? {
          latitude: baseProfissionalFixo.latitude,
          longitude: baseProfissionalFixo.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : localAtual
      ? {
          latitude: localAtual.latitude,
          longitude: localAtual.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : {
          latitude: -21.7642,
          longitude: -43.3503,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };

  const mostrarInfoSimples =
    !trajetoAtivo && !profissionalSelecionado && !clienteSelecionado;

  const mostrarOverlayCarregando = (!mapaPronto || carregando || (!localAtual && !rotaProfissionalAcompanhandoClienteFixo)) && !aguardandoContextoTrajeto && !(rotaProfissionalAcompanhandoClienteFixo && !!baseProfissionalFixo && !!clienteSelecionado);

  const coordenadaVeiculoAtual: Coordenadas | null = useMemo(() => {
    if (rotaProfissionalAcompanhandoClienteFixo) {
      return null;
    }

    if (deveGuiarPeloUsuarioAtual() && coordenadaSnapNaVia) {
      return coordenadaSnapNaVia;
    }

    return localAtual;
  }, [
    rotaProfissionalAcompanhandoClienteFixo,
    clienteSelecionado,
    coordenadaSnapNaVia,
    localAtual,
    rotaClienteIndoAteProfissionalFixo,
    rotaProfissionalIndoAteClienteMovel,
  ]);

  const indiceRotaAtual = useMemo(() => {
    return encontrarIndiceMaisProximo(rotaCoords, coordenadaVeiculoAtual);
  }, [rotaCoords, coordenadaVeiculoAtual]);

  const rotaPercorrida = useMemo(() => {
    if (rotaCoords.length <= 1) return [];
    return rotaCoords.slice(0, Math.max(2, indiceRotaAtual + 1));
  }, [rotaCoords, indiceRotaAtual]);

  const rotaRestante = useMemo(() => {
    if (rotaCoords.length <= 1) return [];
    return rotaCoords.slice(Math.max(0, indiceRotaAtual));
  }, [rotaCoords, indiceRotaAtual]);

  const headingVeiculo = useMemo(() => {
    if (rotaRestante.length > 1 && coordenadaVeiculoAtual) {
      return calcularBearing(coordenadaVeiculoAtual, rotaRestante[1]);
    }

    if (rotaCoords.length > indiceRotaAtual + 1 && coordenadaVeiculoAtual) {
      return calcularBearing(
        coordenadaVeiculoAtual,
        rotaCoords[indiceRotaAtual + 1]
      );
    }

    return headingAtual || 0;
  }, [rotaRestante, rotaCoords, indiceRotaAtual, coordenadaVeiculoAtual, headingAtual]);

  const stepAtualVisual = rotaStepsRef.current[stepAtualIndexRef.current] || null;

  const progressoRotaPercentual = useMemo(() => {
    if (!rotaCoords.length) return 0;
    return Math.max(0, Math.min(100, Math.round((indiceRotaAtual / Math.max(1, rotaCoords.length - 1)) * 100)));
  }, [indiceRotaAtual, rotaCoords.length]);

  const routeProgressPercent = useMemo(() => {
    if (rotaCoords.length <= 1) return 0;
    return Math.max(
      0,
      Math.min(100, Math.round((indiceRotaAtual / (rotaCoords.length - 1)) * 100))
    );
  }, [rotaCoords.length, indiceRotaAtual]);

  const visualManeuver = useMemo(
    () => obterVisualManeuver(proximoManeuver),
    [proximoManeuver]
  );


  useEffect(() => {
    if (
      !mapaPronto ||
      !mapRef.current ||
      !rotaProfissionalAcompanhandoClienteFixo ||
      !baseProfissionalFixo ||
      !clienteSelecionado ||
      !coordenadaValida(clienteSelecionado.latitude, clienteSelecionado.longitude)
    ) {
      return;
    }

    const lat = clienteSelecionado.latitude;
    const lng = clienteSelecionado.longitude;
    const ult = ultimoFitClienteProFixoRef.current;
    const agora = Date.now();
    if (ult) {
      const distM = calcularDistanciaKm(ult.lat, ult.lng, lat, lng) * 1000;
      if (distM < 95 && agora - ult.em < 9000) {
        return;
      }
    }

    const id = setTimeout(() => {
      ultimoFitClienteProFixoRef.current = {
        lat,
        lng,
        em: Date.now(),
      };
      mapRef.current?.fitToCoordinates(
        [
          { latitude: lat, longitude: lng },
          {
            latitude: baseProfissionalFixo.latitude,
            longitude: baseProfissionalFixo.longitude,
          },
        ],
        {
          edgePadding: {
            top: 120,
            right: 60,
            bottom: 280,
            left: 60,
          },
          animated: true,
        }
      );
    }, 120);

    return () => clearTimeout(id);
  }, [
    mapaPronto,
    rotaProfissionalAcompanhandoClienteFixo,
    baseProfissionalFixo?.latitude,
    baseProfissionalFixo?.longitude,
    clienteSelecionado?.latitude,
    clienteSelecionado?.longitude,
  ]);

  const laneGuidance = useMemo(
    () => obterLaneGuidance(proximoManeuver, proximaInstrucao),
    [proximoManeuver, proximaInstrucao]
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={regiaoInicial}
        showsUserLocation={!rotaProfissionalAcompanhandoClienteFixo}
        loadingEnabled
        onMapReady={() => setMapaPronto(true)}
        onPanDrag={() => setSeguindoCamera(false)}
        onRegionChangeComplete={(region) => {
          setCarregandoMarcadores(true);
          setRegiaoVisivelMapa(region);
          setTimeout(() => setCarregandoMarcadores(false), 120);
        }}
      >
        {rotaProfissionalAcompanhandoClienteFixo && baseProfissionalFixo ? (
          <MarcadorEstabelecimentoFixoMemo
            latitude={baseProfissionalFixo.latitude}
            longitude={baseProfissionalFixo.longitude}
            styles={styles}
            tracksViewChanges={tracksViewMarcadores}
          />
        ) : null}

        {clienteSelecionado &&
          coordenadaValida(
            clienteSelecionado.latitude,
            clienteSelecionado.longitude
          ) && (
            <MarcadorClienteMapaMemo
              latitude={clienteSelecionado.latitude}
              longitude={clienteSelecionado.longitude}
              title={tituloMarcadorCliente}
              styles={styles}
              tracksViewChanges={tracksViewMarcadores}
              onPress={handleClienteMarcadorPress}
            />
          )}

        {!rotaProfissionalAcompanhandoClienteFixo &&
          profissionaisNoMapa.map((prof) => {
            const plano = planoDoProfissional(prof.plano);
            const borderColor =
              plano === "turbo"
                ? "#EAB308"
                : plano === "mensal"
                ? theme.colors.primary
                : theme.colors.success;
            const markerSize =
              plano === "turbo" ? 58 : plano === "mensal" ? 52 : 48;
            const imageSize =
              plano === "turbo" ? 46 : plano === "mensal" ? 40 : 36;

            return (
              <MarcadorProfissionalListaItem
                key={prof.id}
                profId={prof.id}
                latitude={prof.latitude as number}
                longitude={prof.longitude as number}
                borderColor={borderColor}
                markerSize={markerSize}
                imageSize={imageSize}
                fotoUri={fotoPadrao(prof.fotoPerfil)}
                styles={styles}
                tracksViewChanges={tracksViewMarcadores}
                onSelectProf={onSelectProfNoMapa}
              />
            );
          })}

                {rotaProfissionalAcompanhandoClienteFixo &&
          baseProfissionalFixo &&
          clienteSelecionado &&
          rotaRestante.length <= 1 && (
            <Polyline
              coordinates={[
                {
                  latitude: clienteSelecionado.latitude,
                  longitude: clienteSelecionado.longitude,
                },
                {
                  latitude: baseProfissionalFixo.latitude,
                  longitude: baseProfissionalFixo.longitude,
                },
              ]}
              strokeWidth={5}
              strokeColor={theme.colors.primary}
              lineCap="round"
              lineJoin="round"
            />
          )}

{rotaRestante.length > 1 && (
          <>
            <Polyline
              coordinates={rotaRestante}
              strokeWidth={10}
              strokeColor="rgba(0,0,0,0.12)"
              lineCap="round"
              lineJoin="round"
            />

            <Polyline
              coordinates={rotaRestante}
              strokeWidth={6}
              strokeColor={theme.colors.primary}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {rotaPercorrida.length > 1 && (
          <Polyline
            coordinates={rotaPercorrida}
            strokeWidth={5}
            strokeColor="rgba(34,197,94,0.9)"
            lineCap="round"
            lineJoin="round"
            lineDashPattern={[8, 10]}
          />
        )}

        {trajetoAtivo && coordenadaVeiculoAtual && (
          <MarcadorVeiculoMapaMemo
            coordinate={coordenadaVeiculoAtual}
            rotation={headingVeiculo}
            styles={styles}
            tracksViewChanges={tracksViewMarcadores}
          />
        )}
      </MapView>

      {mostrarOverlayCarregando && (
        <View style={styles.mapLoadingOverlay} pointerEvents="none">
          <View style={styles.mapLoadingCard}>
            <Text style={styles.mapLoadingTitle}>Abrindo mapa...</Text>
            <Text style={styles.mapLoadingSubtitle}>
              O mapa já aparece primeiro e a sua localização termina de carregar por cima.
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.topButton,
          {
            top: insets.top + 10,
          },
        ]}
        onPress={() => {
          limparRota();
          pararRastreamentoUsuario();
          router.back();
        }}
        activeOpacity={0.9}
      >
        <Text style={styles.topButtonText}>← Voltar</Text>
      </TouchableOpacity>

      {!trajetoAtivo && (
        <TouchableOpacity
          style={[
            styles.centerButton,
            {
              top: insets.top + 10,
              right: 16,
            },
          ]}
          onPress={() => {
            setSeguindoCamera(true);
            seguirUsuarioNoMapa();
          }}
          activeOpacity={0.9}
        >
          <Text style={styles.centerButtonText}>◎</Text>
        </TouchableOpacity>
      )}

      {!aguardandoContextoTrajeto && mostrarInfoSimples && (
        <View
          style={[
            styles.infoCard,
            {
              top: insets.top + 74,
            },
          ]}
        >
          <Text style={styles.infoTitle}>Nexo Mapa</Text>
          <Text style={styles.infoText}>
            {`Profissionais no mapa: ${profissionaisNoMapa.length} • Prioridade Turbo > Mensal > Gratuito`}
          </Text>
        </View>
      )}

      {carregandoMarcadores && (
        <View style={styles.mapMarkersLoading}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.mapMarkersLoadingText}>Atualizando marcadores...</Text>
        </View>
      )}

      {aguardandoContextoTrajeto && (
        <View
          style={[
            styles.floatingCardCompact,
            {
              bottom: insets.bottom + 14,
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.routeBootCard}>
            <Text style={styles.routeBootTitle}>Preparando trajeto...</Text>
            <Text style={styles.routeBootText}>
              Abrindo o acompanhamento e carregando os dados da rota.
            </Text>
          </View>
        </View>
      )}

      {trajetoAtivo && (
        <View
          style={[
            styles.floatingCardCompact,
            {
              bottom: insets.bottom + 14,
            },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Acompanhamento</Text>

            <View style={styles.headerButtonsRow}>
              {navegacaoComVozNavegador ? (
                <TouchableOpacity
                  style={styles.headerActionButton}
                  onPress={() => {
                    setVozAtiva((prev) => {
                      const novoValor = !prev;

                      if (!novoValor) {
                        try {
                          Speech.stop();
                        } catch {}
                      } else {
                        atualizarNavegacaoPorVoz(localAtualRef.current);
                      }

                      return novoValor;
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.headerActionButtonText}>
                    {vozAtiva ? "🔊 Voz" : "🔇 Mudo"}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => {
                  setSeguindoCamera(true);
                  seguirUsuarioNoMapa();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.headerActionButtonText}>Centralizar</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.cardTopRow}>
            <Image
              source={{
                uri:
                  rotaClienteIndoAteProfissionalFixo ||
                  rotaClienteAcompanhandoProfissionalMovel
                    ? fotoPadrao(profissionalSelecionado?.fotoPerfil)
                    : fotoCliente(),
              }}
              style={styles.avatarCompact}
            />

            <View style={styles.cardTextWrap}>
              <Text style={styles.cardName}>
                {rotaClienteIndoAteProfissionalFixo ||
                rotaClienteAcompanhandoProfissionalMovel
                  ? profissionalSelecionado?.nome || "Profissional"
                  : nomeClienteFinal()}
              </Text>

              <Text style={styles.routeStatus}>{textoStatusTrajeto()}</Text>

              {!!rotaInfo ? (
                <>
                  <Text style={styles.routeInfoCompact}>
                    {`📏 ${rotaInfo.distanciaKm.toFixed(1)} km • ⏱️ ${rotaInfo.duracaoMin} min`}
                  </Text>
                  <Text style={styles.routeEta}>{textoETA()}</Text>
                </>
              ) : carregandoRota ? (
                <Text style={styles.routeEta}>Calculando rota...</Text>
              ) : null}
            </View>
          </View>

          {deveGuiarPeloUsuarioAtual() && !!proximaInstrucao && (
            <View style={styles.maneuverBannerCompact}>
              <View style={styles.maneuverIconWrapCompact}>
                <Text style={styles.maneuverIconText}>
                  {typeof iconeManobra === "function"
                    ? iconeManobra(stepAtualVisual?.maneuver, stepAtualVisual?.instruction)
                    : "↑"}
                </Text>
              </View>

              <View style={styles.maneuverBannerTextWrap}>
                {!!textoDistanciaProximaInstrucao() && (
                  <Text style={styles.maneuverDistanceCompact}>
                    {textoDistanciaProximaInstrucao()}
                  </Text>
                )}

                <Text style={styles.maneuverPrimaryCompact} numberOfLines={3}>
                  {proximaInstrucao}
                </Text>

                <Text style={styles.maneuverSecondaryCompact} numberOfLines={1}>
                  {typeof textoLanePremium === "function" && stepAtualVisual
                    ? textoLanePremium(
                        stepAtualVisual.instruction,
                        stepAtualVisual.maneuver
                      )
                    : "Siga pela rota"}
                </Text>
              </View>
            </View>
          )}

          {!!textoForaDaRota() && (
            <Text style={styles.offRouteText}>{textoForaDaRota()}</Text>
          )}

          {rerotando && (
            <Text style={styles.reroutingText}>Recalculando rota...</Text>
          )}

          {carregandoRota && !rerotando && (
            <Text style={styles.routeUpdating}>Atualizando rota...</Text>
          )}
        </View>
      )}

      {!aguardandoContextoTrajeto && !trajetoAtivo && profissionalSelecionado && (
        <View
          style={[
            styles.floatingCard,
            {
              bottom: insets.bottom + 14,
            },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Profissional</Text>

            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => {
                setProfissionalSelecionado(null);
                limparRota();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.headerActionButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardTopRow}>
            <Image
              source={{ uri: fotoPadrao(profissionalSelecionado.fotoPerfil) }}
              style={[
                styles.avatar,
                {
                  borderColor:
                    planoDoProfissional(profissionalSelecionado.plano) === "turbo"
                      ? "#EAB308"
                      : planoDoProfissional(profissionalSelecionado.plano) ===
                        "mensal"
                      ? theme.colors.primary
                      : theme.colors.success,
                },
              ]}
            />

            <View style={styles.cardTextWrap}>
              <Text style={styles.cardName}>
                {profissionalSelecionado.nome || "Profissional"}
              </Text>

              <Text style={styles.cardService}>
                {emojiServico(profissionalSelecionado.servico)}{" "}
                {profissionalSelecionado.servico || "Serviço"}
              </Text>

              <View
                style={[
                  styles.planBadge,
                  planoDoProfissional(profissionalSelecionado.plano) === "turbo"
                    ? styles.planBadgeTurbo
                    : planoDoProfissional(profissionalSelecionado.plano) ===
                      "mensal"
                    ? styles.planBadgeMensal
                    : styles.planBadgeGratuito,
                ]}
              >
                <Text
                  style={[
                    styles.planBadgeText,
                    planoDoProfissional(profissionalSelecionado.plano) === "turbo"
                      ? styles.planBadgeTextTurbo
                      : planoDoProfissional(profissionalSelecionado.plano) ===
                        "mensal"
                      ? styles.planBadgeTextMensal
                      : styles.planBadgeTextGratuito,
                  ]}
                >
                  {planoDoProfissional(profissionalSelecionado.plano) === "turbo"
                    ? "⚡ PLANO TURBO"
                    : planoDoProfissional(profissionalSelecionado.plano) ===
                      "mensal"
                    ? "💳 PLANO MENSAL"
                    : "🆓 PLANO GRATUITO"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardInfoBlock}>
            {avaliacaoAtual ? (
              <Text style={styles.ratingText}>
                ⭐ {avaliacaoAtual.media.toFixed(1)} ({avaliacaoAtual.total})
              </Text>
            ) : (
              <Text style={styles.ratingEmpty}>Sem avaliações</Text>
            )}

            <Text style={styles.metaText}>
              {`${profissionalSelecionado.tipoAtendimento === "fixo" ? "📍 Fixo" : "🚗 Móvel"} • ${distanciaTextoDoProfissional(profissionalSelecionado)}`}
            </Text>

            <Text style={styles.metaText}>
              {profissionalSelecionado.tipoAtendimento === "fixo"
                ? `📌 ${
                    profissionalSelecionado.endereco || "Endereço não informado"
                  }`
                : "🚗 Atendimento no seu local"}
            </Text>

            <Text style={styles.metaText}>
              {planoDoProfissional(profissionalSelecionado.plano) === "turbo"
                ? "🚀 Destaque máximo no mapa até 8 km"
                : planoDoProfissional(profissionalSelecionado.plano) === "mensal"
                ? "⭐ Destaque intermediário no mapa até 8 km"
                : "🆓 Exibição padrão no mapa até 6 km"}
            </Text>

            <Text style={styles.statusChip}>Disponível agora</Text>
          </View>

          <View style={styles.rowButtons}>
            <View style={styles.buttonHalf}>
              <ActionButton
                title="Ver perfil"
                onPress={() => abrirPerfil(profissionalSelecionado)}
                variant="primary"
              />
            </View>

            <View style={styles.buttonHalf}>
              <ActionButton
                title={
                  whatsappDiretoLiberado(profissionalSelecionado) ||
                  whatsappLiberadoHoje
                    ? "WhatsApp"
                    : "Desbloquear"
                }
                onPress={() => handleWhatsappPress(profissionalSelecionado)}
                variant="success"
              />
            </View>
          </View>

          {!whatsappDiretoLiberado(profissionalSelecionado) &&
            !whatsappLiberadoHoje && (
              <Text style={styles.unlockInfo}>
                Assista um anúncio para liberar o WhatsApp deste profissional até
                o fim do dia.
              </Text>
            )}
        </View>
      )}

      {!aguardandoContextoTrajeto && !trajetoAtivo && !profissionalSelecionado && clienteSelecionado && (
        <View
          style={[
            styles.floatingCard,
            {
              bottom: insets.bottom + 14,
            },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Cliente</Text>

            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => {
                setClienteSelecionado(null);
                limparRota();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.headerActionButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardTopRow}>
            <Image source={{ uri: fotoCliente() }} style={styles.avatar} />

            <View style={styles.cardTextWrap}>
              <Text style={styles.cardName}>{nomeClienteFinal()}</Text>
              <Text style={styles.cardService}>📍 Cliente selecionado</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default memo(Mapa);

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    map: {
      flex: 1,
      backgroundColor: "#dbeafe",
    },

    mapLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 96,
      backgroundColor: "rgba(255,255,255,0.08)",
    },

    mapLoadingCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      width: "88%",
      maxWidth: 360,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },

    mapLoadingTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },

    mapLoadingSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 6,
      textAlign: "center",
      lineHeight: 18,
    },
    mapMarkersLoading: {
      position: "absolute",
      top: 140,
      alignSelf: "center",
      backgroundColor: "rgba(0,0,0,0.62)",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    mapMarkersLoadingText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "700",
    },

    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.md,
    },

    loadingCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      width: "100%",
      maxWidth: 360,
      alignItems: "center",
    },

    loadingTitle: {
      color: theme.colors.text,
      fontSize: theme.text.title,
      fontWeight: "bold",
      textAlign: "center",
    },

    loadingSubtitle: {
      color: theme.colors.textMuted,
      fontSize: theme.text.subtitle,
      marginTop: theme.spacing.xs,
      textAlign: "center",
    },

    topButton: {
      position: "absolute",
      left: 16,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 12,
      zIndex: 40,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 7,
    },

    topButtonText: {
      color: theme.colors.text,
      fontWeight: "800",
      fontSize: 15,
    },

    centerButton: {
      position: "absolute",
      width: 52,
      height: 52,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 40,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 7,
    },

    centerButtonText: {
      color: theme.colors.text,
      fontWeight: "800",
      fontSize: 22,
      lineHeight: 22,
    },

    infoCard: {
      position: "absolute",
      left: 16,
      right: 84,
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },

    infoTitle: {
      color: theme.colors.text,
      fontWeight: "800",
      marginBottom: 4,
      fontSize: 16,
    },

    infoText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginTop: 2,
    },

    markerBaseLocal: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
      borderWidth: 2,
      borderColor: theme.colors.border,
      justifyContent: "center",
      alignItems: "center",
    },

    markerInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },

    markerMe: {
      backgroundColor: theme.colors.primary,
    },

    markerCliente: {
      backgroundColor: "#a855f7",
    },

    markerWrapper: {
      width: 64,
      height: 64,
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    },
    markerBubble: {
      backgroundColor: "#fff",
      borderWidth: 3,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },

    floatingCard: {
      position: "absolute",
      left: 12,
      right: 12,
      backgroundColor: theme.colors.card,
      borderRadius: 30,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === "android" ? 20 : 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.26,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 14,
    },

    sheetHandle: {
      alignSelf: "center",
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: theme.colors.border,
      marginBottom: 12,
    },

    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },

    headerButtonsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    cardHeaderTitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },

    headerActionButton: {
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
    },

    headerActionButtonText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },

    cardTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 6,
    },

    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 3,
      marginRight: 12,
      backgroundColor: theme.colors.cardSoft,
    },

    avatarLarge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      marginRight: 12,
      borderWidth: 3,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.cardSoft,
    },

    cardTextWrap: {
      flex: 1,
      paddingTop: 2,
    },

    cardName: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
    },

    cardService: {
      color: theme.colors.textMuted,
      marginTop: 4,
      fontSize: 15,
      fontWeight: "700",
    },

    planBadge: {
      alignSelf: "flex-start",
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },

    planBadgeTurbo: {
      backgroundColor: "rgba(234,179,8,0.14)",
      borderColor: "#EAB308",
    },

    planBadgeMensal: {
      backgroundColor: "rgba(37,99,235,0.12)",
      borderColor: theme.colors.primary,
    },

    planBadgeGratuito: {
      backgroundColor: "rgba(34,197,94,0.12)",
      borderColor: theme.colors.success,
    },

    planBadgeText: {
      fontSize: 12,
      fontWeight: "800",
    },

    planBadgeTextTurbo: {
      color: "#EAB308",
    },

    planBadgeTextMensal: {
      color: theme.colors.primary,
    },

    planBadgeTextGratuito: {
      color: theme.colors.success,
    },

    cardInfoBlock: {
      marginTop: 2,
    },

    ratingText: {
      color: theme.colors.warning,
      marginTop: 2,
      fontWeight: "800",
    },

    ratingEmpty: {
      color: theme.colors.textMuted,
      marginTop: 2,
      fontSize: 13,
    },

    metaText: {
      color: theme.colors.textMuted,
      marginTop: 5,
      fontSize: 13,
      lineHeight: 18,
    },

    statusChip: {
      alignSelf: "flex-start",
      marginTop: 8,
      backgroundColor: "rgba(34,197,94,0.12)",
      color: theme.colors.success,
      borderWidth: 1,
      borderColor: theme.colors.success,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      fontSize: 12,
      fontWeight: "700",
      overflow: "hidden",
    },

    routeStatus: {
      color: "#f97316",
      marginTop: 4,
      fontWeight: "800",
      fontSize: 15,
    },

    routeInfo: {
      color: theme.colors.success,
      fontSize: 14,
      marginTop: 6,
      fontWeight: "800",
    },

    routeEta: {
      marginTop: 4,
      fontSize: 13,
      fontWeight: "700",
      color: "#22c55e",
    },

    routeMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
      marginBottom: 10,
    },

    routeMetaPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: "rgba(37,99,235,0.16)",
      borderWidth: 1,
      borderColor: "rgba(37,99,235,0.28)",
    },

    routeMetaPillText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "800",
    },

    routeMetaPillSoft: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    routeMetaPillSoftText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },

    progressTrack: {
      height: 9,
      borderRadius: 999,
      backgroundColor: "rgba(148,163,184,0.18)",
      overflow: "hidden",
      marginBottom: 12,
    },

    progressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },

    maneuverBanner: {
      marginTop: 10,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },

    maneuverIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.18)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },

    maneuverIcon: {
      color: "#fff",
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 34,
    },

    maneuverTextWrap: {
      flex: 1,
    },

    maneuverDistanceLabel: {
      color: "rgba(255,255,255,0.86)",
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 2,
    },

    maneuverPrimaryText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "900",
      lineHeight: 20,
    },

    maneuverSecondaryText: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 12,
      fontWeight: "700",
      marginTop: 4,
    },

    stepCard: {
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    stepCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },

    stepArrowBig: {
      color: theme.colors.primary,
      fontSize: 28,
      fontWeight: "900",
      width: 34,
      textAlign: "center",
      marginRight: 10,
    },

    stepCardHeaderText: {
      flex: 1,
    },

    stepLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
      marginBottom: 2,
    },

    stepTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    stepInstruction: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 20,
    },

    stepDistance: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 6,
    },

    laneGuidanceCard: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },

    laneGuidanceLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },

    laneGuidanceTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 4,
    },

    laneGuidanceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
    },

    lanePill: {
      width: 46,
      height: 54,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },

    lanePillActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    lanePillInactive: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      opacity: 0.72,
    },

    lanePillIcon: {
      fontSize: 24,
      fontWeight: "900",
    },

    lanePillIconActive: {
      color: "#fff",
    },

    lanePillIconInactive: {
      color: theme.colors.textMuted,
    },

    vehicleMarkerOuter: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(15,23,42,0.18)",
      justifyContent: "center",
      alignItems: "center",
    },

    vehicleMarkerInner: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },

    vehicleMarkerIcon: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "900",
      marginTop: -1,
    },


    stepNaturalHintWrap: {
      marginTop: 8,
      alignSelf: "flex-start",
      backgroundColor: "rgba(59,130,246,0.10)",
      borderColor: "rgba(59,130,246,0.25)",
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    stepNaturalHint: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "800",
    },

    stepInstructionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    stepInstructionIcon: {
      color: theme.colors.primary,
      fontSize: 20,
      fontWeight: "900",
      width: 24,
      textAlign: "center",
    },


    floatingCardCompact: {
      position: "absolute",
      left: 12,
      right: 12,
      backgroundColor: theme.colors.card,
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: Platform.OS === "android" ? 16 : 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 10,
      maxHeight: 320,
    },

    avatarCompact: {
      width: 56,
      height: 56,
      borderRadius: 28,
      marginRight: 12,
      borderWidth: 3,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.cardSoft,
    },

    routeInfoCompact: {
      color: theme.colors.success,
      fontSize: 13,
      marginTop: 4,
      fontWeight: "800",
    },

    maneuverBannerCompact: {
      marginTop: 10,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    maneuverIconWrapCompact: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
      flexShrink: 0,
    },

    maneuverDistanceCompact: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "900",
      marginBottom: 4,
      textTransform: "uppercase",
    },

    maneuverPrimaryCompact: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "900",
      lineHeight: 21,
    },

    maneuverSecondaryCompact: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 4,
    },

    routeBootCard: {
      paddingTop: 2,
      paddingBottom: 2,
    },

    routeBootTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
    },

    routeBootText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 6,
    },

    routeUpdating: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 6,
      fontWeight: "600",
    },

    offRouteText: {
      marginTop: 8,
      color: "#f59e0b",
      fontSize: 13,
      fontWeight: "800",
    },

    reroutingText: {
      marginTop: 6,
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "800",
    },

    rowButtons: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
      marginBottom: 2,
    },

    buttonHalf: {
      flex: 1,
    },

    unlockInfo: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 10,
      textAlign: "center",
      lineHeight: 18,
    },

    maneuverIconText: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
    },

    maneuverBannerTextWrap: {
      flex: 1,
      justifyContent: "center",
    },
  });    
}
