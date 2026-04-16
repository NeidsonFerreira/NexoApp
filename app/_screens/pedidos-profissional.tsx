import * as Location from "expo-location";
import { Redirect, router } from "expo-router";
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
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { OfflineBanner } from "../../components/OfflineBanner";
import { auth, db, functions } from "../../lib/firebase";
import { retry } from "../../lib/retry";
import { handleError } from "../../lib/errorHandler";

type StatusPedido =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado";

type Pedido = {
  id: string;
  clienteId: string;
  nomeCliente: string;
  nomeProfissional: string;
  profissionalId: string;
  servico: string;
  status: StatusPedido;
  latitudeCliente?: number | null;
  longitudeCliente?: number | null;
  tempoEstimadoMinutos?: number | null;
  criadoEm?: any;
  concluidoEm?: any;
  fotoCliente?: string | null;
  fotoProfissional?: string | null;
  emailCliente?: string | null;
  ultimaMensagem?: string;
  ultimaMensagemAt?: any;
  temMensagemNovaCliente?: boolean;
  temMensagemNovaProfissional?: boolean;
};

type PedidoUI = Pedido & {
  distanciaTexto: string;
  tempoTexto: string;
  enderecoAproximado: string;
};

type Profissional = {
  id: string;
  tipoAtendimento?: "fixo" | "movel";
  latitude?: number | null;
  longitude?: number | null;
  pedidoAtivoId?: string | null;
  emAtendimento?: boolean;
};

type ClienteInfo = {
  nome?: string;
  fotoPerfil?: string;
  email?: string;
};

type AvaliacaoInfo = {
  nota?: number | null;
  comentario?: string;
};

function pedidoEhAtivo(status?: StatusPedido) {
  return (
    status === "pendente" ||
    status === "aceito" ||
    status === "a_caminho" ||
    status === "chegou" ||
    status === "cliente_a_caminho" ||
    status === "cliente_chegou"
  );
}

