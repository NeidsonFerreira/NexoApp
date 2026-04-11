import { Ionicons } from "@expo/vector-icons";
import Checkbox from "expo-checkbox";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { sendEmailVerification, signOut } from "firebase/auth";
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
import { useAppTheme } from "../contexts/ThemeContext";
import { cadastrarComEmail } from "../lib/auth";
import { handleError } from "../lib/errorHandler";
import { auth, functions } from "../lib/firebase";
import { safeRequest } from "../lib/firebaseService";
import { logError, logEvent } from "../lib/logger";
import { isOnline } from "../lib/network";

type FinalizarCadastroInicialResponse = {
  ok?: boolean;
  criado?: boolean;
  tipo?: string;
};

type VerificarDisponibilidadeCadastroResponse = {
  ok?: boolean;
  emailDisponivel?: boolean;
  telefoneDisponivel?: boolean;
};

export default function Cadastro() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const tipoSeguro: "cliente" | "profissional" | null =
    tipo === "cliente" || tipo === "profissional" ? tipo : null;

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [senha, setSenha] = useState("");
  const [repetirSenha, setRepetirSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarRepetirSenha, setMostrarRepetirSenha] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const emailNormalizado = useMemo(() => email.trim().toLowerCase(), [email]);

  const senhaChecks = useMemo(
    () => ({
      tamanho: senha.length >= 8,
      maiuscula: /[A-Z]/.test(senha),
      minuscula: /[a-z]/.test(senha),
      numero: /\d/.test(senha),
    }),
    [senha]
  );

  const senhaConfirmada = useMemo(() => {
    if (!repetirSenha) return false;
    return senha === repetirSenha;
  }, [senha, repetirSenha]);

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

  if (!tipoSeguro) {
    return <Redirect href="/entrada" />;
  }

  function formatarCelular(valor: string) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length <= 2) return numeros;

    if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }

    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  function normalizarTelefone(valor: string) {
    return valor.replace(/\D/g, "");
  }

  function telefoneValido(valor: string) {
    const numeros = normalizarTelefone(valor);
    return numeros.length >= 10 && numeros.length <= 11;
  }

  function senhaForte(valor: string) {
    return (
      valor.length >= 8 &&
      /[A-Z]/.test(valor) &&
      /[a-z]/.test(valor) &&
      /\d/.test(valor)
    );
  }

  function renderPasswordRequirement(label: string, ok: boolean) {
    return (
      <View style={styles.passwordRuleRow}>
        <Ionicons
          name={ok ? "checkmark-circle" : "ellipse-outline"}
          size={16}
          color={ok ? theme.colors.primary : theme.colors.textMuted}
        />
        <Text
          style={[styles.passwordRuleText, ok && styles.passwordRuleTextOk]}
        >
          {label}
        </Text>
      </View>
    );
  }

  async function verificarDisponibilidadeCadastro() {
    const callable = httpsCallable<
      { email: string; telefone: string },
      VerificarDisponibilidadeCadastroResponse
    >(functions, "verificarDisponibilidadeCadastro");

    const response = await safeRequest(
      () =>
        callable({
          email: emailNormalizado,
          telefone: normalizarTelefone(celular),
        }),
      {
        timeoutMs: 15000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `cadastro:disponibilidade:${emailNormalizado}:${normalizarTelefone(
          celular
        )}`,
        priority: 9,
      }
    );

    return response.data;
  }

  async function finalizarCadastroInicial() {
    if (!tipoSeguro) {
      throw new Error("Tipo de cadastro inválido.");
    }

    const tipoCadastro: "cliente" | "profissional" = tipoSeguro;

    const callable = httpsCallable<
      {
        tipo: "cliente" | "profissional";
        nome: string;
        telefone: string;
        email: string;
      },
      FinalizarCadastroInicialResponse
    >(functions, "finalizarCadastroInicial");

    const response = await safeRequest(
      () =>
        callable({
          tipo: tipoCadastro,
          nome: nome.trim(),
          telefone: celular.trim(),
          email: emailNormalizado,
        }),
      {
        timeoutMs: 20000,
        tentativas: 1,
        exigirInternet: true,
        dedupeKey: `cadastro:finalizar:${tipoCadastro}:${emailNormalizado}`,
        priority: 10,
      }
    );

    return response.data;
  }

  async function cadastrar() {
    if (carregando) return;

    try {
      if (!nome.trim() || !emailNormalizado || !celular.trim() || !senha.trim()) {
        Alert.alert("Atenção", "Preencha todos os campos.");
        return;
      }

      if (!telefoneValido(celular)) {
        Alert.alert("Telefone inválido", "Digite um número de celular válido.");
        return;
      }

      if (!senhaForte(senha)) {
        Alert.alert(
          "Senha fraca",
          "Sua senha deve ter pelo menos 8 caracteres, incluindo letra maiúscula, minúscula e número."
        );
        return;
      }

      if (senha !== repetirSenha) {
        Alert.alert("Senhas diferentes", "As senhas não coincidem.");
        return;
      }

      if (!aceitouTermos) {
        Alert.alert("Termos obrigatórios", "Você precisa aceitar os termos.");
        return;
      }

      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      setCarregando(true);

      const disponibilidade = await verificarDisponibilidadeCadastro();

      if (disponibilidade?.emailDisponivel === false) {
        Alert.alert("Email já cadastrado", "Esse email já está em uso.");
        return;
      }

      if (disponibilidade?.telefoneDisponivel === false) {
        Alert.alert("Telefone já cadastrado", "Esse telefone já está em uso.");
        return;
      }

      await cadastrarComEmail(emailNormalizado, senha);
      await finalizarCadastroInicial();

      if (auth.currentUser) {
        await safeRequest(() => sendEmailVerification(auth.currentUser!), {
          timeoutMs: 12000,
          tentativas: 1,
          exigirInternet: true,
          dedupeKey: `cadastro:verificacao:${auth.currentUser.uid}`,
          priority: 8,
        });
      }

      await signOut(auth);

      logEvent(
        "cadastro_concluido",
        {
          tipo: tipoSeguro,
          email: emailNormalizado,
        },
        "Cadastro"
      );

      Alert.alert(
        "Cadastro concluído",
        tipoSeguro === "cliente"
          ? "Sua conta de cliente foi criada com sucesso.\nVerifique seu email antes de entrar."
          : "Sua conta profissional foi criada com sucesso.\nVerifique seu email antes de entrar."
      );

      router.replace(
        tipoSeguro === "cliente" ? "/login-cliente" : "/login-profissional"
      );
    } catch (error: any) {
      logError(error, "Cadastro.cadastrar");
      handleError(error, "Cadastro.cadastrar");

      const code = String(error?.code || "");

      if (code === "auth/email-already-in-use") {
        Alert.alert("Email já usado", "Esse email já está cadastrado.");
      } else if (code === "auth/invalid-email") {
        Alert.alert("Email inválido", "Digite um email válido.");
      } else if (code === "auth/weak-password") {
        Alert.alert("Senha fraca", "Escolha uma senha mais forte.");
      } else if (code === "auth/too-many-requests") {
        Alert.alert(
          "Muitas tentativas",
          "Houve muitas tentativas de cadastro em pouco tempo. Aguarde alguns minutos e tente novamente."
        );
      } else {
        Alert.alert(
          "Erro no cadastro",
          error?.message || "Não foi possível concluir seu cadastro."
        );
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <OfflineBanner />

      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AppHeader
          title={tipoSeguro === "cliente" ? "Cadastro do cliente" : "Cadastro profissional"}
          showBackButton
          compact
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.inner}>
            <View style={styles.card}>
              <Text style={styles.label}>Nome</Text>
              <TextInput
                value={nome}
                onChangeText={setNome}
                placeholder="Digite seu nome"
                placeholderTextColor={theme.colors.textMuted}
                editable={!carregando}
                style={styles.input}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Digite seu email"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!carregando}
                style={styles.input}
              />

              <Text style={styles.label}>Celular</Text>
              <TextInput
                value={celular}
                onChangeText={(v) => setCelular(formatarCelular(v))}
                placeholder="(00) 00000-0000"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                editable={!carregando}
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
                  editable={!carregando}
                  style={styles.inputComIcone}
                />
                <Pressable
                  onPress={() => setMostrarSenha(!mostrarSenha)}
                  disabled={carregando}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={mostrarSenha ? "eye-off" : "eye"}
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>

              <View style={styles.passwordChecklist}>
                {renderPasswordRequirement(
                  "Pelo menos 8 caracteres",
                  senhaChecks.tamanho
                )}
                {renderPasswordRequirement(
                  "Uma letra maiúscula",
                  senhaChecks.maiuscula
                )}
                {renderPasswordRequirement(
                  "Uma letra minúscula",
                  senhaChecks.minuscula
                )}
                {renderPasswordRequirement("Um número", senhaChecks.numero)}
              </View>

              <Text style={styles.label}>Repetir senha</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  value={repetirSenha}
                  onChangeText={setRepetirSenha}
                  placeholder="Repita sua senha"
                  placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry={!mostrarRepetirSenha}
                  editable={!carregando}
                  style={styles.inputComIcone}
                />
                <Pressable
                  onPress={() => setMostrarRepetirSenha(!mostrarRepetirSenha)}
                  disabled={carregando}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={mostrarRepetirSenha ? "eye-off" : "eye"}
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>

              {repetirSenha.length > 0 && (
                <View style={styles.passwordChecklist}>
                  {renderPasswordRequirement(
                    "As senhas coincidem",
                    senhaConfirmada
                  )}
                </View>
              )}

              <Pressable
                style={styles.termsRow}
                onPress={() => !carregando && setAceitouTermos(!aceitouTermos)}
                disabled={carregando}
              >
                <Checkbox
                  value={aceitouTermos}
                  onValueChange={setAceitouTermos}
                  disabled={carregando}
                  color={aceitouTermos ? theme.colors.primary : undefined}
                />
                <Text style={styles.termsText}>
                  Li e aceito os termos de uso e política de privacidade.
                </Text>
              </Pressable>

              <ActionButton
                title={
                  carregando
                    ? "Finalizando cadastro..."
                    : tipoSeguro === "cliente"
                    ? "Criar conta de cliente"
                    : "Criar conta profissional"
                }
                onPress={cadastrar}
                disabled={carregando}
              />

              {carregando && (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>
                    Finalizando seu cadastro...
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: theme.colors.background,
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
      marginBottom: 8,
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
    passwordChecklist: {
      marginBottom: 12,
      gap: 6,
    },
    passwordRuleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    passwordRuleText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    passwordRuleTextOk: {
      color: theme.colors.primary,
      fontWeight: "600",
    },
    termsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
      marginTop: 4,
    },
    termsText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 12,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
  });
}
