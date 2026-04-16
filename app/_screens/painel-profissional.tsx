import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import { Redirect, router } from "expo-router";
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ActionButton } from "../../components/ActionButton";
import { AppHeader } from "../../components/AppHeader";
import { MenuCard } from "../../components/MenuCard";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";
import { registrarPushNotificationsAsync } from "../../lib/notifications";

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
  nomeCliente?: string;
  servico?: string;
};

type VerificacaoStatus =
  | "nao_enviado"
  | "pendente"
  | "aprovado"
  | "rejeitado";

type Profissional = {
  id: string;
  nome?: string;
  servico?: string;
  online?: boolean;
  tipo?: string;
  tipoAtendimento?: "fixo" | "movel";
  latitude?: number | null;
  longitude?: number | null;
  plano?: string;
  expoPushToken?: string | null;
  telefone?: string;
  emailVerificado?: boolean;
  perfilCompleto?: boolean;
  documentosEnviados?: boolean;
  verificacaoStatus?: VerificacaoStatus;
  motivoRejeicao?: string;
  bloqueado?: boolean;
};

type ConfigApp = {
  appEmManutencao?: boolean;
  avisoGlobal?: string;
};

type StatusTela = "carregando" | "profissional" | "cliente" | "sem-user";

function coordenadaValida(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function statusEhAtivo(status?: StatusPedido) {
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
      return "Cliente a caminho";
    case "cliente_chegou":
      return "Cliente chegou";
    default:
      return "Atendimento em andamento";
  }
}

