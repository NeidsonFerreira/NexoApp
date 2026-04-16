import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import { Redirect, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  GoogleAuthProvider,
  OAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActionButton } from "../components/ActionButton";
import { AppHeader } from "../components/AppHeader";
import { OfflineBanner } from "../components/OfflineBanner";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../contexts/ThemeContext";
import { loginComEmail } from "../lib/auth";
import { handleError } from "../lib/errorHandler";
import { auth, db, functions } from "../lib/firebase";
import { safeRequest } from "../lib/firebaseService";
import { logError, logEvent } from "../lib/logger";
import { isOnline } from "../lib/network";
import { registrarPushNotificationsAsync } from "../lib/notifications";

WebBrowser.maybeCompleteAuthSession();

type StatusTela = "carregando" | "livre" | "cliente" | "profissional";

type ResultadoValidacao =
  | { ok: true; destino: "cliente" }
  | { ok: false; destino: "livre" | "profissional"; mensagem?: string };

type FinalizarCadastroSocialResponse = {
  ok?: boolean;
  tipo?: string;
};

type VerificarRateLimitLoginResponse = {
  ok?: boolean;
  bloqueado?: boolean;
  tentativasRestantes?: number;
  desbloqueiaEm?: string | null;
};

type RegistrarFalhaLoginResponse = {
  ok?: boolean;
  bloqueado?: boolean;
  tentativas?: number;
  desbloqueiaEm?: string | null;
};

type RegistrarSucessoLoginResponse = {
  ok?: boolean;
};

