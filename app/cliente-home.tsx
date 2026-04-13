import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, router } from "expo-router";
import { sendEmailVerification } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdBanner } from "../components/BannerAd";
import { OfflineBanner } from "../components/OfflineBanner";
import { useAppTheme } from "../contexts/ThemeContext";
import { handleError } from "../lib/errorHandler";
import { auth, db } from "../lib/firebase";

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
  status?: StatusPedido;
  nomeProfissional?: string;
  servico?: string;
  createdAt?: any;
};

type PlanoCliente = "gratuito" | "premium";

type ClienteInfo = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  fotoPerfil?: string;
  emailVerificado?: boolean;
  bloqueado?: boolean;
  planoCliente?: PlanoCliente;
};

type ConfigApp = {
  appEmManutencao?: boolean;
  avisoGlobal?: string;
};

type FaseHome = "carregando" | "validando_pedido" | "pronta" | "redirecionando";

function statusBloqueiaSaidaCliente(status?: StatusPedido) {
  return (
    status === "aceito" ||
    status === "a_caminho" ||
    status === "chegou" ||
    status === "cliente_a_caminho" ||
    status === "cliente_chegou"
  );
}

function textoStatusAtivo(status?: StatusPedido) {
  switch (status) {
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
    default:
      return "Atendimento em andamento";
  }
}

function subtituloHero(pedidoAtivo: Pedido | undefined) {
  if (pedidoAtivo) {
    return "Seu atendimento está em andamento. Acompanhe tudo em tempo real.";
  }
  return "Encontre profissionais, acompanhe pedidos e gerencie sua conta.";
}

