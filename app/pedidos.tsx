import * as Location from "expo-location";
import { Redirect, router } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ActionButton } from "../components/ActionButton";
import { AppHeader } from "../components/AppHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db, functions } from "../lib/firebase";
import { retry } from "../lib/retry";
import { safeRequest } from "../lib/firebaseService";
import { logError, logEvent } from "../lib/logger";
import { handleError } from "../lib/errorHandler";

type StatusPedido =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "cliente_a_caminho"
  | "cliente_chegou"
  | "concluido"
  | "recusado";

type TipoAtendimento = "fixo" | "movel";

type Pedido = {
  id: string;
  clienteId: string;
  profissionalId: string;
  nomeCliente: string;
  nomeProfissional: string;
  servico: string;
  status: StatusPedido;
  criadoEm?: any;
  concluidoEm?: any;
  tempoEstimadoMinutos?: number | null;
  latitudeCliente?: number | null;
  longitudeCliente?: number | null;
  fotoProfissional?: string | null;
  ultimaMensagem?: string;
  ultimaMensagemAt?: any;
  temMensagemNovaCliente?: boolean;
  temMensagemNovaProfissional?: boolean;
  tipoAtendimento?: TipoAtendimento;
};

type UserBase = {
  pedidoAtivoId?: string | null;
  emAtendimento?: boolean;
};

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
      return "Pedido aceito";
    case "a_caminho":
      return "Profissional a caminho";
    case "chegou":
      return "Profissional chegou";
    case "cliente_a_caminho":
      return "Você está a caminho";
    case "cliente_chegou":
      return "Você chegou";
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

function textoTempo(pedido: Pedido) {
  const statusMostraTempo =
    pedido.status === "aceito" ||
    pedido.status === "a_caminho" ||
    pedido.status === "cliente_a_caminho";

  if (!statusMostraTempo || !pedido.tempoEstimadoMinutos) return null;

  if (pedido.status === "a_caminho") {
    return `Chegada estimada: ${pedido.tempoEstimadoMinutos} min`;
  }

  if (pedido.status === "cliente_a_caminho") {
    return `Seu tempo estimado: ${pedido.tempoEstimadoMinutos} min`;
  }

  return `Tempo estimado: ${pedido.tempoEstimadoMinutos} min`;
}

function resumoUltimaMensagem(pedido: Pedido) {
  if (!pedido.ultimaMensagem || !pedido.ultimaMensagem.trim()) return null;
  return pedido.ultimaMensagem.trim();
}

function getInicial(nome?: string) {
  if (!nome || !nome.trim()) return "?";
  return nome.trim().charAt(0).toUpperCase();
}

function statusPermiteChat(status: StatusPedido) {
  return (
    status === "aceito" ||
    status === "a_caminho" ||
    status === "chegou" ||
    status === "cliente_a_caminho" ||
    status === "cliente_chegou"
  );
}

function textoBotaoMapa(status: StatusPedido) {
  switch (status) {
    case "a_caminho":
      return "Acompanhar no mapa";
    case "chegou":
      return "Profissional no mapa";
    case "cliente_a_caminho":
      return "Ver trajeto";
    case "cliente_chegou":
      return "Ver no mapa";
    default:
      return "Ver no mapa";
  }
}