export default function LoginCliente() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme);
  const isFocused = useIsFocused();
  const { authReady, user, userData, loading, recarregarUserData } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  const googleConfigOk = Boolean(
    googleWebClientId?.trim() &&
      googleAndroidClientId?.trim() &&
      googleIosClientId?.trim()
  );

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId,
    androidClientId: googleAndroidClientId,
    iosClientId: googleIosClientId,
  });

  const emailNormalizado = useMemo(() => email.trim().toLowerCase(), [email]);

  async function tratarEmailNaoVerificado(userAtual: any) {
    Alert.alert(
      "Email não verificado",
      "Você precisa verificar seu email antes de entrar.\n\nQuer que eu reenvie o link agora?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reenviar",
          onPress: async () => {
            try {
              await safeRequest(() => sendEmailVerification(userAtual), {
                timeoutMs: 12000,
                tentativas: 1,
                exigirInternet: true,
                dedupeKey: `login-cliente:reenviar:${userAtual?.uid || "anon"}`,
                priority: 8,
              });

              Alert.alert(
                "Email enviado",
                "Enviamos um novo link de verificação para o seu email."
              );
            } catch (error: any) {
              logError(error, "LoginCliente.reenviarVerificacao");
              handleError(error, "LoginCliente.reenviarVerificacao");
              Alert.alert(
                "Erro",
                error?.message ||
                  "Não foi possível reenviar o email de verificação."
              );
            }
          },
        },
      ]
    );
  }

  async function verificarRateLimit(emailAlvo: string) {
    const callable = httpsCallable<
      { email: string },
      VerificarRateLimitLoginResponse
    >(functions, "verificarRateLimitLogin");

    const result = await safeRequest(() => callable({ email: emailAlvo }), {
      timeoutMs: 15000,
      tentativas: 1,
      exigirInternet: true,
      dedupeKey: `login-cliente:rate:${emailAlvo}`,
      priority: 9,
    });

    return result.data;
  }

  async function registrarFalha(emailAlvo: string, motivo: string) {
    const callable = httpsCallable<
      { email: string; motivo: string; origem: string },
      RegistrarFalhaLoginResponse
    >(functions, "registrarFalhaLogin");

    const result = await safeRequest(
      () =>
        callable({
          email: emailAlvo,
          motivo,
          origem: "login-cliente",
        }),
      {
        timeoutMs: 15000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `login-cliente:falha:${emailAlvo}:${motivo}`,
        priority: 9,
      }
    );

    return result.data;
  }

  async function registrarSucesso(emailAlvo: string) {
    const callable = httpsCallable<
      { email: string; origem: string },
      RegistrarSucessoLoginResponse
    >(functions, "registrarSucessoLogin");

    const result = await safeRequest(
      () =>
        callable({
          email: emailAlvo,
          origem: "login-cliente",
        }),
      {
        timeoutMs: 15000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `login-cliente:sucesso:${emailAlvo}`,
        priority: 8,
      }
    );

    return result.data;
  }

  function formatarBloqueio(desbloqueiaEm?: string | null) {
    if (!desbloqueiaEm) {
      return "Muitas tentativas de login. Tente novamente em alguns minutos.";
    }

    try {
      const data = new Date(desbloqueiaEm);
      return `Muitas tentativas de login. Tente novamente após ${data.toLocaleTimeString(
        "pt-BR",
        { hour: "2-digit", minute: "2-digit" }
      )}.`;
    } catch {
      return "Muitas tentativas de login. Tente novamente em alguns minutos.";
    }
  }

  async function finalizarCadastroSocialCliente(nome: string) {
    const callable = httpsCallable<
      { tipo: "cliente"; nome: string },
      FinalizarCadastroSocialResponse
    >(functions, "finalizarCadastroSocial");

    const result = await safeRequest(
      () =>
        callable({
          tipo: "cliente",
          nome: nome.trim() || "Cliente",
        }),
      {
        timeoutMs: 20000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `login-cliente:cadastro-social:${nome.trim() || "cliente"}`,
        priority: 9,
      }
    );

    return result.data;
  }

  async function validarContaCliente(uid: string): Promise<ResultadoValidacao> {
    const snapUser = await safeRequest(() => getDoc(doc(db, "users", uid)), {
      timeoutMs: 12000,
      tentativas: 2,
      exigirInternet: true,
      dedupeKey: `login-cliente:validar:${uid}`,
      priority: 10,
    });

    if (!snapUser.exists()) {
      await signOut(auth);
      return {
        ok: false,
        destino: "livre",
        mensagem: "Conta não encontrada.",
      };
    }

    const dados = snapUser.data();
    const tipo = String(dados.tipo || "").trim().toLowerCase();

    if (tipo === "profissional") {
      await signOut(auth);
      return {
        ok: false,
        destino: "profissional",
        mensagem: "Esta conta é profissional. Entre pela área do profissional.",
      };
    }

    if (tipo !== "cliente") {
      await signOut(auth);
      return {
        ok: false,
        destino: "livre",
        mensagem: "Tipo de conta inválido para esta área.",
      };
    }

    await auth.currentUser?.reload();
    const userAtualizado = auth.currentUser;

    if (!userAtualizado) {
      return {
        ok: false,
        destino: "livre",
        mensagem: "Não foi possível concluir o login.",
      };
    }

    if (!userAtualizado.emailVerified) {
      await signOut(auth);
      await tratarEmailNaoVerificado(userAtualizado);
      return { ok: false, destino: "livre" };
    }

    return { ok: true, destino: "cliente" };
  }

  async function garantirContaClienteSocial() {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return {
        ok: false,
        destino: "livre" as const,
        mensagem: "Não foi possível concluir o login social.",
      };
    }

    const nomeBase =
      currentUser.displayName?.trim() ||
      userData?.nome?.toString().trim() ||
      "Cliente";

    try {
      await finalizarCadastroSocialCliente(nomeBase);
      await recarregarUserData();

      await registrarPushNotificationsAsync();

      const validacao = await validarContaCliente(currentUser.uid);

      if (validacao.ok && currentUser.email) {
        try {
          await registrarSucesso(currentUser.email.toLowerCase());
        } catch (error) {
          logError(error, "LoginCliente.registrarSucesso.social");
          handleError(error, "LoginCliente.registrarSucesso.social");
        }
      }

      return validacao;
    } catch (error: any) {
      logError(error, "LoginCliente.finalizarCadastroSocial");
      handleError(error, "LoginCliente.finalizarCadastroSocial");
      await signOut(auth);

      return {
        ok: false,
        destino: "livre" as const,
        mensagem:
          error?.message ||
          "Não foi possível concluir o cadastro social agora.",
      };
    }
  }

  useEffect(() => {
    if (!isFocused || !authReady || loading) return;

    if (!user) {
      setStatusTela("livre");
      return;
    }

    const tipo = String(userData?.tipo || "")
      .trim()
      .toLowerCase();

    if (tipo === "cliente") {
      setStatusTela("cliente");
      
      return;
    }

    if (tipo === "profissional") {
      setStatusTela("livre");
      return;
    }

    setStatusTela("livre");
  }, [isFocused, authReady, loading, user, userData?.tipo]);

  useEffect(() => {
    const backAction = () => {
      router.replace("/entrada");
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    async function finalizarLoginGoogle() {
      if (!response) return;
      if (response.type === "dismiss" || response.type === "cancel") return;
      if (response.type !== "success") return;

      try {
        setEntrando(true);

        const online = await isOnline();
        if (!online) {
          Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
          return;
        }

        const idToken = response.authentication?.idToken;
        const accessToken = response.authentication?.accessToken;

        if (!idToken) {
          Alert.alert(
            "Erro",
            "O Google não retornou o token necessário para concluir o login."
          );
          return;
        }

        const credential = GoogleAuthProvider.credential(idToken, accessToken);

        await safeRequest(() => signInWithCredential(auth, credential), {
          timeoutMs: 20000,
          tentativas: 1,
          exigirInternet: true,
          dedupeKey: "login-cliente:google",
          priority: 10,
        });

        const validacao = await garantirContaClienteSocial();

        if (!validacao.ok) {
          if (validacao.mensagem) {
            Alert.alert("Erro no login", validacao.mensagem);
          }
          return;
        }

        logEvent("login_cliente_google_ok", undefined, "LoginCliente");
        setStatusTela("cliente");
        await registrarPushNotificationsAsync();
      } catch (error: any) {
        logError(error, "LoginCliente.loginGoogle.finalizar");
        handleError(error, "LoginCliente.loginGoogle.finalizar");
        Alert.alert(
          "Erro no login",
          error?.message || "Não foi possível entrar com Google."
        );
      } finally {
        setEntrando(false);
      }
    }

    void finalizarLoginGoogle();
  }, [response]);

  async function entrarComEmail() {
    if (entrando) return;

    if (!emailNormalizado || !senha.trim()) {
      Alert.alert("Erro", "Preencha email e senha.");
      return;
    }

    try {
      setEntrando(true);

      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      const rateLimit = await verificarRateLimit(emailNormalizado);
      if (rateLimit?.bloqueado) {
        Alert.alert(
          "Login temporariamente bloqueado",
          formatarBloqueio(rateLimit.desbloqueiaEm)
        );
        return;
      }

      const credencial = await loginComEmail(emailNormalizado, senha);
      const validacao = await validarContaCliente(credencial.user.uid);

      if (!validacao.ok) {
        if (validacao.mensagem) {
          Alert.alert("Erro no login", validacao.mensagem);
        }
        return;
      }

      try {
        await registrarSucesso(emailNormalizado);
      } catch (error) {
        logError(error, "LoginCliente.registrarSucesso.email");
        handleError(error, "LoginCliente.registrarSucesso.email");
      }

      logEvent("login_cliente_email_ok", { email: emailNormalizado }, "LoginCliente");
      setStatusTela("cliente");
      await registrarPushNotificationsAsync();
    } catch (error: any) {
      try {
        const falha = await registrarFalha(
          emailNormalizado,
          error?.code || "falha_login_email"
        );

        if (falha?.bloqueado) {
          Alert.alert(
            "Login temporariamente bloqueado",
            formatarBloqueio(falha.desbloqueiaEm)
          );
          return;
        }
      } catch (falhaError) {
        logError(falhaError, "LoginCliente.registrarFalha.email");
        handleError(falhaError, "LoginCliente.registrarFalha.email");
      }

      logError(error, "LoginCliente.entrarComEmail");
      handleError(error, "LoginCliente.entrarComEmail");
      Alert.alert(
        "Erro no login",
        error?.message || "Não foi possível entrar."
      );
    } finally {
      setEntrando(false);
    }
  }

  async function loginApple() {
    if (entrando) return;

    try {
      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      const disponivel = await AppleAuthentication.isAvailableAsync();
      if (!disponivel) {
        Alert.alert(
          "Aviso",
          "Login com Apple não disponível neste dispositivo."
        );
        return;
      }

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!appleCredential.identityToken) {
        Alert.alert("Erro", "Apple não retornou identityToken.");
        return;
      }

      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({
        idToken: appleCredential.identityToken,
      });

      setEntrando(true);

      await safeRequest(() => signInWithCredential(auth, credential), {
        timeoutMs: 20000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: "login-cliente:apple",
        priority: 10,
      });

      const validacao = await garantirContaClienteSocial();

      if (!validacao.ok) {
        if (validacao.mensagem) {
          Alert.alert("Erro no login", validacao.mensagem);
        }
        return;
      }

      logEvent("login_cliente_apple_ok", undefined, "LoginCliente");
      setStatusTela("cliente");
      await registrarPushNotificationsAsync();
    } catch (error: any) {
      if (error?.code === "ERR_REQUEST_CANCELED") return;

      logError(error, "LoginCliente.loginApple");
      handleError(error, "LoginCliente.loginApple");
      Alert.alert(
        "Erro",
        error?.message ||
          "Login Apple ainda precisa estar configurado corretamente no projeto."
      );
    } finally {
      setEntrando(false);
    }
  }

  async function loginGoogle() {
    if (entrando) return;

    try {
      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      if (!googleConfigOk) {
        Alert.alert(
          "Google indisponível",
          "As credenciais do Google não foram carregadas corretamente do arquivo .env."
        );
        return;
      }

      if (!request) {
        Alert.alert(
          "Google indisponível",
          "A configuração do login Google ainda não foi carregada."
        );
        return;
      }

      await promptAsync();
    } catch (error: any) {
      logError(error, "LoginCliente.loginGoogle");
      handleError(error, "LoginCliente.loginGoogle");
      Alert.alert(
        "Erro no login",
        error?.message || "Não foi possível iniciar o login com Google."
      );
    }
  }

  async function esqueceuSenha() {
    if (!emailNormalizado) {
      Alert.alert(
        "Digite seu email",
        "Preencha o campo de email para receber o link de redefinição."
      );
      return;
    }

    try {
      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      auth.languageCode = "pt-BR";

      await safeRequest(() => sendPasswordResetEmail(auth, emailNormalizado), {
        timeoutMs: 15000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `login-cliente:reset:${emailNormalizado}`,
        priority: 8,
      });

      Alert.alert(
        "Email enviado",
        "Enviamos um link para redefinir sua senha no seu email."
      );
    } catch (error: any) {
      logError(error, "LoginCliente.esqueceuSenha");
      handleError(error, "LoginCliente.esqueceuSenha");
      Alert.alert(
        "Erro",
        error?.message || "Não foi possível enviar o email de redefinição."
      );
    }
  }

  function semAcessoAoEmail() {
    Alert.alert(
      "Recuperação da conta",
      "Se você não tem mais acesso ao email cadastrado, fale com o suporte para validar sua identidade e recuperar a conta.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Ir para ajuda",
          onPress: () => router.push("/chat-suporte?origem=recuperacao"),
        },
      ]
    );
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  if (statusTela === "cliente") {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.wrapper}>
      <OfflineBanner />

      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AppHeader
          title="Login do cliente"
          showBackButton
          compact
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.inner}>
            <View style={styles.card}>
              <Text style={styles.legenda}>
                Entre com sua conta para solicitar serviços e acompanhar pedidos.
              </Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Digite seu email"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!entrando}
                style={styles.input}
              />

              <Text style={styles.label}>Senha</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  value={senha}
                  onChangeText={setSenha}
                  placeholder="Digite sua senha"
                  placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry={!mostrarSenha}
                  editable={!entrando}
                  style={styles.inputComIcone}
                />
                <Pressable
                  onPress={() => setMostrarSenha(!mostrarSenha)}
                  disabled={entrando}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={mostrarSenha ? "eye-off" : "eye"}
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>

              <ActionButton
                title={entrando ? "Entrando..." : "Entrar"}
                onPress={entrarComEmail}
                disabled={entrando}
              />

              <View style={styles.linkWrap}>
                <Pressable onPress={esqueceuSenha} disabled={entrando}>
                  <Text style={styles.linkText}>Esqueci minha senha</Text>
                </Pressable>
              </View>

              <View style={styles.linkWrap}>
                <Pressable onPress={semAcessoAoEmail} disabled={entrando}>
                  <Text style={styles.linkText}>
                    Não tenho mais acesso ao meu email
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <ActionButton
                title="Entrar com Google"
                onPress={loginGoogle}
                disabled={entrando}
                variant="neutral"
              />

              {Platform.OS === "ios" && (
                <View style={styles.buttonGap}>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={
                      AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                    }
                    buttonStyle={
                      themeMode === "dark"
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    cornerRadius={14}
                    style={styles.appleButton}
                    onPress={loginApple}
                  />
                </View>
              )}
            </View>

            <ActionButton
              title="Não tem conta? Cadastre-se"
              onPress={() => router.push("/cadastro?tipo=cliente")}
              variant="neutral"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    buttonGap: {
      marginTop: 10,
    },
    wrapper: {
      flex: 1,
      backgroundColor: theme.colors.background,
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
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 14,
      paddingTop: Platform.OS === "android" ? 8 : 18,
      paddingBottom: 16,
    },
    inner: {
      flex: 1,
      justifyContent: "center",
    },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: Platform.OS === "android" ? 14 : 16,
      marginBottom: 12,
    },
    label: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "bold",
      marginBottom: 6,
      marginTop: 2,
    },
    input: {
      backgroundColor: theme.colors.cardSoft,
      color: theme.colors.text,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "android" ? 12 : 14,
      marginBottom: 12,
      fontSize: 15,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingLeft: 14,
      paddingRight: 10,
      marginBottom: 12,
    },
    inputComIcone: {
      flex: 1,
      color: theme.colors.text,
      paddingVertical: Platform.OS === "android" ? 12 : 14,
      fontSize: 15,
    },
    eyeButton: {
      paddingLeft: 8,
      paddingVertical: 4,
    },
    legenda: {
      color: theme.colors.textMuted,
      textAlign: "center",
      marginBottom: 10,
      fontSize: 14,
    },
    appleButton: {
      width: "100%",
      height: 52,
    },
    linkWrap: {
      marginTop: 12,
      alignItems: "center",
    },
    linkText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}