export default function PainelProfissional() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [profissional, setProfissional] = useState<Profissional | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [ativandoLocalizacao, setAtivandoLocalizacao] = useState(false);
  const [appEmManutencao, setAppEmManutencao] = useState(false);
  const [avisoGlobal, setAvisoGlobal] = useState("");

  const locationSubscriptionRef =
    useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let unsubscribePedidos: (() => void) | undefined;
    let unsubscribeProfissional: (() => void) | undefined;
    let unsubscribeConfig: (() => void) | undefined;
    let ativo = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        if (!ativo) return;

        if (!user) {
          setStatusTela("sem-user");
          return;
        }

        const refProf = doc(db, "users", user.uid);
        const snapProf = await getDoc(refProf);

        if (!ativo) return;

        if (!snapProf.exists()) {
          setStatusTela("sem-user");
          return;
        }

        const dadosProf = snapProf.data();

        if (dadosProf.tipo !== "profissional") {
          await signOut(auth);
          setStatusTela("cliente");
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
          (error) => {
            console.log("Erro ao ouvir configurações do app:", error);
          }
        );

        const token = await registrarPushNotificationsAsync();

        if (token && token !== dadosProf.expoPushToken) {
          try {
            await updateDoc(refProf, {
              expoPushToken: token,
            });
          } catch (error) {
            console.log("Erro ao salvar expoPushToken do profissional:", error);
          }
        }

        const profissionalInicial: Profissional = {
          id: snapProf.id,
          ...(dadosProf as Omit<Profissional, "id">),
          expoPushToken: token || dadosProf.expoPushToken || null,
          telefone: dadosProf.telefone || "",
          emailVerificado: user.emailVerified === true,
          perfilCompleto: dadosProf.perfilCompleto === true,
          documentosEnviados: dadosProf.documentosEnviados === true,
          verificacaoStatus:
            (dadosProf.verificacaoStatus as VerificacaoStatus) || "nao_enviado",
          motivoRejeicao: dadosProf.motivoRejeicao || "",
          bloqueado: dadosProf.bloqueado === true,
        };

        setProfissional(profissionalInicial);
        setStatusTela("profissional");

        if (unsubscribeProfissional) {
          unsubscribeProfissional();
        }

        unsubscribeProfissional = onSnapshot(refProf, (snapTempoReal) => {
          if (!snapTempoReal.exists() || !ativo) return;

          const dadosAtualizados =
            snapTempoReal.data() as Omit<Profissional, "id">;

          const profissionalAtualizado: Profissional = {
            id: snapTempoReal.id,
            ...dadosAtualizados,
            telefone: dadosAtualizados.telefone || "",
            emailVerificado: auth.currentUser?.emailVerified === true,
            perfilCompleto: dadosAtualizados.perfilCompleto === true,
            documentosEnviados: dadosAtualizados.documentosEnviados === true,
            verificacaoStatus:
              (dadosAtualizados.verificacaoStatus as VerificacaoStatus) ||
              "nao_enviado",
            motivoRejeicao: (dadosAtualizados as any).motivoRejeicao || "",
            bloqueado: (dadosAtualizados as any).bloqueado === true,
          };

          setProfissional(profissionalAtualizado);

          if (
            profissionalAtualizado.online &&
            profissionalAtualizado.tipoAtendimento === "movel" &&
            profissionalAtualizado.verificacaoStatus === "aprovado" &&
            profissionalAtualizado.bloqueado !== true &&
            !appEmManutencao
          ) {
            iniciarRastreamentoTempoReal(profissionalAtualizado.id);
          } else {
            pararRastreamentoTempoReal();
          }
        });

        if (unsubscribePedidos) {
          unsubscribePedidos();
        }

        const q = query(
          collection(db, "pedidos"),
          where("profissionalId", "==", user.uid)
        );

        unsubscribePedidos = onSnapshot(
          q,
          (snapshot) => {
            const lista: Pedido[] = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<Pedido, "id">),
            }));

            setPedidos(lista);
          },
          (error) => {
            console.log("Erro ao ouvir pedidos:", error);
          }
        );

        if (
          profissionalInicial.online &&
          profissionalInicial.tipoAtendimento === "movel" &&
          profissionalInicial.verificacaoStatus === "aprovado" &&
          profissionalInicial.bloqueado !== true &&
          !appEmManutencao
        ) {
          await iniciarRastreamentoTempoReal(profissionalInicial.id);
        } else {
          pararRastreamentoTempoReal();
        }
      } catch (error) {
        console.log("Erro ao carregar painel:", error);
        if (ativo) {
          setStatusTela("sem-user");
        }
      }
    });

    return () => {
      ativo = false;
      unsubscribeAuth();
      if (unsubscribePedidos) unsubscribePedidos();
      if (unsubscribeProfissional) unsubscribeProfissional();
      if (unsubscribeConfig) unsubscribeConfig();
      pararRastreamentoTempoReal();
    };
  }, [appEmManutencao]);

  async function iniciarRastreamentoTempoReal(profissionalId: string) {
    try {
      setAtivandoLocalizacao(true);

      if (locationSubscriptionRef.current) {
        pararRastreamentoTempoReal();
      }

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Erro", "Permissão de localização negada.");
        return;
      }

      const ultimaPosicao = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (
        coordenadaValida(
          ultimaPosicao.coords.latitude,
          ultimaPosicao.coords.longitude
        )
      ) {
        await updateDoc(doc(db, "users", profissionalId), {
          latitude: ultimaPosicao.coords.latitude,
          longitude: ultimaPosicao.coords.longitude,
        });

        setProfissional((prev) =>
          prev
            ? {
                ...prev,
                latitude: ultimaPosicao.coords.latitude,
                longitude: ultimaPosicao.coords.longitude,
              }
            : prev
        );
      }

      locationSubscriptionRef.current = await Location.watchPositionAsync(
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
            await updateDoc(doc(db, "users", profissionalId), {
              latitude,
              longitude,
            });

            setProfissional((prev) =>
              prev ? { ...prev, latitude, longitude } : prev
            );
          } catch (error) {
            console.log("Erro ao atualizar localização em tempo real:", error);
          }
        }
      );
    } catch (error) {
      console.log("Erro ao iniciar rastreamento:", error);
      Alert.alert("Erro", "Não foi possível ativar sua localização agora.");
    } finally {
      setAtivandoLocalizacao(false);
    }
  }

  function pararRastreamentoTempoReal() {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  }

  const pedidoAtivo = useMemo(() => {
    return pedidos.find((pedido) => statusEhAtivo(pedido.status));
  }, [pedidos]);

  const pedidosPendentes = useMemo(() => {
    return pedidos.filter((pedido) => pedido.status === "pendente").length;
  }, [pedidos]);

  const pedidosEmAndamento = useMemo(() => {
    return pedidos.filter((pedido) => statusEhAtivo(pedido.status)).length;
  }, [pedidos]);

  const pedidosConcluidos = useMemo(() => {
    return pedidos.filter((pedido) => pedido.status === "concluido").length;
  }, [pedidos]);

  const emailVerificado = profissional?.emailVerificado === true;
  const perfilCompleto = profissional?.perfilCompleto === true;
  const documentosEnviados = profissional?.documentosEnviados === true;
  const verificacaoStatus = profissional?.verificacaoStatus || "nao_enviado";
  const motivoRejeicao = profissional?.motivoRejeicao || "";
  const contaBloqueada = profissional?.bloqueado === true;

  const precisaCompletarPerfil = !perfilCompleto;
  const precisaEnviarDocumentos =
    perfilCompleto &&
    (!documentosEnviados || verificacaoStatus === "nao_enviado");

  const verificacaoPendente = verificacaoStatus === "pendente";
  const contaVerificada = verificacaoStatus === "aprovado";
  const verificacaoRejeitada = verificacaoStatus === "rejeitado";

  async function reenviarVerificacaoEmail() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        return;
      }

      setEnviandoEmail(true);
      await sendEmailVerification(user);

      Alert.alert(
        "E-mail enviado",
        "Enviamos um novo link de verificação para o seu e-mail."
      );
    } catch (error) {
      console.log("Erro ao reenviar e-mail de verificação:", error);
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

      setProfissional((atual) =>
        atual
          ? {
              ...atual,
              emailVerificado: auth.currentUser?.emailVerified === true,
            }
          : atual
      );

      if (auth.currentUser?.emailVerified) {
        Alert.alert("Sucesso", "Seu e-mail foi verificado com sucesso.");
      } else {
        Alert.alert(
          "Ainda não verificado",
          "Abra o link enviado no seu e-mail e depois toque em 'Já verifiquei'."
        );
      }
    } catch (error) {
      console.log("Erro ao atualizar status do e-mail:", error);
      Alert.alert("Erro", "Não foi possível atualizar o status do e-mail.");
    }
  }

  async function alternarOnline(valor: boolean) {
    try {
      if (!profissional) return;

      if (appEmManutencao) {
        Alert.alert(
          "App em manutenção",
          avisoGlobal?.trim()
            ? avisoGlobal.trim()
            : "O app está temporariamente em manutenção."
        );
        return;
      }

      if (contaBloqueada) {
        Alert.alert(
          "Conta bloqueada",
          "Sua conta está bloqueada no momento. Fale com o suporte para mais informações."
        );
        return;
      }

      if (!emailVerificado) {
        Alert.alert(
          "Verifique seu e-mail",
          "Verifique seu e-mail antes de ativar seu perfil."
        );
        return;
      }

      if (precisaCompletarPerfil) {
        Alert.alert(
          "Complete seu perfil",
          "Preencha seu cadastro profissional antes de ficar online."
        );
        return;
      }

      if (precisaEnviarDocumentos) {
        Alert.alert(
          "Envie seus documentos",
          "Envie seus documentos para ativar sua conta e aparecer no app."
        );
        return;
      }

      if (verificacaoPendente) {
        Alert.alert(
          "Conta em análise",
          "Seus documentos ainda estão em análise. Aguarde a aprovação."
        );
        return;
      }

      if (verificacaoRejeitada) {
        Alert.alert(
          "Verificação recusada",
          "Revise seus documentos e envie novamente para ativar sua conta."
        );
        return;
      }

      if (!valor && pedidoAtivo) {
        Alert.alert(
          "Atendimento em andamento",
          "Você não pode ficar offline enquanto houver um atendimento em andamento."
        );
        return;
      }

      setAlterandoStatus(true);

      const atualizacao: Record<string, any> = {
        online: valor,
      };

      if (!valor && profissional.tipoAtendimento === "movel") {
        atualizacao.latitude = null;
        atualizacao.longitude = null;
      }

      await updateDoc(doc(db, "users", profissional.id), atualizacao);

      setProfissional((prev) =>
        prev
          ? {
              ...prev,
              online: valor,
              latitude:
                !valor && prev.tipoAtendimento === "movel"
                  ? null
                  : prev.latitude,
              longitude:
                !valor && prev.tipoAtendimento === "movel"
                  ? null
                  : prev.longitude,
            }
          : prev
      );

      if (valor && profissional.tipoAtendimento === "movel") {
        await iniciarRastreamentoTempoReal(profissional.id);
      } else {
        pararRastreamentoTempoReal();
      }

      Alert.alert(
        "Status atualizado",
        valor
          ? "Seu perfil está online e visível para clientes."
          : "Seu perfil ficou offline e oculto para clientes."
      );
    } catch (error) {
      console.log("Erro ao atualizar status online:", error);
      Alert.alert("Erro", "Não foi possível atualizar seu status.");
    } finally {
      setAlterandoStatus(false);
    }
  }

  function abrirPerfil() {
    router.push("/cadastro-profissional");
  }

  function abrirPlano() {
    router.push("/planos");
  }

  function abrirPedidos() {
    router.push("/pedidos-profissional");
  }

  function abrirAjuda() {
    router.push("/ajuda-profissional");
  }

  function abrirConfiguracoes() {
    router.push("/configuracoes-profissional");
  }

  function abrirVerificacao() {
    router.push("/verificacao-profissional");
  }

  const planoAtual = profissional?.plano || "gratuito";
  const mostrarUpgrade = planoAtual === "gratuito";
  const planoDestacado = planoAtual !== "gratuito";

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando painel...</Text>
      </View>
    );
  }

  if (statusTela === "sem-user") {
    return <Redirect href="/" />;
  }

  if (statusTela === "cliente") {
    return <Redirect href="/cliente-home" />;
  }

  if (appEmManutencao) {
    return <Redirect href="/manutencao" />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Painel Profissional"
          subtitle="Gerencie seu perfil, seus pedidos e seu status no app"
        />

        <View style={styles.premiumHero}>
          <View style={styles.premiumHeroTop}>
            <View style={styles.premiumProfileWrap}>
              <View style={styles.premiumAvatar}>
                <Text style={styles.premiumAvatarText}>
                  {String(profissional?.nome || "P").trim().charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.premiumProfileInfo}>
                <Text style={styles.premiumHello}>Seu painel premium</Text>
                <Text style={styles.premiumName}>
                  {profissional?.nome || "Profissional"}
                </Text>
                <Text style={styles.premiumService}>
                  {profissional?.servico || "Seu serviço"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.premiumChip,
                contaBloqueada
                  ? styles.premiumChipDanger
                  : contaVerificada
                  ? profissional?.online
                    ? styles.premiumChipSuccess
                    : styles.premiumChipMuted
                  : styles.premiumChipWarning,
              ]}
            >
              <Text style={styles.premiumChipText}>
                {contaBloqueada
                  ? "Bloqueada"
                  : contaVerificada
                  ? profissional?.online
                    ? "Online"
                    : "Offline"
                  : "Pendente"}
              </Text>
            </View>
          </View>

          <Text style={styles.premiumHeroSubtitle}>
            {contaBloqueada
              ? "Sua conta está temporariamente indisponível."
              : contaVerificada
              ? profissional?.online
                ? "Seu perfil está visível para clientes agora."
                : "Fique online para aparecer para clientes."
              : "Conclua as etapas da conta para ativar seu perfil."}
          </Text>

          <View style={styles.premiumStatsRow}>
            <View style={styles.premiumStatCard}>
              <Text style={styles.premiumStatNumber}>{pedidosPendentes}</Text>
              <Text style={styles.premiumStatLabel}>Pendentes</Text>
            </View>

            <View style={styles.premiumStatCard}>
              <Text style={styles.premiumStatNumber}>{pedidosEmAndamento}</Text>
              <Text style={styles.premiumStatLabel}>Em andamento</Text>
            </View>

            <View style={styles.premiumStatCard}>
              <Text style={styles.premiumStatNumber}>{pedidosConcluidos}</Text>
              <Text style={styles.premiumStatLabel}>Concluídos</Text>
            </View>
          </View>

          <View style={styles.heroActionsRow}>
            <TouchableOpacity
              style={styles.heroActionPrimary}
              onPress={abrirPedidos}
              activeOpacity={0.85}
            >
              <Ionicons name="cube-outline" size={18} color="#FFFFFF" />
              <Text style={styles.heroActionPrimaryText}>Meus pedidos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.heroActionSecondary}
              onPress={abrirPerfil}
              activeOpacity={0.85}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={theme.colors.text}
              />
              <Text style={styles.heroActionSecondaryText}>Meu perfil</Text>
            </TouchableOpacity>
          </View>
        </View>

        {contaBloqueada && (
          <View style={styles.cardBloqueio}>
            <View style={styles.cardBloqueioTopo}>
              <Ionicons
                name="ban-outline"
                size={22}
                color={theme.colors.danger}
              />
              <Text style={styles.cardBloqueioTitulo}>Conta bloqueada</Text>
            </View>

            <Text style={styles.cardBloqueioTexto}>
              Sua conta está bloqueada no momento. Entre em contato com o suporte
              para entender o motivo e regularizar sua situação.
            </Text>

            <View style={styles.actionWrap}>
              <ActionButton
                title="FALAR COM SUPORTE"
                onPress={abrirAjuda}
                variant="danger"
              />
            </View>
          </View>
        )}

        {!emailVerificado && !contaBloqueada && (
          <View style={styles.cardVerificacao}>
            <View style={styles.cardVerificacaoTopo}>
              <Ionicons
                name="mail-unread-outline"
                size={22}
                color={theme.colors.warning}
              />
              <Text style={styles.cardVerificacaoTitulo}>
                E-mail não verificado
              </Text>
            </View>

            <Text style={styles.cardVerificacaoTexto}>
              Verifique seu e-mail para aumentar a segurança da sua conta.
            </Text>

            <View style={styles.actionWrap}>
              <ActionButton
                title={enviandoEmail ? "ENVIANDO..." : "REENVIAR E-MAIL"}
                onPress={reenviarVerificacaoEmail}
                variant="warning"
                disabled={enviandoEmail}
              />
            </View>

            <View style={styles.actionWrap}>
              <ActionButton
                title="JÁ VERIFIQUEI"
                onPress={atualizarStatusEmail}
                variant="primary"
              />
            </View>
          </View>
        )}

        {precisaCompletarPerfil && !contaBloqueada && (
          <View style={styles.cardPendencia}>
            <Text style={styles.cardPendenciaTitulo}>Complete seu perfil</Text>
            <Text style={styles.cardPendenciaTexto}>
              Preencha seu cadastro profissional para continuar no app.
            </Text>

            <View style={styles.actionWrap}>
              <ActionButton
                title="COMPLETAR PERFIL"
                onPress={abrirPerfil}
                variant="primary"
              />
            </View>
          </View>
        )}

        {precisaEnviarDocumentos && !contaBloqueada && (
          <View style={styles.cardPendencia}>
            <Text style={styles.cardPendenciaTitulo}>Envie seus documentos</Text>
            <Text style={styles.cardPendenciaTexto}>
              Seu perfil já está pronto. Agora envie seus documentos para ativar
              sua conta e começar a aparecer para clientes.
            </Text>

            <View style={styles.actionWrap}>
              <ActionButton
                title="VERIFICAR CONTA"
                onPress={abrirVerificacao}
                variant="warning"
              />
            </View>
          </View>
        )}

        {verificacaoPendente && !contaBloqueada && (
          <View style={styles.cardPendencia}>
            <Text style={styles.cardPendenciaTitulo}>Conta em análise</Text>
            <Text style={styles.cardPendenciaTexto}>
              Seus documentos foram enviados e estão em análise. Assim que forem
              aprovados, sua conta será ativada.
            </Text>
          </View>
        )}

        {verificacaoRejeitada && !contaBloqueada && (
          <View style={styles.cardPendencia}>
            <Text style={styles.cardPendenciaTitulo}>
              Verificação recusada
            </Text>

            <Text style={styles.cardPendenciaTexto}>
              Seus documentos foram recusados e precisam ser reenviados para
              ativar sua conta.
            </Text>

            {!!motivoRejeicao && (
              <View style={styles.motivoBox}>
                <Text style={styles.motivoTitulo}>Motivo da recusa</Text>
                <Text style={styles.motivoTexto}>{motivoRejeicao}</Text>
              </View>
            )}

            <View style={styles.actionWrap}>
              <ActionButton
                title="REENVIAR DOCUMENTOS"
                onPress={abrirVerificacao}
                variant="warning"
              />
            </View>
          </View>
        )}

        <View style={styles.statusCard}>
          <Text style={styles.nomeProfissional}>
            {profissional?.nome || "Profissional"}
          </Text>

          <Text style={styles.servicoProfissional}>
            {profissional?.servico || "Seu serviço"}
          </Text>

          <View style={styles.onlineRow}>
            <View style={styles.onlineInfo}>
              <View style={styles.statusBadgeRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: contaBloqueada
                        ? theme.colors.danger
                        : contaVerificada
                        ? profissional?.online
                          ? theme.colors.success
                          : theme.colors.textMuted
                        : theme.colors.warning,
                    },
                  ]}
                />
                <Text style={styles.onlineLabel}>
                  {contaBloqueada
                    ? "Conta bloqueada"
                    : contaVerificada
                    ? profissional?.online
                      ? "Online"
                      : "Offline"
                    : "Conta bloqueada"}
                </Text>
              </View>

              <Text style={styles.onlineSubLabel}>
                {contaBloqueada
                  ? "Seu perfil está temporariamente indisponível"
                  : contaVerificada
                  ? profissional?.online
                    ? "Seu perfil está visível para clientes"
                    : "Seu perfil está oculto no momento"
                  : "Complete as etapas da conta para aparecer no app"}
              </Text>

              {ativandoLocalizacao &&
                profissional?.tipoAtendimento === "movel" &&
                !contaBloqueada && (
                  <Text style={styles.localizacaoAtivaTexto}>
                    Ativando localização...
                  </Text>
                )}

              {profissional?.tipoAtendimento === "movel" &&
                profissional?.online &&
                !ativandoLocalizacao &&
                contaVerificada &&
                !contaBloqueada && (
                  <Text style={styles.localizacaoAtivaTexto}>
                    📍 Localização ao vivo ativa
                  </Text>
                )}

              {!!pedidoAtivo && !contaBloqueada && (
                <Text style={styles.atendimentoAtivoTexto}>
                  🚧 Atendimento em andamento
                </Text>
              )}
            </View>

            <Switch
              value={!!profissional?.online}
              onValueChange={alternarOnline}
              disabled={
                alterandoStatus ||
                contaBloqueada ||
                !emailVerificado ||
                precisaCompletarPerfil ||
                precisaEnviarDocumentos ||
                verificacaoPendente ||
                verificacaoRejeitada ||
                !contaVerificada
              }
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.success,
              }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {!!pedidoAtivo && !contaBloqueada && (
          <View style={styles.atendimentoCard}>
            <Text style={styles.atendimentoTitulo}>Atendimento em andamento</Text>
            <Text style={styles.atendimentoTexto}>
              Cliente: {pedidoAtivo.nomeCliente || "Cliente"}
            </Text>
            <Text style={styles.atendimentoTexto}>
              Serviço: {pedidoAtivo.servico || "Serviço"}
            </Text>
            <Text style={styles.atendimentoTexto}>
              Status: {textoStatusAtivo(pedidoAtivo.status)}
            </Text>

            <View style={styles.actionWrap}>
              <ActionButton
                title="ABRIR ATENDIMENTO"
                onPress={abrirPedidos}
                variant="primary"
              />
            </View>
          </View>
        )}

        <View style={styles.resumoRow}>
          <View style={styles.resumoBox}>
            <Text style={styles.resumoNumero}>{pedidosPendentes}</Text>
            <Text style={styles.resumoTexto}>Pendentes</Text>
          </View>

          <View style={styles.resumoBox}>
            <Text style={styles.resumoNumero}>{pedidosEmAndamento}</Text>
            <Text style={styles.resumoTexto}>Em andamento</Text>
          </View>

          <View style={styles.resumoBox}>
            <Text style={styles.resumoNumero}>{pedidosConcluidos}</Text>
            <Text style={styles.resumoTexto}>Concluídos</Text>
          </View>
        </View>

        <MenuCard
          title="MEU PERFIL"
          subtitle="Editar cadastro profissional"
          icon={
            <Ionicons
              name="person-outline"
              size={22}
              color={theme.colors.text}
            />
          }
          borderVariant="primary"
          onPress={abrirPerfil}
        />

        <MenuCard
          title="MEU PLANO"
          subtitle={
            planoDestacado
              ? `Plano atual: ${String(planoAtual).toUpperCase()}`
              : "Ver ou alterar seu plano"
          }
          icon={
            <Ionicons
              name="card-outline"
              size={22}
              color={theme.colors.text}
            />
          }
          borderVariant={planoDestacado ? "success" : "primary"}
          onPress={abrirPlano}
        />

        <View style={styles.badgeWrap}>
          {mostrarUpgrade ? (
            <Text style={styles.badgeUpgrade}>Upgrade disponível</Text>
          ) : (
            <Text style={styles.badgePlanoAtivo}>
              {String(planoAtual).toUpperCase()}
            </Text>
          )}
        </View>

        <MenuCard
          title="MEUS PEDIDOS"
          subtitle="Acompanhar pedidos recebidos"
          icon={
            <Ionicons
              name="cube-outline"
              size={22}
              color={theme.colors.text}
            />
          }
          borderVariant="primary"
          onPress={abrirPedidos}
        />

        {pedidosPendentes > 0 && (
          <View style={styles.badgeWrap}>
            <Text style={styles.badgePendente}>
              {pedidosPendentes > 99 ? "99+" : pedidosPendentes} pendente(s)
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBarShadow}>
        <BlurView
          intensity={Platform.OS === "ios" ? 45 : 22}
          tint={themeMode === "dark" ? "dark" : "light"}
          style={styles.bottomBar}
        >
          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirAjuda}
            activeOpacity={0.85}
          >
            <Ionicons
              name="help-circle-outline"
              size={20}
              color={theme.colors.text}
            />
            <Text style={styles.bottomText}>Ajuda</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={abrirConfiguracoes}
            activeOpacity={0.85}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={theme.colors.text}
            />
            <Text style={styles.bottomText}>Config</Text>
          </TouchableOpacity>
        </BlurView>
      </View>
    </View>
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
    },

    content: {
      paddingHorizontal: theme.spacing.md,
      paddingTop: 12,
      paddingBottom: 110,
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

    premiumHero: {
      backgroundColor: isDark ? "#0F1B3D" : "#F6F8FF",
      borderRadius: 26,
      borderWidth: 1,
      borderColor: isDark ? "#20356F" : "#D7E1FF",
      padding: 18,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.22 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },

    premiumHeroTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },

    premiumProfileWrap: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 14,
    },

    premiumAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? "#173CFF" : theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },

    premiumAvatarText: {
      color: "#FFFFFF",
      fontSize: 26,
      fontWeight: "800",
    },

    premiumProfileInfo: {
      flex: 1,
    },

    premiumHello: {
      color: isDark ? "#8FA8FF" : theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 4,
    },

    premiumName: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800",
      marginBottom: 2,
    },

    premiumService: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },

    premiumChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },

    premiumChipText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
    },

    premiumChipSuccess: {
      backgroundColor: "rgba(38, 191, 107, 0.22)",
      borderColor: "rgba(38, 191, 107, 0.55)",
    },

    premiumChipMuted: {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderColor: "rgba(255,255,255,0.12)",
    },

    premiumChipWarning: {
      backgroundColor: "rgba(255, 184, 0, 0.18)",
      borderColor: "rgba(255, 184, 0, 0.45)",
    },

    premiumChipDanger: {
      backgroundColor: "rgba(255, 93, 93, 0.18)",
      borderColor: "rgba(255, 93, 93, 0.45)",
    },

    premiumHeroSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 14,
    },

    premiumStatsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },

    premiumStatCard: {
      flex: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(35,78,255,0.05)",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(35,78,255,0.08)",
      paddingVertical: 14,
      paddingHorizontal: 10,
      alignItems: "center",
    },

    premiumStatNumber: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 4,
    },

    premiumStatLabel: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center",
    },

    heroActionsRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
    },

    heroActionPrimary: {
      flex: 1,
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
    },

    heroActionPrimaryText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },

    heroActionSecondary: {
      flex: 1,
      minHeight: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "#D7E1FF",
      backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
    },

    heroActionSecondaryText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800",
    },

    cardBloqueio: {
      backgroundColor: isDark ? theme.colors.card : "#FFF5F5",
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      padding: 16,
      marginBottom: 16,
    },

    cardBloqueioTopo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },

    cardBloqueioTitulo: {
      color: theme.colors.danger,
      fontSize: 20,
      fontWeight: "bold",
    },

    cardBloqueioTexto: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },

    cardVerificacao: {
      backgroundColor: isDark ? theme.colors.card : "#FFF8E8",
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: isDark ? theme.colors.warning : "#F4C96B",
      padding: 16,
      marginBottom: 16,
    },

    cardVerificacaoTopo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },

    cardVerificacaoTitulo: {
      color: theme.colors.warning,
      fontSize: 20,
      fontWeight: "bold",
    },

    cardVerificacaoTexto: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },

    cardPendencia: {
      backgroundColor: isDark ? theme.colors.card : "#FFFDF8",
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      padding: 16,
      marginBottom: 16,
    },

    cardPendenciaTitulo: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 8,
    },

    cardPendenciaTexto: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },

    motivoBox: {
      marginTop: 12,
      backgroundColor: theme.colors.cardSoft || theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      padding: 12,
    },

    motivoTitulo: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "bold",
      marginBottom: 4,
    },

    motivoTexto: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },

    statusCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: isDark ? theme.colors.border : "#D9E0EA",
      padding: 18,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.18 : 0.06,
      shadowRadius: 10,
      elevation: 3,
    },

    nomeProfissional: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "bold",
    },

    servicoProfissional: {
      color: theme.colors.textMuted,
      fontSize: 16,
      marginTop: 4,
      marginBottom: 18,
    },

    onlineRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },

    onlineInfo: {
      flex: 1,
      paddingRight: 12,
    },

    statusBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },

    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },

    onlineLabel: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
    },

    onlineSubLabel: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 19,
    },

    localizacaoAtivaTexto: {
      color: theme.colors.success,
      fontSize: 12,
      marginTop: 6,
      fontWeight: "bold",
    },

    atendimentoAtivoTexto: {
      color: theme.colors.warning,
      fontSize: 12,
      marginTop: 6,
      fontWeight: "bold",
    },

    atendimentoCard: {
      backgroundColor: isDark ? theme.colors.card : "#FFFDF8",
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      padding: 16,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    atendimentoTitulo: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 10,
    },

    atendimentoTexto: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginBottom: 6,
    },

    actionWrap: {
      marginTop: 10,
    },

    resumoRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 18,
    },

    resumoBox: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      paddingVertical: 18,
      alignItems: "center",
      borderWidth: 1,
      borderColor: isDark ? theme.colors.border : "#D9E0EA",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },

    resumoNumero: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "bold",
    },

    resumoTexto: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginTop: 4,
    },

    badgeWrap: {
      marginTop: -6,
      marginBottom: 12,
      alignItems: "flex-end",
    },

    badgeUpgrade: {
      color: "#fff",
      backgroundColor: "#E58A00",
      fontWeight: "bold",
      fontSize: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      overflow: "hidden",
    },

    badgePlanoAtivo: {
      color: "#fff",
      backgroundColor: theme.colors.success,
      fontWeight: "bold",
      fontSize: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      overflow: "hidden",
    },

    badgePendente: {
      color: "#fff",
      backgroundColor: theme.colors.danger,
      fontWeight: "bold",
      fontSize: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      overflow: "hidden",
    },

    bottomBarShadow: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 16,
      borderRadius: 22,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.1,
      shadowRadius: 16,
      elevation: 14,
      overflow: "hidden",
    },

    bottomBar: {
      borderRadius: 22,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: isDark
        ? "rgba(15,23,42,0.88)"
        : "rgba(255,255,255,0.96)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(51,65,85,0.9)" : "#D9E0EA",
      flexDirection: "row",
      justifyContent: "space-evenly",
      alignItems: "center",
    },

    bottomBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 4,
    },

    bottomText: {
      fontSize: 11,
      color: theme.colors.text,
      fontWeight: "600",
    },
  });
}