export default function MeusPedidos() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const [carregando, setCarregando] = useState(true);
  const [semUser, setSemUser] = useState(false);
  const [pedidoAtivo, setPedidoAtivo] = useState<Pedido | null>(null);
  const [historico, setHistorico] = useState<Pedido[]>([]);
  const [pedidosAvaliados, setPedidosAvaliados] = useState<string[]>([]);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);
  const [feedbackAcao, setFeedbackAcao] = useState("");
  const watchClienteRef = useRef<Location.LocationSubscription | null>(null);
  const iniciandoRef = useRef(false);
  const syncRef = useRef(false);

  useEffect(() => {
    let unsubscribeAtivo: (() => void) | undefined;
    let unsubscribeHistorico: (() => void) | undefined;
    let ativo = true;

    async function iniciar() {
      if (iniciandoRef.current) return;
      iniciandoRef.current = true;

      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) {
            setSemUser(true);
            setCarregando(false);
          }
          return;
        }

        await carregarAvaliacoesDoCliente(user.uid);

        const userRef = doc(db, "users", user.uid);

        const snapUser = await safeRequest(
          () => getDoc(userRef),
          {
            timeoutMs: 12000,
            tentativas: 2,
            exigirInternet: true,
            dedupeKey: `pedidos:user:${user.uid}`,
            priority: 8,
          }
        );

        let pedidoAtivoId = "";

        if (snapUser.exists()) {
          const dadosUser = snapUser.data() as UserBase;
          pedidoAtivoId = String(dadosUser.pedidoAtivoId || "");
        }

        if (!pedidoAtivoId) {
          const snapFallback = await safeRequest(
            () =>
              getDocs(
                query(
                  collection(db, "pedidos"),
                  where("clienteId", "==", user.uid)
                )
              ),
            {
              timeoutMs: 20000,
              tentativas: 2,
              exigirInternet: true,
              dedupeKey: `pedidos:fallback:${user.uid}`,
              priority: 7,
            }
          );

          const pedidoAtivoEncontrado = snapFallback.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }) as Pedido)
            .find((p) => pedidoEhAtivo(p.status));

          if (pedidoAtivoEncontrado) {
            pedidoAtivoId = pedidoAtivoEncontrado.id;

            await safeRequest(
              () =>
                setDoc(
                  userRef,
                  {
                    pedidoAtivoId: pedidoAtivoEncontrado.id,
                    emAtendimento: true,
                  },
                  { merge: true }
                ),
              {
                timeoutMs: 12000,
                tentativas: 2,
                exigirInternet: true,
                dedupeKey: `pedidos:setAtivo:${user.uid}:${pedidoAtivoEncontrado.id}`,
                priority: 8,
              }
            );
          }
        }

        if (pedidoAtivoId) {
          unsubscribeAtivo = onSnapshot(
            doc(db, "pedidos", pedidoAtivoId),
            async (snapPedido) => {
              if (!ativo) return;

              try {
                if (!snapPedido.exists()) {
                  setPedidoAtivo(null);
                  await sincronizarEstadoAtendimentoCliente(user.uid, null);
                  return;
                }

                const pedido = {
                  id: snapPedido.id,
                  ...(snapPedido.data() as Omit<Pedido, "id">),
                } as Pedido;

                setPedidoAtivo(pedido);

                if (!pedidoEhAtivo(pedido.status)) {
                  await sincronizarEstadoAtendimentoCliente(user.uid, null);
                  pararRastreamentoCliente();
                } else {
                  await sincronizarEstadoAtendimentoCliente(user.uid, pedido);
                }
              } catch (error) {
                logError(error, "Pedidos.snapshotAtivo");
                handleError(error, "Pedidos.snapshotAtivo");
              }
            },
            (error) => {
              logError(error, "Pedidos.snapshotAtivo");
              handleError(error, "Pedidos.snapshotAtivo");
            }
          );
        } else {
          setPedidoAtivo(null);
          await sincronizarEstadoAtendimentoCliente(user.uid, null);
        }

        unsubscribeHistorico = onSnapshot(
          query(collection(db, "pedidos"), where("clienteId", "==", user.uid)),
          (snapshot) => {
            if (!ativo) return;

            const lista = snapshot.docs
              .map(
                (docSnap) =>
                  ({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<Pedido, "id">),
                  }) as Pedido
              )
              .filter((pedido) => !pedidoEhAtivo(pedido.status))
              .sort((a, b) => {
                const aTime = a.criadoEm?.seconds || 0;
                const bTime = b.criadoEm?.seconds || 0;
                return bTime - aTime;
              });

            setHistorico(lista);
            setCarregando(false);
          },
          (error) => {
            logError(error, "Pedidos.snapshotHistorico");
            handleError(error, "Pedidos.snapshotHistorico");
            setCarregando(false);
          }
        );

        logEvent("pedidos_loaded", { userId: user.uid }, "Pedidos");
      } catch (error) {
        logError(error, "Pedidos.iniciar");
        handleError(error, "Pedidos.iniciar");
        if (ativo) setCarregando(false);
      } finally {
        iniciandoRef.current = false;
      }
    }

    void iniciar();

    return () => {
      ativo = false;
      if (unsubscribeAtivo) unsubscribeAtivo();
      if (unsubscribeHistorico) unsubscribeHistorico();
      pararRastreamentoCliente();
    };
  }, []);

  useEffect(() => {
    if (
      !pedidoAtivo ||
      pedidoAtivo.tipoAtendimento !== "fixo" ||
      pedidoAtivo.status !== "cliente_a_caminho"
    ) {
      pararRastreamentoCliente();
    }
  }, [pedidoAtivo]);


  async function sincronizarEstadoAtendimentoCliente(
    clienteId: string,
    pedido: Pedido | null
  ) {
    if (syncRef.current) return;

    try {
      syncRef.current = true;

      await safeRequest(
        () =>
         setDoc(
            doc(db, "users", clienteId),
            {
              pedidoAtivoId:
                pedido && pedidoEhAtivo(pedido.status) ? pedido.id : null,
              emAtendimento: !!(pedido && pedidoEhAtivo(pedido.status)),
            },
            { merge: true }
          ),
        {
          timeoutMs: 12000,
          tentativas: 2,
          exigirInternet: true,
          dedupeKey: `pedidos:sync:${clienteId}:${pedido?.id || "none"}`,
          priority: 8,
        }
      );
    } catch (error) {
      logError(error, "Pedidos.sincronizarEstadoAtendimentoCliente");
      handleError(error, "Pedidos.sincronizarEstadoAtendimentoCliente");
    } finally {
      syncRef.current = false;
    }
  }

  async function carregarAvaliacoesDoCliente(clienteId: string) {
    try {
      const snapshot = await safeRequest(
        () =>
          getDocs(
            query(
              collection(db, "avaliacoes"),
              where("clienteId", "==", clienteId)
            )
          ),
        {
          timeoutMs: 15000,
          tentativas: 2,
          exigirInternet: true,
          dedupeKey: `pedidos:avaliacoes:${clienteId}`,
          priority: 4,
        }
      );

      const idsPedidosAvaliados = snapshot.docs
        .map((docSnap) => docSnap.data().pedidoId)
        .filter(Boolean);

      setPedidosAvaliados(idsPedidosAvaliados);
    } catch (error) {
      logError(error, "Pedidos.carregarAvaliacoesDoCliente");
      handleError(error, "Pedidos.carregarAvaliacoesDoCliente");
    }
  }
  function pararRastreamentoCliente() {
    if (watchClienteRef.current) {
      watchClienteRef.current.remove();
      watchClienteRef.current = null;
    }
  }

  async function notificarStatusClientePedido(
    pedido: Pedido,
    tipo: "cliente_a_caminho" | "cliente_chegou"
  ) {
    const fn = httpsCallable(functions, "notificarStatusClientePedido");

    await safeRequest(
      () => fn({ pedidoId: pedido.id, tipo }),
      {
        timeoutMs: 15000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `pedidos:notificar:${pedido.id}:${tipo}`,
        priority: 9,
      }
    );
  }

  async function iniciarRastreamentoCliente(pedido: Pedido) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Aviso", "Permissão de localização negada.");
        return false;
      }

      pararRastreamentoCliente();

      const posicaoAtual = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (
        coordenadaValida(
          posicaoAtual.coords.latitude,
          posicaoAtual.coords.longitude
        )
      ) {
        await safeRequest(
          () =>
            retry(() =>
              updateDoc(doc(db, "pedidos", pedido.id), {
                latitudeCliente: posicaoAtual.coords.latitude,
                longitudeCliente: posicaoAtual.coords.longitude,
              })
            ),
          {
            timeoutMs: 15000,
            tentativas: 1,
            exigirInternet: true,
            dedupeKey: `pedidos:loc:init:${pedido.id}`,
            priority: 10,
          }
        );
      }

      watchClienteRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (posicao) => {
          const latitude = posicao.coords.latitude;
          const longitude = posicao.coords.longitude;

          if (!coordenadaValida(latitude, longitude)) return;

          try {
            await safeRequest(
              () =>
                retry(() =>
                  updateDoc(doc(db, "pedidos", pedido.id), {
                    latitudeCliente: latitude,
                    longitudeCliente: longitude,
                  })
                ),
              {
                timeoutMs: 12000,
                tentativas: 1,
                exigirInternet: true,
                dedupeKey: `pedidos:loc:${pedido.id}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
                priority: 10,
              }
            );
          } catch (error) {
            logError(error, "Pedidos.watchPosition");
          }
        }
      );

      return true;
    } catch (error) {
      logError(error, "Pedidos.iniciarRastreamentoCliente");
      handleError(error, "Pedidos.iniciarRastreamentoCliente");
      return false;
    }
  }

  async function iniciarRotaClienteFixo(pedido: Pedido) {
    try {
      if (atualizandoId) return;

      setAtualizandoId(pedido.id);

      const ok = await iniciarRastreamentoCliente(pedido);
      if (!ok) return;

      const posicaoAtual = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);

      const payload: Record<string, any> = {
        status: "cliente_a_caminho",
      };

      if (
        posicaoAtual &&
        coordenadaValida(
          posicaoAtual.coords.latitude,
          posicaoAtual.coords.longitude
        )
      ) {
        payload.latitudeCliente = posicaoAtual.coords.latitude;
        payload.longitudeCliente = posicaoAtual.coords.longitude;
      }

      await safeRequest(
        () =>
          retry(() =>
            updateDoc(doc(db, "pedidos", pedido.id), payload)
          ),
        {
          timeoutMs: 15000,
          tentativas: 1,
          exigirInternet: true,
          dedupeKey: `pedidos:status:${pedido.id}:cliente_a_caminho`,
          priority: 10,
        }
      );

      await notificarStatusClientePedido(pedido, "cliente_a_caminho");

      setFeedbackAcao("Rota iniciada com sucesso.");
      Alert.alert("Sucesso", "Sua rota foi iniciada.");
    } catch (error) {
      logError(error, "Pedidos.iniciarRotaClienteFixo");
      handleError(error, "Pedidos.iniciarRotaClienteFixo");
      Alert.alert("Erro", "Não foi possível iniciar a rota.");
    } finally {
      setAtualizandoId(null);
    }
  }

  async function marcarClienteChegou(pedido: Pedido) {
    try {
      if (atualizandoId) return;

      setAtualizandoId(pedido.id);
      pararRastreamentoCliente();

      const posicaoAtual = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);

      const payload: Record<string, any> = {
        status: "cliente_chegou",
      };

      if (
        posicaoAtual &&
        coordenadaValida(
          posicaoAtual.coords.latitude,
          posicaoAtual.coords.longitude
        )
      ) {
        payload.latitudeCliente = posicaoAtual.coords.latitude;
        payload.longitudeCliente = posicaoAtual.coords.longitude;
      }

      await safeRequest(
        () => retry(() => updateDoc(doc(db, "pedidos", pedido.id), payload)),
        {
          timeoutMs: 15000,
          tentativas: 1,
          exigirInternet: true,
          dedupeKey: `pedidos:status:${pedido.id}:cliente_chegou`,
          priority: 10,
        }
      );

      await notificarStatusClientePedido(pedido, "cliente_chegou");

      setFeedbackAcao("Sua chegada foi confirmada.");
      Alert.alert("Sucesso", "Sua chegada foi confirmada.");
    } catch (error) {
      logError(error, "Pedidos.marcarClienteChegou");
      handleError(error, "Pedidos.marcarClienteChegou");
      Alert.alert("Erro", "Não foi possível confirmar sua chegada.");
    } finally {
      setAtualizandoId(null);
    }
  }

  function acompanharNoMapa(pedido: Pedido) {
    router.push({
      pathname: "/mapa",
      params: {
        profissionalId: pedido.profissionalId,
        pedidoStatus: pedido.status,
        clienteLat:
          typeof pedido.latitudeCliente === "number"
            ? String(pedido.latitudeCliente)
            : undefined,
        clienteLng:
          typeof pedido.longitudeCliente === "number"
            ? String(pedido.longitudeCliente)
            : undefined,
      },
    });
  }

  function abrirChat(pedido: Pedido) {
    router.push({
      pathname: "/chat",
      params: {
        pedidoId: pedido.id,
        nome: pedido.nomeProfissional || "Profissional",
      },
    });
  }

  function avaliarProfissional(pedido: Pedido) {
    router.push({
      pathname: "/avaliar-profissional",
      params: {
        profissionalId: pedido.profissionalId,
        nomeProfissional: pedido.nomeProfissional || "Profissional",
        pedidoId: pedido.id,
      },
    });
  }

  function jaFoiAvaliado(pedidoId: string) {
    return pedidosAvaliados.includes(pedidoId);
  }

  const listaRender = useMemo(() => {
    const lista: Pedido[] = [];
    if (pedidoAtivo) lista.push(pedidoAtivo);
    return [...lista, ...historico];
  }, [pedidoAtivo, historico]);

  if (semUser) return <Redirect href="/" />;

  if (carregando) {
    return (
      <ScreenContainer>
        <AppHeader
          title="Meus Pedidos"
          subtitle="Acompanhe suas solicitações"
          showBackButton
          onBack={() => router.replace("/cliente-home")}
        />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.stateText}>Carregando pedidos...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader
        title="Meus Pedidos"
        subtitle="Acompanhe status, chat, rota e avaliação"
        showBackButton
        onBack={() => router.replace("/cliente-home")}
      />

      {!!pedidoAtivo && (
        <View style={styles.bannerAtivo}>
          <Text style={styles.bannerAtivoTitulo}>Você está em atendimento</Text>
          <Text style={styles.bannerAtivoTexto}>
            Acompanhe o status, use o chat e finalize suas ações por aqui.
          </Text>
        </View>
      )}

      {!!feedbackAcao.trim() && (
        <View style={styles.bannerFeedback}>
          <Text style={styles.bannerFeedbackText}>{feedbackAcao.trim()}</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {listaRender.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhum pedido ainda</Text>
            <Text style={styles.emptyText}>
              Quando você solicitar um serviço, ele aparecerá aqui.
            </Text>
          </View>
        ) : (
          listaRender.map((pedido) => {
            const tipoAtendimento = pedido.tipoAtendimento || "fixo";
            const foto = pedido.fotoProfissional || "";
            const nomeProfissional = pedido.nomeProfissional || "Profissional";
            const novaMensagem = pedido.temMensagemNovaCliente === true;
            const corBadge = corStatus(pedido.status, theme);
            const ultimaMensagem = resumoUltimaMensagem(pedido);

            return (
              <View key={pedido.id} style={styles.card}>
                <View style={styles.cardTop}>
                  {foto ? (
                    <Image source={{ uri: foto }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>
                        {getInicial(nomeProfissional)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardInfo}>
                    <Text style={styles.profissionalNome}>
                      {nomeProfissional}
                    </Text>

                    <Text style={styles.infoText}>
                      Serviço: {pedido.servico || "Não informado"}
                    </Text>

                    <Text style={styles.infoText}>
                      Pedido: {formatarData(pedido.criadoEm)}
                    </Text>

                    {pedido.status === "concluido" && pedido.concluidoEm ? (
                      <Text style={styles.infoText}>
                        Concluído: {formatarData(pedido.concluidoEm)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {textoTempo(pedido) ? (
                  <View style={styles.timeBox}>
                    <Text style={styles.timeText}>{textoTempo(pedido)}</Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.statusBadge,
                    {
                      borderColor: corBadge,
                      backgroundColor: `${corBadge}20`,
                    },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: corBadge }]}>
                    {textoStatus(pedido.status)}
                  </Text>
                </View>

                {ultimaMensagem ? (
                  <View style={styles.msgBox}>
                    <Text style={styles.msgLabel}>Última mensagem</Text>
                    <Text style={styles.msgText}>{ultimaMensagem}</Text>
                  </View>
                ) : null}

                {novaMensagem ? (
                  <View style={styles.newMsgBadge}>
                    <Text style={styles.newMsgBadgeText}>Nova mensagem</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  {statusPermiteChat(pedido.status) && (
                    <ActionButton
                      label={novaMensagem ? "Abrir chat • Nova mensagem" : "Abrir chat"}
                      onPress={() => abrirChat(pedido)}
                      variant="primary"
                      disabled={atualizandoId !== null}
                    />
                  )}

                  {statusPermiteChat(pedido.status) && (
                    <ActionButton
                      label={textoBotaoMapa(pedido.status)}
                      onPress={() => acompanharNoMapa(pedido)}
                      variant="secondary"
                      disabled={atualizandoId !== null}
                    />
                  )}

                  {tipoAtendimento === "fixo" && pedido.status === "aceito" && (
                    <ActionButton
                      label={atualizandoId === pedido.id ? "Iniciando..." : "Iniciar rota"}
                      onPress={() => iniciarRotaClienteFixo(pedido)}
                      variant="warning"
                      disabled={atualizandoId !== null}
                    />
                  )}

                  {tipoAtendimento === "fixo" && pedido.status === "cliente_a_caminho" && (
                    <ActionButton
                      label={atualizandoId === pedido.id ? "Salvando..." : "Cheguei"}
                      onPress={() => marcarClienteChegou(pedido)}
                      variant="success"
                      disabled={atualizandoId !== null}
                    />
                  )}

                  {pedido.status === "concluido" && !jaFoiAvaliado(pedido.id) && (
                    <ActionButton
                      label="Avaliar profissional"
                      onPress={() => avaliarProfissional(pedido)}
                      variant="primary"
                    />
                  )}
                </View>

                {pedido.status === "concluido" && jaFoiAvaliado(pedido.id) && (
                  <View style={styles.successBadge}>
                    <Text style={styles.successBadgeText}>Avaliação enviada</Text>
                  </View>
                )}

                {pedido.status === "recusado" && (
                  <View style={styles.errorBadge}>
                    <Text style={styles.errorBadgeText}>
                      O profissional recusou este pedido.
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    scrollContent: { paddingBottom: 40, gap: 14 },

    bannerAtivo: {
      backgroundColor: "rgba(59,130,246,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    bannerAtivoTitulo: {
      color: theme.colors.primary,
      fontSize: 15,
      fontWeight: "800",
      marginBottom: 4,
    },
    bannerAtivoTexto: {
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 19,
    },
    bannerFeedback: {
      backgroundColor: "rgba(34,197,94,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
    },
    bannerFeedbackText: {
      color: theme.colors.success,
      fontSize: 13,
      fontWeight: "800",
    },

    centerState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    stateText: {
      marginTop: 12,
      color: theme.colors.textSecondary,
      fontSize: 15,
      textAlign: "center",
    },
    emptyCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
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
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    cardTop: { flexDirection: "row", alignItems: "center" },
    avatar: {
      width: 62,
      height: 62,
      borderRadius: 31,
      marginRight: 12,
    },
    avatarFallback: {
      width: 62,
      height: 62,
      borderRadius: 31,
      marginRight: 12,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarFallbackText: {
      color: "#fff",
      fontSize: 22,
      fontWeight: "800",
    },
    cardInfo: { flex: 1 },
    profissionalNome: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 6,
    },
    infoText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 2,
    },
    timeBox: {
      marginTop: 14,
      backgroundColor: "rgba(34,197,94,0.10)",
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.25)",
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    timeText: {
      color: theme.colors.success,
      fontSize: 14,
      fontWeight: "700",
    },
    statusBadge: {
      alignSelf: "flex-start",
      marginTop: 14,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    statusBadgeText: { fontSize: 12, fontWeight: "800" },
    msgBox: {
      marginTop: 12,
      backgroundColor: theme.colors.cardSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    msgLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginBottom: 4,
      fontWeight: "700",
    },
    msgText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    newMsgBadge: {
      alignSelf: "flex-start",
      marginTop: 12,
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
    actions: { marginTop: 14, gap: 10 },
    successBadge: {
      alignSelf: "flex-start",
      marginTop: 14,
      backgroundColor: "rgba(34,197,94,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    successBadgeText: {
      color: theme.colors.success,
      fontWeight: "800",
      fontSize: 12,
    },
    errorBadge: {
      alignSelf: "flex-start",
      marginTop: 14,
      backgroundColor: "rgba(239,68,68,0.12)",
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    errorBadgeText: {
      color: theme.colors.danger,
      fontWeight: "800",
      fontSize: 12,
    },
  });
}
