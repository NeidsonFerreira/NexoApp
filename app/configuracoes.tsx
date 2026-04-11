import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";
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
};

function statusBloqueiaSaidaCliente(status?: StatusPedido) {
  return (
    status === "aceito" ||
    status === "a_caminho" ||
    status === "chegou" ||
    status === "cliente_a_caminho" ||
    status === "cliente_chegou"
  );
}

const STORAGE_KEYS = {
  notif: "@config_cliente:notificacoesAtivas",
  loc: "@config_cliente:localizacaoAtiva",
  dismissAviso: "@config_cliente:ocultarAvisoGlobal",
};

export default function Configuracoes() {
  const { theme, themeMode, toggleTheme } = useAppTheme();

  const [notificacoesAtivas, setNotificacoesAtivas] = useState(false);
  const [localizacaoAtiva, setLocalizacaoAtiva] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [avisoGlobal, setAvisoGlobal] = useState("");
  const [carregandoPermissoes, setCarregandoPermissoes] = useState(true);
  const [alterandoNotif, setAlterandoNotif] = useState(false);
  const [alterandoLocalizacao, setAlterandoLocalizacao] = useState(false);
  const [testandoNotif, setTestandoNotif] = useState(false);
  const [testandoLocalizacao, setTestandoLocalizacao] = useState(false);
  const [erroTela, setErroTela] = useState("");
  const [ocultarAvisoGlobal, setOcultarAvisoGlobal] = useState(false);

  useEffect(() => {
    carregarPreferenciasLocais();
    verificarPermissoes(true);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "pedidos"),
      where("clienteId", "==", user.uid)
    );

    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lista: Pedido[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as any),
        }));

        setPedidos(lista);
      },
      (error) => {
        console.log("Erro ao ouvir pedidos do cliente:", error);
        setErroTela("Não foi possível atualizar seus pedidos agora.");
      }
    );

    return () => unsubscribe && unsubscribe();
  }, []);

  useEffect(() => {
    const ref = doc(db, "configuracoes", "app");

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (snap.exists()) {
          const aviso = String(snap.data()?.avisoGlobal || "").trim();
          setAvisoGlobal(aviso);

          try {
            const salvo = await AsyncStorage.getItem(STORAGE_KEYS.dismissAviso);
            setOcultarAvisoGlobal(salvo === aviso && !!aviso);
          } catch {
            setOcultarAvisoGlobal(false);
          }
        } else {
          setAvisoGlobal("");
          setOcultarAvisoGlobal(false);
        }
      },
      (error) => {
        console.log("Erro ao ouvir aviso global:", error);
        setErroTela("Não foi possível atualizar o aviso global.");
      }
    );

    return () => unsub();
  }, []);

  const pedidoAtivo = useMemo(() => {
    return pedidos.find((p) => statusBloqueiaSaidaCliente(p.status));
  }, [pedidos]);

  async function carregarPreferenciasLocais() {
    try {
      const [notifCache, locCache] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.notif),
        AsyncStorage.getItem(STORAGE_KEYS.loc),
      ]);

      if (notifCache === "true" || notifCache === "false") {
        setNotificacoesAtivas(notifCache === "true");
      }

      if (locCache === "true" || locCache === "false") {
        setLocalizacaoAtiva(locCache === "true");
      }
    } catch (error) {
      console.log("Erro ao carregar preferências locais:", error);
    }
  }

  async function salvarPreferenciasLocais(
    notif: boolean,
    loc: boolean
  ) {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.notif, String(notif)),
        AsyncStorage.setItem(STORAGE_KEYS.loc, String(loc)),
      ]);
    } catch (error) {
      console.log("Erro ao salvar preferências locais:", error);
    }
  }

  async function verificarPermissoes(silencioso = false) {
    try {
      const notif = await Notifications.getPermissionsAsync();
      const notifAtiva =
        notif.granted ||
        notif.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      const loc = await Location.getForegroundPermissionsAsync();
      const locAtiva = loc.status === "granted";

      setNotificacoesAtivas(notifAtiva);
      setLocalizacaoAtiva(locAtiva);

      await salvarPreferenciasLocais(notifAtiva, locAtiva);
      if (!silencioso) setErroTela("");
    } catch (error) {
      console.log("Erro ao verificar permissões:", error);
      if (!silencioso) {
        setErroTela("Não foi possível verificar as permissões do dispositivo.");
      }
    } finally {
      setCarregandoPermissoes(false);
    }
  }

  async function abrirConfigSistema() {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert("Erro", "Não foi possível abrir as configurações do celular.");
    }
  }

  async function alternarNotificacoes() {
    try {
      if (alterandoNotif) return;
      setAlterandoNotif(true);

      const permissaoAtual = await Notifications.getPermissionsAsync();
      const grantedAtual =
        permissaoAtual.granted ||
        permissaoAtual.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      if (!grantedAtual) {
        const novaPermissao = await Notifications.requestPermissionsAsync();
        const grantedNovo =
          novaPermissao.granted ||
          novaPermissao.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

        if (!grantedNovo) {
          Alert.alert(
            "Permissão necessária",
            "Ative manualmente as notificações nas configurações do celular.",
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Abrir configurações", onPress: abrirConfigSistema },
            ]
          );
          return;
        }

        setNotificacoesAtivas(true);
        await salvarPreferenciasLocais(true, localizacaoAtiva);

        if (Constants.appOwnership === "expo" && Platform.OS === "android") {
          Alert.alert(
            "Aviso",
            "No Expo Go Android, notificações push remotas têm limitações. Em build do app, tudo funciona normalmente."
          );
        }

        Alert.alert("Sucesso", "Notificações ativadas.");
        return;
      }

      Alert.alert(
        "Gerenciar notificações",
        "Para desativar totalmente as notificações, abra as configurações do celular.",
        [
          { text: "Fechar", style: "cancel" },
          { text: "Abrir configurações", onPress: abrirConfigSistema },
        ]
      );
    } catch (error) {
      console.log("Erro ao alterar notificações:", error);
      Alert.alert("Erro", "Não foi possível alterar as notificações.");
    } finally {
      setAlterandoNotif(false);
      await verificarPermissoes(true);
    }
  }

  async function alternarLocalizacao() {
    try {
      if (alterandoLocalizacao) return;
      setAlterandoLocalizacao(true);

      const permissaoAtual = await Location.getForegroundPermissionsAsync();

      if (permissaoAtual.status !== "granted") {
        const novaPermissao = await Location.requestForegroundPermissionsAsync();

        if (novaPermissao.status !== "granted") {
          Alert.alert(
            "Permissão necessária",
            "Ative manualmente a localização nas configurações do celular.",
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Abrir configurações", onPress: abrirConfigSistema },
            ]
          );
          return;
        }

        setLocalizacaoAtiva(true);
        await salvarPreferenciasLocais(notificacoesAtivas, true);
        Alert.alert("Sucesso", "Localização ativada.");
        return;
      }

      Alert.alert(
        "Gerenciar localização",
        "Para alterar ou desativar a localização, abra as configurações do celular.",
        [
          { text: "Fechar", style: "cancel" },
          { text: "Abrir configurações", onPress: abrirConfigSistema },
        ]
      );
    } catch (error) {
      console.log("Erro ao alterar localização:", error);
      Alert.alert("Erro", "Não foi possível alterar a localização.");
    } finally {
      setAlterandoLocalizacao(false);
      await verificarPermissoes(true);
    }
  }

  async function testarNotificacao() {
    try {
      if (testandoNotif) return;
      setTestandoNotif(true);

      const permissao = await Notifications.getPermissionsAsync();
      const granted =
        permissao.granted ||
        permissao.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      if (!granted) {
        Alert.alert(
          "Permissão necessária",
          "Ative as notificações antes de testar.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir configurações", onPress: abrirConfigSistema },
          ]
        );
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Teste de notificação",
          body: "As notificações do app estão funcionando. 🔔",
        },
        trigger: null,
      });

      Alert.alert("Sucesso", "Notificação de teste enviada.");
    } catch (error) {
      console.log("Erro ao testar notificação:", error);
      Alert.alert("Erro", "Não foi possível enviar a notificação de teste.");
    } finally {
      setTestandoNotif(false);
    }
  }

  async function testarLocalizacao() {
    try {
      if (testandoLocalizacao) return;
      setTestandoLocalizacao(true);

      const permissao = await Location.getForegroundPermissionsAsync();
      if (permissao.status !== "granted") {
        Alert.alert(
          "Permissão necessária",
          "Ative a localização antes de testar.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir configurações", onPress: abrirConfigSistema },
          ]
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      Alert.alert(
        "Localização atual",
        `Lat: ${loc.coords.latitude.toFixed(6)}\nLng: ${loc.coords.longitude.toFixed(6)}`
      );
    } catch (error) {
      console.log("Erro ao testar localização:", error);
      Alert.alert("Erro", "Não foi possível obter sua localização.");
    } finally {
      setTestandoLocalizacao(false);
    }
  }

  function abrirPolitica() {
    Linking.openURL("https://seusite.com/politica").catch(() => {
      Alert.alert("Erro", "Não foi possível abrir a política de privacidade.");
    });
  }

  function abrirTermos() {
    Linking.openURL("https://seusite.com/termos").catch(() => {
      Alert.alert("Erro", "Não foi possível abrir os termos de uso.");
    });
  }

  async function fecharAvisoGlobal() {
    try {
      setOcultarAvisoGlobal(true);
      await AsyncStorage.setItem(STORAGE_KEYS.dismissAviso, avisoGlobal);
    } catch (error) {
      console.log("Erro ao ocultar aviso global:", error);
    }
  }

  async function sairDaConta() {
    if (pedidoAtivo) {
      Alert.alert(
        "Atendimento em andamento",
        "Finalize o pedido antes de sair."
      );
      return;
    }

    Alert.alert("Sair da conta", "Deseja realmente sair da sua conta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.multiRemove([
              STORAGE_KEYS.notif,
              STORAGE_KEYS.loc,
              STORAGE_KEYS.dismissAviso,
            ]);
            await signOut(auth);
          } catch (error) {
            console.log("Erro ao sair:", error);
            Alert.alert("Erro", "Não foi possível sair da conta.");
            return;
          }

          router.replace("/");
        },
      },
    ]);
  }

  const versao =
    (Constants.expoConfig?.version as string) ||
    (Constants.manifest2?.extra?.expoClient?.version as string) ||
    "1.0.0";

  const styles = createStyles(theme);

  return (
    <ScreenContainer>
      <AppHeader
        title="Configurações"
        subtitle="Controle permissões, aparência, privacidade e sua conta"
        showBackButton
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!!erroTela.trim() && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Atualização com falha</Text>
            <Text style={styles.errorText}>{erroTela.trim()}</Text>
          </View>
        )}

        {!!avisoGlobal.trim() && !ocultarAvisoGlobal && (
          <View style={styles.aviso}>
            <View style={styles.avisoTop}>
              <Text style={styles.avisoTitulo}>Aviso do app</Text>

              <TouchableOpacity onPress={fecharAvisoGlobal}>
                <Text style={styles.avisoFechar}>Fechar</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.avisoTexto}>{avisoGlobal.trim()}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Permissões</Text>

          <View style={styles.linha}>
            <View style={styles.linhaTexto}>
              <Text style={styles.itemTitulo}>Notificações</Text>
              <Text style={styles.itemSubtitulo}>
                Receber atualizações de pedidos e atendimentos
              </Text>
            </View>

            <Switch
              value={notificacoesAtivas}
              onValueChange={alternarNotificacoes}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
              disabled={alterandoNotif || carregandoPermissoes}
            />
          </View>

          <View style={styles.permissaoInfo}>
            <Text style={styles.permissaoInfoText}>
              {carregandoPermissoes
                ? "Verificando permissões..."
                : notificacoesAtivas
                ? "Notificações ativas"
                : "Notificações desativadas"}
            </Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title={testandoNotif ? "TESTANDO..." : "TESTAR NOTIFICAÇÃO"}
              onPress={testarNotificacao}
              variant="neutral"
              disabled={testandoNotif || alterandoNotif}
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="ABRIR CONFIGURAÇÕES DO CELULAR"
              onPress={abrirConfigSistema}
              variant="neutral"
              disabled={alterandoNotif}
            />
          </View>

          <View style={styles.divisor} />

          <View style={styles.linhaSemBorda}>
            <View style={styles.linhaTexto}>
              <Text style={styles.itemTitulo}>Localização</Text>
              <Text style={styles.itemSubtitulo}>
                Permitir uso do mapa e rastreamento de rota
              </Text>
            </View>

            <Switch
              value={localizacaoAtiva}
              onValueChange={alternarLocalizacao}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
              disabled={alterandoLocalizacao || carregandoPermissoes}
            />
          </View>

          <View style={styles.permissaoInfo}>
            <Text style={styles.permissaoInfoText}>
              {carregandoPermissoes
                ? "Verificando permissões..."
                : localizacaoAtiva
                ? "Localização ativa"
                : "Localização desativada"}
            </Text>
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title={testandoLocalizacao ? "TESTANDO..." : "TESTAR LOCALIZAÇÃO"}
              onPress={testarLocalizacao}
              variant="neutral"
              disabled={testandoLocalizacao || alterandoLocalizacao}
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="ABRIR CONFIGURAÇÕES DO CELULAR"
              onPress={abrirConfigSistema}
              variant="neutral"
              disabled={alterandoLocalizacao}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Aparência</Text>

          <View style={styles.linhaSemBorda}>
            <View style={styles.linhaTexto}>
              <Text style={styles.itemTitulo}>Tema escuro</Text>
              <Text style={styles.itemSubtitulo}>
                Alterar entre modo escuro e claro
              </Text>
            </View>

            <Switch
              value={themeMode === "dark"}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Privacidade e termos</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="POLÍTICA DE PRIVACIDADE"
              onPress={abrirPolitica}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="TERMOS DE USO"
              onPress={abrirTermos}
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Aplicativo</Text>

          <View style={styles.infoLinha}>
            <Text style={styles.infoTitulo}>Versão</Text>
            <Text style={styles.infoValor}>{versao}</Text>
          </View>

          {!!auth.currentUser?.uid && (
            <View style={styles.infoLinha}>
              <Text style={styles.infoTitulo}>ID do usuário</Text>
              <Text style={styles.infoValorSmall}>{auth.currentUser.uid}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Conta</Text>

          {!!pedidoAtivo && (
            <View style={styles.avisoBloqueio}>
              <Text style={styles.avisoTitulo}>🚧 Atendimento em andamento</Text>
              <Text style={styles.avisoTextoBloqueio}>
                Você não pode sair da conta enquanto houver um pedido ativo.
              </Text>
            </View>
          )}

          <View style={styles.buttonTop}>
            <ActionButton
              title={
                pedidoAtivo
                  ? "SAÍDA BLOQUEADA DURANTE O ATENDIMENTO"
                  : "SAIR DA CONTA"
              }
              onPress={sairDaConta}
              variant="danger"
              disabled={!!pedidoAtivo}
            />
          </View>
        </View>

        {(alterandoNotif ||
          alterandoLocalizacao ||
          testandoNotif ||
          testandoLocalizacao) && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>
              Atualizando suas configurações...
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: ReturnType<typeof import("../components/theme").createTheme>) {
  return StyleSheet.create({
    content: {
      paddingBottom: 40,
    },

    errorCard: {
      backgroundColor:
        themeModeIsDark(theme)
          ? "rgba(239, 68, 68, 0.12)"
          : "rgba(239, 68, 68, 0.08)",
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },

    errorTitle: {
      color: theme.colors.danger,
      fontSize: 15,
      fontWeight: "bold",
      marginBottom: 6,
    },

    errorText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    aviso: {
      backgroundColor:
        themeModeIsDark(theme)
          ? "rgba(245, 158, 11, 0.14)"
          : "rgba(245, 158, 11, 0.10)",
      borderWidth: 1,
      borderColor: theme.colors.warning,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },

    avisoTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },

    avisoTitulo: {
      color: theme.colors.warning,
      fontSize: 15,
      fontWeight: "bold",
    },

    avisoFechar: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "bold",
    },

    avisoTexto: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
    },

    cardTitulo: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 14,
    },

    linha: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 18,
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },

    linhaSemBorda: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },

    linhaTexto: {
      flex: 1,
      paddingRight: 12,
    },

    itemTitulo: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "bold",
    },

    itemSubtitulo: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 4,
      lineHeight: 18,
    },

    permissaoInfo: {
      marginBottom: 4,
    },

    permissaoInfoText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },

    divisor: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginTop: 18,
      marginBottom: 6,
    },

    buttonTop: {
      marginTop: 10,
    },

    infoLinha: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 8,
      gap: 12,
    },

    infoTitulo: {
      color: theme.colors.textSecondary,
      fontSize: 15,
    },

    infoValor: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "bold",
    },

    infoValorSmall: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "bold",
      flex: 1,
      textAlign: "right",
    },

    avisoBloqueio: {
      backgroundColor:
        themeModeIsDark(theme)
          ? "rgba(245, 158, 11, 0.12)"
          : "rgba(245, 158, 11, 0.10)",
      borderWidth: 1,
      borderColor: theme.colors.warning,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },

    avisoTextoBloqueio: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 6,
    },

    loadingBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 12,
      marginBottom: 8,
    },

    loadingText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}

function themeModeIsDark(theme: ReturnType<typeof import("../components/theme").createTheme>) {
  return theme.colors.background === "#081a2f";
}