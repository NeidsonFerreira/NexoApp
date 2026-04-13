import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { Redirect, router } from "expo-router";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
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
import { isOnline } from "../lib/network";

type StatusTela = "carregando" | "livre" | "admin" | "sem-acesso";

type ConfigApp = {
  appEmManutencao?: boolean;
  avisoGlobal?: string;
};

type ResultadoValidacao =
  | { ok: true; destino: "admin" }
  | { ok: false; destino: "livre" | "sem-acesso"; mensagem?: string };

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

export default function LoginAdmin() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const isFocused = useIsFocused();
  const { authReady, user, userData, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [avisoGlobal, setAvisoGlobal] = useState("");

  const emailNormalizado = useMemo(() => email.trim().toLowerCase(), [email]);

  async function verificarRateLimit(emailAlvo: string) {
    const verificarRateLimitLogin = httpsCallable<
      { email: string },
      VerificarRateLimitLoginResponse
    >(functions, "verificarRateLimitLogin");

    const response = await verificarRateLimitLogin({ email: emailAlvo });
    return response.data;
  }

  async function registrarFalha(emailAlvo: string, motivo: string) {
    const registrarFalhaLogin = httpsCallable<
      { email: string; motivo: string; origem: string },
      RegistrarFalhaLoginResponse
    >(functions, "registrarFalhaLogin");

    const response = await registrarFalhaLogin({
      email: emailAlvo,
      motivo,
      origem: "login-admin",
    });

    return response.data;
  }

  async function registrarSucesso(emailAlvo: string) {
    const registrarSucessoLogin = httpsCallable<
      { email: string; origem: string },
      RegistrarSucessoLoginResponse
    >(functions, "registrarSucessoLogin");

    const response = await registrarSucessoLogin({
      email: emailAlvo,
      origem: "login-admin",
    });

    return response.data;
  }

  function formatarBloqueio(desbloqueiaEm?: string | null) {
    if (!desbloqueiaEm) {
      return "Muitas tentativas de login. Tente novamente em alguns minutos.";
    }

    try {
      const data = new Date(desbloqueiaEm);
      return `Muitas tentativas de login. Tente novamente após ${data.toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      )}.`;
    } catch {
      return "Muitas tentativas de login. Tente novamente em alguns minutos.";
    }
  }

  async function validarContaAdmin(uid: string): Promise<ResultadoValidacao> {
    const snapUser = await getDoc(doc(db, "users", uid));

    if (!snapUser.exists()) {
      await signOut(auth);
      return {
        ok: false,
        destino: "livre",
        mensagem: "Conta admin não encontrada.",
      };
    }

    const dados = snapUser.data() as any;
    const tipo = String(dados.tipo || "").trim().toLowerCase();
    const bloqueado = dados.bloqueado === true;

    if (tipo !== "admin") {
      await signOut(auth);
      return {
        ok: false,
        destino: "sem-acesso",
        mensagem: "Acesso permitido apenas para administradores.",
      };
    }

    if (bloqueado) {
      await signOut(auth);
      return {
        ok: false,
        destino: "livre",
        mensagem: "Conta admin bloqueada. Verifique o acesso.",
      };
    }

    return { ok: true, destino: "admin" };
  }

  useEffect(() => {
    const unsubscribeConfig = onSnapshot(
      doc(db, "configuracoes", "app"),
      (snapConfig) => {
        if (!snapConfig.exists()) {
          setAvisoGlobal("");
          return;
        }

        const dadosConfig = snapConfig.data() as ConfigApp;
        setAvisoGlobal(dadosConfig.avisoGlobal || "");
      },
      (error) => {
        handleError(error, "LoginAdmin.config");
      }
    );

    return () => unsubscribeConfig();
  }, []);

  useEffect(() => {
    if (!isFocused || !authReady || loading) return;

    if (!user) {
      setStatusTela("livre");
      return;
    }

    const tipo = String(userData?.tipo || "").trim().toLowerCase();

    if (tipo === "admin") {
      setStatusTela("admin");
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

  async function entrarAdmin() {
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
      const validacao = await validarContaAdmin(credencial.user.uid);

      if (!validacao.ok) {
        if (validacao.mensagem) {
          Alert.alert("Erro no login", validacao.mensagem);
        }
        return;
      }

      try {
        await registrarSucesso(emailNormalizado);
      } catch (error) {
        handleError(error, "LoginAdmin.registrarSucesso");
      }

      setStatusTela("admin");
    } catch (error: any) {
      try {
        const falha = await registrarFalha(
          emailNormalizado,
          error?.code || "falha_login_admin"
        );

        if (falha?.bloqueado) {
          Alert.alert(
            "Login temporariamente bloqueado",
            formatarBloqueio(falha.desbloqueiaEm)
          );
          return;
        }
      } catch (falhaError) {
        handleError(falhaError, "LoginAdmin.registrarFalha");
      }

      handleError(error, "LoginAdmin.entrarAdmin");
      Alert.alert(
        "Erro no login",
        error?.message || "Não foi possível entrar."
      );
    } finally {
      setEntrando(false);
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
      await sendPasswordResetEmail(auth, emailNormalizado);

      Alert.alert(
        "Email enviado",
        "Enviamos um link para redefinir sua senha no seu email."
      );
    } catch (error: any) {
      handleError(error, "LoginAdmin.esqueceuSenha");
      Alert.alert(
        "Erro",
        error?.message || "Não foi possível enviar o email de redefinição."
      );
    }
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  if (statusTela === "admin") {
    return <Redirect href="app/admin/dashboard" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          <OfflineBanner />

          <AppHeader
            title="Login Admin"
            subtitle="Acesso restrito ao painel administrativo"
            onBack={() => router.replace("/entrada")}
            compact
          />

          {!!avisoGlobal.trim() && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Aviso global</Text>
              <Text style={styles.noticeText}>{avisoGlobal.trim()}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite seu email"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!entrando}
            />

            <Text style={styles.label}>Senha</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputComIcone}
                placeholder="Digite sua senha"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry={!mostrarSenha}
                value={senha}
                onChangeText={setSenha}
                editable={!entrando}
              />
              <Pressable
                onPress={() => setMostrarSenha(!mostrarSenha)}
                disabled={entrando}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={mostrarSenha ? "eye-off" : "eye"}
                  size={22}
                  color={theme.colors.textMuted}
                />
              </Pressable>
            </View>

            <ActionButton
              title={entrando ? "ENTRANDO..." : "ENTRAR COMO ADMIN"}
              onPress={entrarAdmin}
              variant="danger"
              disabled={entrando}
            />

            <Pressable onPress={esqueceuSenha} style={styles.linkWrap}>
              <Text style={styles.linkText}>Esqueci minha senha</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
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

    noticeCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 12,
    },

    noticeTitle: {
      color: theme.colors.text,
      fontWeight: "800",
      marginBottom: 6,
    },

    noticeText: {
      color: theme.colors.textMuted,
      lineHeight: 20,
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