function coordenadaValida(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function calcularKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function estimarMinutosPorKm(km: number, tipoAtendimento?: "fixo" | "movel") {
  if (km <= 0) return 0;
  if (tipoAtendimento === "movel") return Math.max(3, Math.round((km / 30) * 60));
  return Math.max(3, Math.round((km / 25) * 60));
}

function getInicial(nome?: string) {
  if (!nome || !nome.trim()) return "?";
  return nome.trim().charAt(0).toUpperCase();
}

function corStatus(status: StatusPedido, theme: any) {
  switch (status) {
    case "pendente":
      return theme.colors.warning;
    case "aceito":
      return theme.colors.success;
    case "a_caminho":
      return theme.colors.statusAguardando;
    case "chegou":
      return theme.colors.statusChegou;
    case "cliente_a_caminho":
      return theme.colors.statusClienteCaminho;
    case "cliente_chegou":
      return theme.colors.statusClienteChegou;
    case "concluido":
      return theme.colors.primary;
    case "recusado":
      return theme.colors.danger;
    default:
      return theme.colors.textMuted;
  }
}

function textoStatus(status: StatusPedido) {
  switch (status) {
    case "pendente":
      return "Pendente";
    case "aceito":
      return "Aceito";
    case "a_caminho":
      return "A caminho";
    case "chegou":
      return "Você chegou";
    case "cliente_a_caminho":
      return "Cliente a caminho";
    case "cliente_chegou":
      return "Cliente chegou";
    case "concluido":
      return "Concluído";
    case "recusado":
      return "Recusado";
    default:
      return status;
  }
}

function formatarData(data: any) {
  if (!data?.seconds) return "Data indisponível";
  const dt = new Date(data.seconds * 1000);
  return (
    dt.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " às " +
    dt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function resumoUltimaMensagem(pedido: PedidoUI) {
  if (!pedido.ultimaMensagem || !pedido.ultimaMensagem.trim()) return null;
  return pedido.ultimaMensagem.trim();
}

export default function PedidosProfissional() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [carregando, setCarregando] = useState(true);
  const [semUser, setSemUser] = useState(false);
  const [ehCliente, setEhCliente] = useState(false);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [profissional, setProfissional] = useState<Profissional | null>(null);
  const [pedidoAtivoId, setPedidoAtivoId] = useState<string>("");
  const [pedidoAtivo, setPedidoAtivo] = useState<Pedido | null>(null);
  const [historicoRaw, setHistoricoRaw] = useState<Pedido[]>([]);
  const [pedidos, setPedidos] = useState<PedidoUI[]>([]);
  const [clientesInfo, setClientesInfo] = useState<Record<string, ClienteInfo>>({});
  const [avaliacoesMap, setAvaliacoesMap] = useState<Record<string, AvaliacaoInfo>>({});
  const [erroTela, setErroTela] = useState("");

  useEffect(() => {
    let unsubscribeProfissional: (() => void) | undefined;
    let unsubscribeHistorico: (() => void) | undefined;
    let ativo = true;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) {
            setSemUser(true);
            setCarregando(false);
          }
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          if (ativo) {
            setSemUser(true);
            setCarregando(false);
          }
          return;
        }

        const dados = snap.data() as any;

        if (dados.tipo !== "profissional") {
          if (ativo) {
            setEhCliente(true);
            setCarregando(false);
          }
          return;
        }

        if (!ativo) return;

        setProfissional({
          id: snap.id,
          ...(dados as any),
        });

        let pedidoAtivoInicial = String(dados.pedidoAtivoId || "");

        if (!pedidoAtivoInicial) {
          const qFallback = query(
            collection(db, "pedidos"),
            where("profissionalId", "==", user.uid)
          );
          const snapFallback = await getDocs(qFallback);
          const pedidoAtivoEncontrado = snapFallback.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }) as Pedido)
            .find((pedido) => pedidoEhAtivo(pedido.status));

          if (pedidoAtivoEncontrado) {
            pedidoAtivoInicial = pedidoAtivoEncontrado.id;
          }
        }

        setPedidoAtivoId(pedidoAtivoInicial);

        unsubscribeProfissional = onSnapshot(
          userRef,
          (snapProf) => {
            if (!snapProf.exists() || !ativo) return;
            const dadosProf = snapProf.data() as any;
            setProfissional({ id: snapProf.id, ...(dadosProf as any) });
            setPedidoAtivoId(String(dadosProf.pedidoAtivoId || ""));
          },
          (error) => {
            handleError(error, "PedidosProfissional.snapshotProfissional");
          }
        );

        const qHistorico = query(
          collection(db, "pedidos"),
          where("profissionalId", "==", user.uid)
        );

        unsubscribeHistorico = onSnapshot(
          qHistorico,
          (snapshot) => {
            if (!ativo) return;

            const lista: Pedido[] = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }));

            setHistoricoRaw(lista);
            setErroTela("");
          },
          (error) => {
            handleError(error, "PedidosProfissional.snapshotHistorico");
            if (ativo) {
              setErroTela("Não foi possível carregar o histórico agora.");
              setCarregando(false);
            }
          }
        );
      } catch (error) {
        handleError(error, "PedidosProfissional.iniciar");
        if (ativo) {
          setErroTela("Não foi possível carregar seus pedidos.");
          setCarregando(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribeProfissional) unsubscribeProfissional();
      if (unsubscribeHistorico) unsubscribeHistorico();
    };
  }, []);

  useEffect(() => {
    let unsubscribePedidoAtivo: (() => void) | undefined;

    if (!pedidoAtivoId) {
      setPedidoAtivo(null);
      return;
    }

    unsubscribePedidoAtivo = onSnapshot(
      doc(db, "pedidos", pedidoAtivoId),
      (snapPedido) => {
        if (!snapPedido.exists()) {
          setPedidoAtivo(null);
          return;
        }

        setPedidoAtivo({
          id: snapPedido.id,
          ...(snapPedido.data() as any),
        });
      },
      (error) => {
        handleError(error, "PedidosProfissional.snapshotPedidoAtivo");
      }
    );

    return () => {
      if (unsubscribePedidoAtivo) unsubscribePedidoAtivo();
    };
  }, [pedidoAtivoId]);

  useEffect(() => {
    let cancelado = false;

    async function carregarExtras() {
      const fonte = [...(pedidoAtivo ? [pedidoAtivo] : []), ...historicoRaw];

      if (!fonte.length) {
        setClientesInfo({});
        setAvaliacoesMap({});
        return;
      }

      const clientesSet = new Set<string>();
      fonte.forEach((pedido) => {
        if (pedido.clienteId) clientesSet.add(pedido.clienteId);
      });

      const clientesArray = Array.from(clientesSet);

      const clientesMapa: Record<string, ClienteInfo> = {};
      clientesArray.forEach((clienteId) => {
        const pedidoFonte = fonte.find((pedido) => pedido.clienteId === clienteId);

        clientesMapa[clienteId] = {
          nome: pedidoFonte?.nomeCliente || "Cliente",
          fotoPerfil: pedidoFonte?.fotoCliente || "",
          email: pedidoFonte?.emailCliente || "",
        };
      });

      let avaliacoesMapa: Record<string, AvaliacaoInfo> = {};

      try {
        if (profissional?.id) {
          const snapshotAvaliacoes = await getDocs(
            query(
              collection(db, "avaliacoes"),
              where("alvoTipo", "==", "profissional"),
              where("alvoId", "==", profissional.id)
            )
          );

          snapshotAvaliacoes.docs.forEach((docSnap) => {
            const dados = docSnap.data() as any;
            const pedidoId = dados.pedidoId ? String(dados.pedidoId) : "";
            if (!pedidoId) return;

            avaliacoesMapa[pedidoId] = {
              nota:
                typeof dados.nota === "number"
                  ? dados.nota
                  : Number(dados.nota || 0),
              comentario: dados.comentario || "",
            };
          });
        }
      } catch (error) {
        handleError(error, "PedidosProfissional.carregarAvaliacoes");
      }

      if (!cancelado) {
        setClientesInfo(clientesMapa);
        setAvaliacoesMap(avaliacoesMapa);
      }
    }

    carregarExtras();

    return () => {
      cancelado = true;
    };
  }, [pedidoAtivo, historicoRaw, profissional?.id]);

  useEffect(() => {
    let cancelado = false;

    async function montarPedidosUI() {
      if (!profissional) {
        setPedidos([]);
        setCarregando(false);
        return;
      }

      const pedidoAtivoEncontrado =
        pedidoAtivo ||
        historicoRaw.find((pedido) => pedidoEhAtivo(pedido.status)) ||
        null;

      const fonte = [
        ...(pedidoAtivoEncontrado ? [pedidoAtivoEncontrado] : []),
        ...historicoRaw.filter(
          (pedido) => pedido.id !== pedidoAtivoEncontrado?.id
        ),
      ];

      const lista: PedidoUI[] = await Promise.all(
        fonte.map(async (pedido) => {
          let distanciaTexto = "Sem distância";
          let tempoTexto = "Sem tempo estimado";
          let enderecoAproximado = "Sem localização";

          const profLat = profissional.latitude;
          const profLng = profissional.longitude;
          const clienteLat = pedido.latitudeCliente;
          const clienteLng = pedido.longitudeCliente;

          if (coordenadaValida(clienteLat, clienteLng)) {
            enderecoAproximado = await buscarEnderecoAproximado(
              clienteLat as number,
              clienteLng as number
            );
          }

          if (
            coordenadaValida(profLat, profLng) &&
            coordenadaValida(clienteLat, clienteLng)
          ) {
            const km = calcularKm(
              profLat as number,
              profLng as number,
              clienteLat as number,
              clienteLng as number
            );

            distanciaTexto = `${km.toFixed(1)} km`;

            const minutos =
              pedido.tempoEstimadoMinutos ??
              estimarMinutosPorKm(km, profissional.tipoAtendimento);

            if (pedido.status === "a_caminho") {
              tempoTexto = `Chegada estimada: ${minutos} min`;
            } else if (pedido.status === "cliente_a_caminho") {
              tempoTexto = `Cliente chega em aprox. ${minutos} min`;
            } else if (profissional.tipoAtendimento === "movel") {
              tempoTexto = `Tempo até o cliente: ${minutos} min`;
            } else {
              tempoTexto = `Tempo até o local: ${minutos} min`;
            }
          }

          return {
            ...pedido,
            distanciaTexto,
            tempoTexto,
            enderecoAproximado,
          };
        })
      );

      lista.sort((a, b) => {
        const ordem: Record<StatusPedido, number> = {
          pendente: 0,
          aceito: 1,
          a_caminho: 2,
          chegou: 3,
          cliente_a_caminho: 2,
          cliente_chegou: 3,
          concluido: 4,
          recusado: 5,
        };

        const ordemA = ordem[a.status] ?? 99;
        const ordemB = ordem[b.status] ?? 99;
        if (ordemA !== ordemB) return ordemA - ordemB;

        const aTime = a.criadoEm?.seconds || 0;
        const bTime = b.criadoEm?.seconds || 0;
        return bTime - aTime;
      });

      if (!cancelado) {
        setPedidos(lista);
        setCarregando(false);
      }
    }

    montarPedidosUI();

    return () => {
      cancelado = true;
    };
  }, [historicoRaw, pedidoAtivo, profissional]);

  function profissionalJaTemPedidoAtivo(pedidoAtualId?: string) {
    if (pedidoAtivoId && pedidoAtivoId !== pedidoAtualId) return true;

    return pedidos.some(
      (pedido) => pedido.id !== pedidoAtualId && pedidoEhAtivo(pedido.status)
    );
  }

  async function buscarEnderecoAproximado(lat: number, lng: number) {
    try {
      const resultado = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      if (!resultado.length) return "Cliente com localização ativa";

      const local = resultado[0];
      const bairro = local.district || local.subregion || local.street || "Região";
      const cidade = local.city || local.region || "";

      return cidade ? `${bairro}, ${cidade}` : bairro;
    } catch (error) {
      handleError(error, "PedidosProfissional.reverseGeocode");
      return "Cliente com localização ativa";
    }
  }

  async function notificarStatusPedidoProfissional(
    pedido: PedidoUI,
    status: StatusPedido
  ) {
    try {
      const fn = httpsCallable(functions, "notificarStatusPedidoProfissional");
      await fn({
        clienteId: pedido.clienteId,
        status,
        nomeProfissional: pedido.nomeProfissional,
        pedidoId: pedido.id,
      });
    } catch (error) {
      handleError(error, "PedidosProfissional.notificarStatus");
    }
  }

  async function atualizarStatusComPush(pedido: PedidoUI, status: StatusPedido) {
    try {
      if (atualizando) return;
      setAtualizando(pedido.id);

      if (status === "aceito") {
        const fn = httpsCallable(functions, "aceitarPedido");
        await fn({ pedidoId: pedido.id });
        await notificarStatusPedidoProfissional(pedido, status);
        return;
      }

      if (status === "recusado") {
        const fn = httpsCallable(functions, "recusarPedido");
        await fn({ pedidoId: pedido.id });
        await notificarStatusPedidoProfissional(pedido, status);
        return;
      }

      if (status === "a_caminho") {
        const fn = httpsCallable(functions, "atualizarStatusACaminho");
        const minutosTexto = pedido.tempoTexto.match(/\d+/)?.[0];
        await fn({
          pedidoId: pedido.id,
          tempoEstimadoMinutos: minutosTexto ? Number(minutosTexto) : null,
        });
        await notificarStatusPedidoProfissional(pedido, status);
        return;
      }

      if (status === "chegou") {
        const fn = httpsCallable(functions, "atualizarStatusChegou");
        await fn({ pedidoId: pedido.id });
        await notificarStatusPedidoProfissional(pedido, status);
        return;
      }

      if (status === "concluido") {
        const fn = httpsCallable(functions, "concluirPedido");
        await fn({ pedidoId: pedido.id });
        await notificarStatusPedidoProfissional(pedido, status);
        return;
      }

      // fallback só para não quebrar caso algum status legado ainda exista
      await retry(async () => {
        throw new Error("Status não suportado por function.");
      });
    } catch (error) {
      handleError(error, "PedidosProfissional.atualizarStatusComPush");
      Alert.alert("Erro", "Não foi possível atualizar o pedido.");
    } finally {
      setAtualizando(null);
    }
  }

  function verMapa(p: PedidoUI) {
    if (!coordenadaValida(p.latitudeCliente, p.longitudeCliente)) {
      Alert.alert("Aviso", "Localização do cliente não disponível.");
      return;
    }

    router.push({
      pathname: "/mapa",
      params: {
        pedidoId: p.id,
        clienteId: p.clienteId,
        clienteLat: String(p.latitudeCliente),
        clienteLng: String(p.longitudeCliente),
        clienteNome: clientesInfo[p.clienteId]?.nome || p.nomeCliente,
        pedidoStatus: p.status,
        profLat: coordenadaValida(profissional?.latitude, profissional?.longitude)
          ? String(profissional?.latitude)
          : "",
        profLng: coordenadaValida(profissional?.latitude, profissional?.longitude)
          ? String(profissional?.longitude)
          : "",
      },
    });
  }

  function abrirChat(p: PedidoUI) {
    router.push({
      pathname: "/chat",
      params: {
        pedidoId: p.id,
        nome: clientesInfo[p.clienteId]?.nome || p.nomeCliente || "Cliente",
      },
    });
  }

  function podeAbrirChat(status: StatusPedido) {
    return (
      status === "aceito" ||
      status === "a_caminho" ||
      status === "chegou" ||
      status === "cliente_a_caminho" ||
      status === "cliente_chegou"
    );
  }

  function temMensagemNova(pedido: PedidoUI) {
    return pedido.temMensagemNovaProfissional === true;
  }

  function fotoCliente(p: PedidoUI) {
    if (p.fotoCliente && p.fotoCliente.trim() !== "") {
      return p.fotoCliente;
    }

    const foto = clientesInfo[p.clienteId]?.fotoPerfil;
    return foto && foto.trim() !== "" ? foto : "";
  }

  function nomeClienteFinal(p: PedidoUI) {
    return (
      clientesInfo[p.clienteId]?.nome ||
      clientesInfo[p.clienteId]?.email ||
      p.nomeCliente ||
      "Cliente"
    );
  }

  const totalPendentes = useMemo(
    () => pedidos.filter((p) => p.status === "pendente").length,
    [pedidos]
  );

  const totalAndamento = useMemo(
    () =>
      pedidos.filter((p) =>
        ["aceito", "a_caminho", "chegou", "cliente_a_caminho", "cliente_chegou"].includes(p.status)
      ).length,
    [pedidos]
  );

  const totalConcluidos = useMemo(
    () => pedidos.filter((p) => p.status === "concluido").length,
    [pedidos]
  );

  const atendimentoMovel = profissional?.tipoAtendimento === "movel";
  const atendimentoFixo = profissional?.tipoAtendimento === "fixo";

  if (carregando) {
    return (
      <ScreenContainer>
        <OfflineBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando pedidos...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (semUser) {
    return <Redirect href="/" />;
  }

  if (ehCliente) {
    return <Redirect href="/cliente-home" />;
  }

  return (
    <ScreenContainer>
      <OfflineBanner />

      <AppHeader
        title="Meus pedidos"
        subtitle="Acompanhe solicitações, atendimentos e concluídos"
        onBack={() => router.back()}
        showBackButton
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.resumoRow}>
          <View style={styles.resumoCard}>
            <Text style={styles.resumoNumero}>{totalPendentes}</Text>
            <Text style={styles.resumoTexto}>Pendentes</Text>
          </View>

          <View style={styles.resumoCard}>
            <Text style={styles.resumoNumero}>{totalAndamento}</Text>
            <Text style={styles.resumoTexto}>Em andamento</Text>
          </View>

          <View style={styles.resumoCard}>
            <Text style={styles.resumoNumero}>{totalConcluidos}</Text>
            <Text style={styles.resumoTexto}>Concluídos</Text>
          </View>
        </View>

        {!!erroTela && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Falha temporária</Text>
            <Text style={styles.emptyText}>{erroTela}</Text>
          </View>
        )}

        {pedidos.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>Nenhum pedido por aqui</Text>
            <Text style={styles.emptyText}>
              Quando um cliente solicitar um serviço, ele aparecerá nesta tela.
            </Text>
          </View>
        ) : (
          pedidos.map((p) => {
            const avaliacao = avaliacoesMap[p.id];
            const clienteNome = nomeClienteFinal(p);
            const clienteFoto = fotoCliente(p);
            const statusColor = corStatus(p.status, theme);
            const novaMensagem = temMensagemNova(p);
            const ultimaMsg = resumoUltimaMensagem(p);

            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  {clienteFoto ? (
                    <Image source={{ uri: clienteFoto }} style={styles.avatarCliente} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackTexto}>
                        {getInicial(clienteNome)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.infoClienteBox}>
                    <Text style={styles.nome}>{clienteNome}</Text>
                    <Text style={styles.infoLabel}>Serviço</Text>
                    <Text style={styles.infoValue}>{p.servico}</Text>
                  </View>

                  <View
                    style={[
                      styles.badge,
                      {
                        borderColor: statusColor,
                        backgroundColor: `${statusColor}20`,
                      },
                    ]}
                  >
                    <Text style={[styles.badgeTexto, { color: statusColor }]}>
                      {textoStatus(p.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {p.status === "concluido" ? (
                  <>
                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoGridLabel}>Pedido</Text>
                        <Text style={styles.infoGridValue}>
                          {formatarData(p.criadoEm)}
                        </Text>
                      </View>

                      <View style={styles.infoItem}>
                        <Text style={styles.infoGridLabel}>Concluído</Text>
                        <Text style={styles.infoGridValue}>
                          {formatarData(p.concluidoEm)}
                        </Text>
                      </View>
                    </View>

                    {avaliacao?.nota ? (
                      <View style={styles.reviewCard}>
                        <Text style={styles.reviewTitle}>
                          ⭐ {Number(avaliacao.nota).toFixed(1)} de avaliação
                        </Text>

                        {!!avaliacao.comentario && (
                          <Text style={styles.reviewText}>
                            “{avaliacao.comentario}”
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={styles.waitingReviewCard}>
                        <Text style={styles.waitingReviewText}>
                          Aguardando avaliação do cliente
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoGridLabel}>Pedido</Text>
                        <Text style={styles.infoGridValue}>
                          {formatarData(p.criadoEm)}
                        </Text>
                      </View>

                      <View style={styles.infoItem}>
                        <Text style={styles.infoGridLabel}>Distância</Text>
                        <Text style={styles.infoGridValue}>{p.distanciaTexto}</Text>
                      </View>

                      <View style={styles.infoItem}>
                        <Text style={styles.infoGridLabel}>Tempo</Text>
                        <Text style={styles.infoGridValue}>{p.tempoTexto}</Text>
                      </View>

                      <View style={styles.infoItem}>
                        <Text style={styles.infoGridLabel}>Local</Text>
                        <Text style={styles.infoGridValue}>
                          {p.enderecoAproximado}
                        </Text>
                      </View>
                    </View>

                    {ultimaMsg ? (
                      <View style={styles.msgBox}>
                        <Text style={styles.msgLabel}>Última mensagem</Text>
                        <Text style={styles.msgText}>{ultimaMsg}</Text>
                      </View>
                    ) : null}

                    {novaMensagem ? (
                      <View style={styles.newMsgBadge}>
                        <Text style={styles.newMsgBadgeText}>Nova mensagem</Text>
                      </View>
                    ) : null}

                    {coordenadaValida(p.latitudeCliente, p.longitudeCliente) && (
                      <ActionButton
                        title="🗺️ Ver no mapa"
                        variant="secondary"
                        onPress={() => verMapa(p)}
                        disabled={atualizando !== null}
                      />
                    )}

                    {podeAbrirChat(p.status) && (
                      <ActionButton
                        title={novaMensagem ? "💬 Abrir chat • Nova mensagem" : "💬 Abrir chat"}
                        variant="primary"
                        onPress={() => abrirChat(p)}
                        disabled={atualizando !== null}
                        style={styles.actionSpacing}
                      />
                    )}

                    {p.status === "pendente" && (
                      <View style={styles.row}>
                        <ActionButton
                          title={atualizando === p.id ? "Salvando..." : "✅ Aceitar"}
                          variant="success"
                          onPress={() => {
                            if (profissionalJaTemPedidoAtivo(p.id)) {
                              Alert.alert(
                                "Atenção",
                                "Você já possui um atendimento em andamento. Conclua o atual antes de aceitar outro."
                              );
                              return;
                            }

                            atualizarStatusComPush(p, "aceito");
                          }}
                          disabled={atualizando !== null}
                          style={styles.halfButton}
                        />

                        <ActionButton
                          title="❌ Recusar"
                          variant="danger"
                          onPress={() => atualizarStatusComPush(p, "recusado")}
                          disabled={atualizando !== null}
                          style={styles.halfButton}
                        />
                      </View>
                    )}

                    {p.status === "aceito" && atendimentoMovel && (
                      <ActionButton
                        title="🚗 A caminho"
                        variant="secondary"
                        onPress={() => atualizarStatusComPush(p, "a_caminho")}
                        disabled={atualizando !== null}
                        style={styles.actionSpacing}
                      />
                    )}

                    {p.status === "a_caminho" && atendimentoMovel && (
                      <ActionButton
                        title="📍 Cheguei"
                        variant="purple"
                        onPress={() => atualizarStatusComPush(p, "chegou")}
                        disabled={atualizando !== null}
                        style={styles.actionSpacing}
                      />
                    )}

                    {p.status === "cliente_a_caminho" && atendimentoFixo && (
                      <View style={styles.noticeCard}>
                        <Text style={styles.noticeText}>
                          🚶 O cliente está indo até você
                        </Text>
                      </View>
                    )}

                    {p.status === "cliente_chegou" && atendimentoFixo && (
                      <View style={styles.noticeCard}>
                        <Text style={styles.noticeText}>
                          📍 O cliente chegou ao local
                        </Text>
                      </View>
                    )}

                    {(p.status === "chegou" || p.status === "cliente_chegou") && (
                      <ActionButton
                        title="🏁 Concluir"
                        variant="primary"
                        onPress={() => atualizarStatusComPush(p, "concluido")}
                        disabled={atualizando !== null}
                        style={styles.actionSpacing}
                      />
                    )}

                    {p.status === "aceito" &&
                      atendimentoFixo &&
                      !coordenadaValida(p.latitudeCliente, p.longitudeCliente) && (
                        <ActionButton
                          title="🏁 Concluir"
                          variant="primary"
                          onPress={() => atualizarStatusComPush(p, "concluido")}
                          disabled={atualizando !== null}
                          style={styles.actionSpacing}
                        />
                      )}
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any, themeMode?: "light" | "dark") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    content: {
      paddingBottom: 36,
      gap: 14,
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },

    loadingText: {
      color: theme.colors.textSecondary,
      marginTop: 12,
      fontSize: 15,
    },

    resumoRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
      marginBottom: 4,
    },

    resumoCard: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 10,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.18 : 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },

    resumoNumero: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
    },

    resumoTexto: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 4,
      textAlign: "center",
    },

    emptyCard: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      padding: 24,
      alignItems: "center",
      marginTop: 8,
    },

    emptyEmoji: {
      fontSize: 34,
      marginBottom: 10,
    },

    emptyTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 8,
    },

    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 21,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.22 : 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },

    cardTop: {
      flexDirection: "row",
      alignItems: "center",
    },

    avatarCliente: {
      width: 62,
      height: 62,
      borderRadius: 31,
      marginRight: 12,
      backgroundColor: theme.colors.cardSoft,
    },

    avatarFallback: {
      width: 62,
      height: 62,
      borderRadius: 31,
      marginRight: 12,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },

    avatarFallbackTexto: {
      color: "#fff",
      fontSize: 22,
      fontWeight: "800",
    },

    infoClienteBox: {
      flex: 1,
      paddingRight: 10,
    },

    nome: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 4,
    },

    infoLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginBottom: 2,
    },

    infoValue: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },

    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 14,
    },

    badge: {
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },

    badgeTexto: {
      fontWeight: "800",
      fontSize: 12,
    },

    infoGrid: {
      gap: 10,
      marginBottom: 14,
    },

    infoItem: {
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },

    infoGridLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginBottom: 4,
    },

    infoGridValue: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 20,
    },

    msgBox: {
      marginBottom: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    msgLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
    },

    msgText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },

    newMsgBadge: {
      alignSelf: "flex-start",
      marginBottom: 12,
      backgroundColor: "rgba(59,130,246,0.14)",
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },

    newMsgBadgeText: {
      color: theme.colors.primary,
      fontWeight: "800",
      fontSize: 12,
    },

    row: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },

    halfButton: {
      flex: 1,
    },

    actionSpacing: {
      marginTop: 10,
    },

    noticeCard: {
      marginTop: 10,
      backgroundColor: "rgba(249, 115, 22, 0.10)",
      borderWidth: 1,
      borderColor: "rgba(249, 115, 22, 0.55)",
      borderRadius: 16,
      paddingVertical: 13,
      paddingHorizontal: 14,
    },

    noticeText: {
      color: theme.colors.text,
      fontWeight: "700",
      fontSize: 14,
      textAlign: "center",
    },

    reviewCard: {
      marginTop: 6,
      backgroundColor: "rgba(251, 191, 36, 0.08)",
      borderWidth: 1,
      borderColor: "rgba(251, 191, 36, 0.28)",
      borderRadius: 16,
      padding: 14,
    },

    reviewTitle: {
      color: theme.colors.warning,
      fontSize: 17,
      fontWeight: "800",
    },

    reviewText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginTop: 8,
      lineHeight: 22,
    },

    waitingReviewCard: {
      marginTop: 6,
      backgroundColor: "rgba(34, 197, 94, 0.10)",
      borderWidth: 1,
      borderColor: "rgba(34, 197, 94, 0.35)",
      borderRadius: 16,
      padding: 14,
    },

    waitingReviewText: {
      color: theme.colors.success,
      fontWeight: "700",
      fontSize: 14,
    },
  });
}