export default function ClienteHome() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [semUser, setSemUser] = useState(false);
  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [appEmManutencao, setAppEmManutencao] = useState(false);
  const [avisoGlobal, setAvisoGlobal] = useState("");
  const [erroTela, setErroTela] = useState("");
  const [faseHome, setFaseHome] = useState<FaseHome>("carregando");

  const validandoPedidoRef = useRef(false);
  const ultimoPedidoValidadoRef = useRef<string | null>(null);
  const redirecionandoRef = useRef(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const moveAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(moveAnim, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, moveAnim]);

  const carregarBasico = useCallback(async () => {
    const user = auth.currentUser;

    if (!user) {
      setSemUser(true);
      setCarregando(false);
      setRefreshing(false);
      return;
    }

    try {
      const snapConfig = await getDoc(doc(db, "configuracoes", "app"));
      if (snapConfig.exists()) {
        const dadosConfig = snapConfig.data() as ConfigApp;
        setAppEmManutencao(dadosConfig.appEmManutencao === true);
        setAvisoGlobal(dadosConfig.avisoGlobal || "");
      } else {
        setAppEmManutencao(false);
        setAvisoGlobal("");
      }

      const snapUser = await getDoc(doc(db, "users", user.uid));
      if (snapUser.exists()) {
        const dados = snapUser.data() as any;
        setCliente({
          id: snapUser.id,
          nome: dados.nome || user.displayName || "Cliente",
          email: dados.email || user.email || "",
          telefone: dados.telefone || "",
          fotoPerfil: dados.fotoPerfil || "",
          emailVerificado: user.emailVerified === true,
          bloqueado: dados.bloqueado === true,
          planoCliente:
            String(dados.planoCliente || "gratuito").toLowerCase() === "premium"
              ? "premium"
              : "gratuito",
        });
      } else {
        setCliente({
          id: user.uid,
          nome: user.displayName || "Cliente",
          email: user.email || "",
          telefone: "",
          fotoPerfil: "",
          emailVerificado: user.emailVerified === true,
          bloqueado: false,
          planoCliente: "gratuito",
        });
      }
    } catch (error) {
      handleError(error, "ClienteHome.carregarBasico");
      setErroTela("Não foi possível atualizar a sua área agora.");
    } finally {
      setCarregando(false);
      setRefreshing(false);
      setFaseHome("pronta");
    }
  }, []);

  useEffect(() => {
    let unsubscribePedidos: (() => void) | undefined;
    let unsubscribeConfig: (() => void) | undefined;
    let unsubscribeUser: (() => void) | undefined;
    let ativo = true;

    async function validarPedidoAtivo(userId: string, pedidoId: string) {
      if (validandoPedidoRef.current) return;
      if (ultimoPedidoValidadoRef.current === pedidoId) return;

      validandoPedidoRef.current = true;
      ultimoPedidoValidadoRef.current = pedidoId;
      setFaseHome("validando_pedido");

      try {
        const pedidoSnap = await getDoc(doc(db, "pedidos", pedidoId));

        if (!ativo) return;

        if (!pedidoSnap.exists()) {
          await updateDoc(doc(db, "users", userId), {
            pedidoAtivoId: null,
            emAtendimento: false,
          }).catch(() => null);

          setPedidos([]);
          setFaseHome("pronta");
          setCarregando(false);
          return;
        }

        const pedido = {
          id: pedidoSnap.id,
          ...(pedidoSnap.data() as Omit<Pedido, "id">),
        } as Pedido;

        setPedidos([pedido]);

        if (!redirecionandoRef.current && statusBloqueiaSaidaCliente(pedido.status)) {
          redirecionandoRef.current = true;
          setFaseHome("redirecionando");
          setTimeout(() => {
            router.replace("/pedidos");
          }, 0);
        } else {
          setFaseHome("pronta");
          setCarregando(false);
        }
      } catch (error) {
        handleError(error, "ClienteHome.validarPedidoAtivo");
        if (ativo) {
          setErroTela("Não foi possível validar seu atendimento agora.");
          setFaseHome("pronta");
          setCarregando(false);
        }
      } finally {
        validandoPedidoRef.current = false;
      }
    }

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

        unsubscribeConfig = onSnapshot(
          doc(db, "configuracoes", "app"),
          (snapConfig) => {
            if (!ativo) return;
            if (!snapConfig.exists()) {
              setAppEmManutencao(false);
              setAvisoGlobal("");
              return;
            }
            const dadosConfig = snapConfig.data() as ConfigApp;
            setAppEmManutencao(dadosConfig.appEmManutencao === true);
            setAvisoGlobal(dadosConfig.avisoGlobal || "");
          },
          (error) => handleError(error, "ClienteHome.snapshotConfig")
        );

        unsubscribeUser = onSnapshot(
          doc(db, "users", user.uid),
          async (snapUser) => {
            if (!ativo) return;

            if (!snapUser.exists()) {
              setCliente({
                id: user.uid,
                nome: user.displayName || "Cliente",
                email: user.email || "",
                emailVerificado: user.emailVerified === true,
                bloqueado: false,
                planoCliente: "gratuito",
              });
              setFaseHome("pronta");
              setCarregando(false);
              return;
            }

            const dados = snapUser.data() as any;

            setCliente({
              id: snapUser.id,
              nome: dados.nome || user.displayName || "Cliente",
              email: dados.email || user.email || "",
              telefone: dados.telefone || "",
              fotoPerfil: dados.fotoPerfil || "",
              emailVerificado: user.emailVerified === true,
              bloqueado: dados.bloqueado === true,
              planoCliente:
                String(dados.planoCliente || "gratuito").toLowerCase() === "premium"
                  ? "premium"
                  : "gratuito",
            });

            const pedidoAtivoId = String(dados.pedidoAtivoId || "").trim();

            if (pedidoAtivoId) {
              await validarPedidoAtivo(user.uid, pedidoAtivoId);
              return;
            }

            ultimoPedidoValidadoRef.current = null;
            redirecionandoRef.current = false;
            setFaseHome("pronta");
            setCarregando(false);

            if (unsubscribePedidos) {
              unsubscribePedidos();
              unsubscribePedidos = undefined;
            }

            const q = query(
              collection(db, "pedidos"),
              where("clienteId", "==", user.uid)
            );

            unsubscribePedidos = onSnapshot(
              q,
              (snapshot) => {
                if (!ativo) return;
                const lista = snapshot.docs.map((docSnap) => ({
                  id: docSnap.id,
                  ...(docSnap.data() as Omit<Pedido, "id">),
                })) as Pedido[];
                setPedidos(lista);
              },
              (error) => handleError(error, "ClienteHome.snapshotPedidos")
            );
          },
          (error) => {
            handleError(error, "ClienteHome.snapshotUser");
            if (ativo) {
              setErroTela("Não foi possível carregar sua área agora.");
              setFaseHome("pronta");
              setCarregando(false);
            }
          }
        );
      } catch (error) {
        handleError(error, "ClienteHome.iniciar");
        if (ativo) {
          setErroTela("Não foi possível abrir sua área agora.");
          setFaseHome("pronta");
          setCarregando(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      if (unsubscribePedidos) unsubscribePedidos();
      if (unsubscribeConfig) unsubscribeConfig();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  const pedidoAtivo = useMemo(
    () => pedidos.find((pedido) => statusBloqueiaSaidaCliente(pedido.status)),
    [pedidos]
  );

  const totalPedidos = useMemo(() => pedidos.length, [pedidos]);
  const totalPedidosAtivos = useMemo(
    () => pedidos.filter((pedido) => statusBloqueiaSaidaCliente(pedido.status)).length,
    [pedidos]
  );
  const ultimoPedido = useMemo(() => pedidos[0], [pedidos]);

  const emailVerificado = cliente?.emailVerificado === true;
  const contaBloqueada = cliente?.bloqueado === true;
  const clientePremium = cliente?.planoCliente === "premium";

  async function reenviarVerificacaoEmail() {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        return;
      }

      setEnviandoEmail(true);
      await sendEmailVerification(user);
      Alert.alert("E-mail enviado", "Enviamos um novo link de verificação.");
    } catch (error) {
      handleError(error, "ClienteHome.reenviarVerificacaoEmail");
      Alert.alert("Erro", "Não foi possível enviar o e-mail agora.");
    } finally {
      setEnviandoEmail(false);
    }
  }

  async function atualizarStatusEmail() {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        return;
      }

      await user.reload();

      setCliente((atual) =>
        atual
          ? { ...atual, emailVerificado: auth.currentUser?.emailVerified === true }
          : atual
      );

      if (auth.currentUser?.emailVerified) {
        Alert.alert("Sucesso", "Seu e-mail foi verificado com sucesso.");
      } else {
        Alert.alert("Ainda não verificado", "Abra o link no e-mail e depois toque em 'Já verifiquei'.");
      }
    } catch (error) {
      handleError(error, "ClienteHome.atualizarStatusEmail");
      Alert.alert("Erro", "Não foi possível atualizar o status do e-mail.");
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setErroTela("");
    carregarBasico();
  }, [carregarBasico]);

  function bloquearAcaoSensivel() {
    if (appEmManutencao) {
      router.push("/manutencao");
      return true;
    }

    if (contaBloqueada) {
      Alert.alert(
        "Conta bloqueada",
        "Sua conta está bloqueada no momento. Fale com o suporte."
      );
      return true;
    }

    return false;
  }

  function abrirServicos() {
    if (bloquearAcaoSensivel()) return;
    router.push("/servicos");
  }

  function abrirMapa() {
    if (bloquearAcaoSensivel()) return;
    router.push("/mapa");
  }

  function abrirPedidos() {
    if (bloquearAcaoSensivel()) return;
    router.push("/pedidos");
  }

  function abrirPerfil() {
    router.push("/perfil-cliente");
  }

  function abrirAjuda() {
    router.push("/ajuda");
  }

  function abrirConfiguracoes() {
    router.push("/configuracoes");
  }

  function abrirPlanoCliente() {
    router.push("/plano-cliente");
  }

  if (carregando) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>
          {faseHome === "validando_pedido"
            ? "Validando atendimento..."
            : "Carregando sua home..."}
        </Text>
      </SafeAreaView>
    );
  }

  if (semUser) {
    return <Redirect href="/" />;
  }

  if (appEmManutencao) {
    return <Redirect href="/manutencao" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <OfflineBanner />

        <Animated.View
          style={[
            styles.hero,
            {
              opacity: fadeAnim,
              transform: [{ translateY: moveAnim }],
            },
          ]}
        >
          <BlurView
            intensity={22}
            tint={themeMode === "dark" ? "dark" : "light"}
            style={styles.heroBlur}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.badgeRow}>
                <Ionicons name="sparkles-outline" size={18} color="#fff" />
                <Text style={styles.heroBadge}>Área do cliente</Text>
              </View>

              <TouchableOpacity
                style={styles.heroMiniButton}
                onPress={abrirConfiguracoes}
                activeOpacity={0.9}
              >
                <Ionicons name="settings-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.heroTitle}>
              {pedidoAtivo
                ? "Seu atendimento está em andamento"
                : `Olá${cliente?.nome ? `, ${cliente.nome}` : ""}`}
            </Text>

            <Text style={styles.heroSubtitle}>{subtituloHero(pedidoAtivo)}</Text>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>
                  {clientePremium ? "Premium" : "Gratuito"}
                </Text>
                <Text style={styles.heroStatLabel}>Plano</Text>
              </View>

              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{totalPedidos}</Text>
                <Text style={styles.heroStatLabel}>Pedidos</Text>
              </View>

              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{totalPedidosAtivos}</Text>
                <Text style={styles.heroStatLabel}>Ativos</Text>
              </View>
            </View>

            <View style={styles.heroButtonsWrap}>
              {pedidoAtivo ? (
                <TouchableOpacity
                  style={styles.heroPrimaryButton}
                  onPress={abrirPedidos}
                  activeOpacity={0.92}
                >
                  <Ionicons name="radio-outline" size={18} color="#fff" />
                  <Text style={styles.heroPrimaryButtonText}>
                    Acompanhar pedido
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.heroPrimaryButton}
                  onPress={abrirServicos}
                  activeOpacity={0.92}
                >
                  <Ionicons name="search-outline" size={18} color="#fff" />
                  <Text style={styles.heroPrimaryButtonText}>
                    Encontrar serviço
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.heroSecondaryButton}
                onPress={abrirMapa}
                activeOpacity={0.92}
              >
                <Ionicons name="map-outline" size={18} color={theme.colors.text} />
                <Text style={styles.heroSecondaryButtonText}>Ver mapa</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Animated.View>

        {!!erroTela.trim() && (
          <View style={styles.warningCard}>
            <View style={styles.warningTop}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.colors.danger} />
              <Text style={styles.warningTitle}>Falha temporária</Text>
            </View>
            <Text style={styles.warningText}>{erroTela.trim()}</Text>
            <TouchableOpacity style={styles.warningButton} onPress={onRefresh} activeOpacity={0.9}>
              <Text style={styles.warningButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!avisoGlobal.trim() && (
          <View style={styles.noticeCard}>
            <View style={styles.noticeTop}>
              <Ionicons name="megaphone-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.noticeTitle}>Aviso importante</Text>
            </View>
            <Text style={styles.noticeText}>{avisoGlobal.trim()}</Text>
          </View>
        )}

        {contaBloqueada && (
          <View style={styles.blockedCard}>
            <View style={styles.noticeTop}>
              <Ionicons name="ban-outline" size={22} color={theme.colors.danger} />
              <Text style={styles.blockedTitle}>Conta bloqueada</Text>
            </View>
            <Text style={styles.blockedText}>
              Sua conta está bloqueada no momento. Fale com o suporte para entender o motivo.
            </Text>
            <TouchableOpacity style={styles.blockedButton} onPress={abrirAjuda} activeOpacity={0.9}>
              <Text style={styles.blockedButtonText}>Falar com suporte</Text>
            </TouchableOpacity>
          </View>
        )}

        {!emailVerificado && (
          <View style={styles.verifyCard}>
            <View style={styles.noticeTop}>
              <Ionicons name="mail-unread-outline" size={20} color={theme.colors.warning} />
              <Text style={styles.verifyTitle}>E-mail não verificado</Text>
            </View>
            <Text style={styles.verifyText}>
              Verifique seu e-mail para deixar sua conta mais segura e confiável.
            </Text>

            <View style={styles.verifyButtons}>
              <TouchableOpacity
                style={styles.verifyPrimaryButton}
                onPress={reenviarVerificacaoEmail}
                disabled={enviandoEmail}
                activeOpacity={0.9}
              >
                <Text style={styles.verifyPrimaryButtonText}>
                  {enviandoEmail ? "Enviando..." : "Reenviar e-mail"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.verifySecondaryButton}
                onPress={atualizarStatusEmail}
                activeOpacity={0.9}
              >
                <Text style={styles.verifySecondaryButtonText}>Já verifiquei</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {pedidoAtivo ? (
          <View style={styles.activeOrderCard}>
            <View style={styles.activeOrderTop}>
              <Ionicons name="flash-outline" size={20} color={theme.colors.success} />
              <Text style={styles.activeOrderTitle}>Pedido ativo</Text>
            </View>
            <Text style={styles.activeOrderStatus}>{textoStatusAtivo(pedidoAtivo.status)}</Text>
            {!!pedidoAtivo.nomeProfissional && (
              <Text style={styles.activeOrderMeta}>
                Profissional: {pedidoAtivo.nomeProfissional}
              </Text>
            )}
            {!!pedidoAtivo.servico && (
              <Text style={styles.activeOrderMeta}>
                Serviço: {pedidoAtivo.servico}
              </Text>
            )}
            <TouchableOpacity style={styles.activeOrderButton} onPress={abrirPedidos} activeOpacity={0.9}>
              <Text style={styles.activeOrderButtonText}>Abrir pedido</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyJourneyCard}>
            <Text style={styles.emptyJourneyTitle}>Pronto para pedir seu próximo serviço?</Text>
            <Text style={styles.emptyJourneyText}>
              Pesquise profissionais, veja o mapa ou comece pelo serviço que você precisa agora.
            </Text>
            <View style={styles.emptyJourneyButtons}>
              <TouchableOpacity style={styles.emptyPrimary} onPress={abrirServicos} activeOpacity={0.92}>
                <Text style={styles.emptyPrimaryText}>Encontrar serviço</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptySecondary} onPress={abrirMapa} activeOpacity={0.92}>
                <Text style={styles.emptySecondaryText}>Explorar mapa</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Continuidade</Text>
          <Text style={styles.sectionSubtitle}>Retome o que faz mais sentido agora</Text>
        </View>

        <View style={styles.resumeRow}>
          <TouchableOpacity
            style={[styles.resumeCard, styles.resumeCardCompact]}
            onPress={pedidoAtivo ? abrirPedidos : ultimoPedido ? abrirPedidos : abrirServicos}
            activeOpacity={0.94}
          >
            <Ionicons
              name={pedidoAtivo ? "flash-outline" : "time-outline"}
              size={22}
              color={theme.colors.primary}
            />
            <Text style={styles.resumeCardTitle}>
              {pedidoAtivo ? textoStatusAtivo(pedidoAtivo.status) : "Último pedido"}
            </Text>
            <Text style={styles.resumeCardText}>
              {pedidoAtivo
                ? `${pedidoAtivo.servico || "Atendimento"} em andamento`
                : ultimoPedido?.servico
                ? ultimoPedido.servico
                : "Encontre um profissional para começar agora."}
            </Text>
          </TouchableOpacity>

          {!emailVerificado ? (
            <TouchableOpacity
              style={[styles.resumeCard, styles.resumeCardCompact]}
              onPress={reenviarVerificacaoEmail}
              activeOpacity={0.94}
              disabled={enviandoEmail}
            >
              <Ionicons name="mail-unread-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.resumeCardTitle}>Validar e-mail</Text>
              <Text style={styles.resumeCardText}>
                {enviandoEmail ? "Enviando link..." : "Confirme sua conta para manter tudo ativo."}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.resumeCard, styles.resumeCardCompact]}
              onPress={abrirPedidos}
              activeOpacity={0.94}
            >
              <Ionicons name="receipt-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.resumeCardTitle}>Meus pedidos</Text>
              <Text style={styles.resumeCardText}>
                {totalPedidos > 0
                  ? `${totalPedidos} pedido(s) no histórico`
                  : "Acompanhe seus pedidos por aqui."}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {clientePremium ? (
          <View style={styles.premiumCard}>
            <View style={styles.noticeTop}>
              <Ionicons name="diamond-outline" size={20} color={theme.colors.success} />
              <Text style={styles.premiumTitle}>Cliente Premium</Text>
            </View>
            <Text style={styles.premiumText}>
              Você está usando o app sem anúncios e com uma experiência mais limpa.
            </Text>
          </View>
        ) : (
          <View style={styles.upgradeCard}>
            <View style={styles.noticeTop}>
              <Ionicons name="rocket-outline" size={20} color={theme.colors.warning} />
              <Text style={styles.upgradeTitle}>Melhore sua experiência</Text>
            </View>
            <Text style={styles.upgradeText}>
              Assine o plano premium do cliente e navegue sem anúncios.
            </Text>
            <TouchableOpacity style={styles.upgradeButton} onPress={abrirPlanoCliente} activeOpacity={0.9}>
              <Text style={styles.upgradeButtonText}>Conhecer premium</Text>
            </TouchableOpacity>
          </View>
        )}

        {!clientePremium && (
          <View style={styles.bannerWrap}>
            <AdBanner isPremium={false} />
          </View>
        )}

        </ScrollView>

      <View style={styles.bottomBarShadow} pointerEvents="box-none">
        <BlurView
          intensity={30}
          tint={themeMode === "dark" ? "dark" : "light"}
          style={styles.bottomBar}
        >
          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirPerfil}
            activeOpacity={0.88}
          >
            <View style={styles.bottomIconWrap}>
              <Ionicons name="person-outline" size={18} color={theme.colors.text} />
            </View>
            <Text style={styles.bottomText}>Perfil</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirMapa}
            activeOpacity={0.88}
          >
            <View style={styles.bottomIconWrap}>
              <Ionicons name="map-outline" size={18} color={theme.colors.text} />
            </View>
            <Text style={styles.bottomText}>Mapa</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirPedidos}
            activeOpacity={0.88}
          >
            <View style={styles.bottomIconWrap}>
              <Ionicons name="receipt-outline" size={18} color={theme.colors.text} />
            </View>
            <Text style={styles.bottomText}>Pedidos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirAjuda}
            activeOpacity={0.88}
          >
            <View style={styles.bottomIconWrap}>
              <Ionicons name="help-circle-outline" size={18} color={theme.colors.text} />
            </View>
            <Text style={styles.bottomText}>Ajuda</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirConfiguracoes}
            activeOpacity={0.88}
          >
            <View style={styles.bottomIconWrap}>
              <Ionicons name="settings-outline" size={18} color={theme.colors.text} />
            </View>
            <Text style={styles.bottomText}>Config</Text>
          </TouchableOpacity>
        </BlurView>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scroll: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 132,
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
      textAlign: "center",
    },
    hero: {
      marginBottom: 18,
      borderRadius: 28,
      overflow: "hidden",
    },
    heroBlur: {
      padding: 18,
      backgroundColor: isDark ? "rgba(28,28,28,0.75)" : "rgba(28,77,188,0.88)",
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    heroBadge: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "800",
    },
    heroMiniButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    heroTitle: {
      color: "#fff",
      fontSize: 28,
      lineHeight: 34,
      fontWeight: "800",
      marginBottom: 8,
    },
    heroSubtitle: {
      color: "rgba(255,255,255,0.92)",
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 16,
    },
    heroStatsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },
    heroStatCard: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    heroStatValue: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
      marginBottom: 4,
      textAlign: "center",
    },
    heroStatLabel: {
      color: "rgba(255,255,255,0.88)",
      fontSize: 12,
      textAlign: "center",
    },
    heroButtonsWrap: {
      gap: 10,
    },
    heroPrimaryButton: {
      backgroundColor: "rgba(255,255,255,0.16)",
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    heroPrimaryButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
    },
    heroSecondaryButton: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    heroSecondaryButtonText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
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
    warningCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.danger,
      borderWidth: 1.2,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    },
    warningTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    warningTitle: {
      color: theme.colors.danger,
      fontSize: 18,
      fontWeight: "800",
    },
    warningText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    warningButton: {
      backgroundColor: theme.colors.danger,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    warningButtonText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 15,
    },
    noticeCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.primary,
      borderWidth: 1.2,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    },
    noticeTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    noticeTitle: {
      color: theme.colors.primary,
      fontSize: 18,
      fontWeight: "800",
    },
    noticeText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    blockedCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.danger,
      borderWidth: 1.2,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    },
    blockedTitle: {
      color: theme.colors.danger,
      fontSize: 18,
      fontWeight: "800",
    },
    blockedText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 12,
    },
    blockedButton: {
      backgroundColor: theme.colors.danger,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    blockedButtonText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "800",
    },
    verifyCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.warning,
      borderWidth: 1.2,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    },
    verifyTitle: {
      color: theme.colors.warning,
      fontSize: 18,
      fontWeight: "800",
    },
    verifyText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 12,
    },
    verifyButtons: {
      gap: 10,
    },
    verifyPrimaryButton: {
      backgroundColor: theme.colors.warning,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    verifyPrimaryButtonText: {
      color: theme.colors.background,
      fontSize: 15,
      fontWeight: "800",
    },
    verifySecondaryButton: {
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    verifySecondaryButtonText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    activeOrderCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 24,
      borderWidth: 1.2,
      borderColor: theme.colors.success,
      padding: 16,
      marginBottom: 18,
    },
    activeOrderTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    activeOrderTitle: {
      color: theme.colors.success,
      fontSize: 19,
      fontWeight: "800",
    },
    activeOrderStatus: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      marginBottom: 8,
    },
    activeOrderMeta: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    activeOrderButton: {
      backgroundColor: theme.colors.success,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 12,
    },
    activeOrderButtonText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "800",
    },
    emptyJourneyCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 18,
    },
    emptyJourneyTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 8,
    },
    emptyJourneyText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 14,
    },
    emptyJourneyButtons: {
      gap: 10,
    },
    emptyPrimary: {
      backgroundColor: theme.colors.primary,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    emptyPrimaryText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "800",
    },
    emptySecondary: {
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptySecondaryText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    grid: {
      gap: 12,
      marginBottom: 18,
    },
    actionCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    actionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 10,
      marginBottom: 6,
    },
    actionText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    resumeRow: {
      gap: 12,
      marginBottom: 18,
    },
    resumeCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    resumeCardTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 10,
      marginBottom: 6,
    },
    resumeCardText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    premiumCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.success,
      borderWidth: 1.2,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    },
    premiumTitle: {
      color: theme.colors.success,
      fontSize: 18,
      fontWeight: "800",
    },
    premiumText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    resumeCardCompact: {
      flex: 1,
      minHeight: 138,
    },
    upgradeCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.warning,
      borderWidth: 1.2,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    },
    upgradeTitle: {
      color: theme.colors.warning,
      fontSize: 18,
      fontWeight: "800",
    },
    upgradeText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    upgradeButton: {
      backgroundColor: theme.colors.warning,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    upgradeButtonText: {
      color: theme.colors.background,
      fontSize: 15,
      fontWeight: "800",
    },
    bannerWrap: {
      alignItems: "center",
      marginBottom: 18,
    },
    bottomGrid: {
      gap: 12,
      marginBottom: 16,
    },
    bottomBarShadow: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 14,
      borderRadius: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.35 : 0.14,
      shadowRadius: 18,
      elevation: 16,
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 24,
      paddingHorizontal: 8,
      paddingVertical: 10,
      overflow: "hidden",
      backgroundColor: isDark ? "rgba(20,24,38,0.94)" : "rgba(255,255,255,0.92)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(28,77,188,0.10)",
    },
    bottomBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
      paddingHorizontal: 2,
    },
    bottomIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(28,77,188,0.08)",
    },
    bottomText: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      textAlign: "center",
    },
    supportCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    supportTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 10,
      marginBottom: 6,
    },
    supportText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
