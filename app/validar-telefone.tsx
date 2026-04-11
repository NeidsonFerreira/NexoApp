import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { ActionButton } from "../components/ActionButton";
import { AppHeader } from "../components/AppHeader";
import { useAppTheme } from "../contexts/ThemeContext";
import { auth, db } from "../lib/firebase";

const CODIGO_TESTE = "123456";
const TEMPO_REENVIO = 30;

type Origem = "cliente" | "profissional";

export default function ValidarTelefone() {
  const { theme } = useAppTheme ();
  const styles = createStyles (theme);
  const params = useLocalSearchParams<{ tipo?: string; origem?: string }>();

  const origem: Origem =
    params.tipo === "profissional" || params.origem === "profissional"
      ? "profissional"
      : "cliente";

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [ultimoTelefoneEnviado, setUltimoTelefoneEnviado] = useState("");
  const [tempoRestante, setTempoRestante] = useState(0);
  const [codigoDigits, setCodigoDigits] = useState(["", "", "", "", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const inputRefs = useRef<Array<TextInput | null>>([]);
  const confirmandoAutomaticoRef = useRef(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const user = auth.currentUser;

  useEffect(() => {
    const backAction = () => {
      voltar();
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [origem]);

  useEffect(() => {
    async function carregarTelefone() {
      try {
        if (!user) {
          setCarregando(false);
          return;
        }

        const snap = await getDoc(doc(db, "users", user.uid));

        if (snap.exists()) {
          const dados = snap.data() as any;
          const telefoneSalvo = dados.telefone || "";
          setTelefone(formatarCelular(telefoneSalvo));
        }
      } catch (error) {
        console.log("Erro ao carregar telefone:", error);
      } finally {
        setCarregando(false);
      }
    }

    carregarTelefone();
  }, [user]);

  useEffect(() => {
    if (tempoRestante <= 0) return;

    const timer = setInterval(() => {
      setTempoRestante((valorAtual) => {
        if (valorAtual <= 1) {
          clearInterval(timer);
          return 0;
        }
        return valorAtual - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [tempoRestante]);

  function voltar() {
    if (origem === "profissional") {
      router.replace("/painel-profissional");
      return;
    }

    router.replace("/cliente-home");
  }

  function formatarCelular(valor: string) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }

    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(
      7
    )}`;
  }

  function telefoneValido(valor: string) {
    const numeros = valor.replace(/\D/g, "");
    return numeros.length >= 10 && numeros.length <= 11;
  }

  function animarErroCodigo() {
    shakeAnim.setValue(0);

    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }

  const telefoneLimpo = useMemo(() => telefone.replace(/\D/g, ""), [telefone]);
  const codigo = codigoDigits.join("");
  const codigoValido = codigo.length === 6;
  const podeReenviar = tempoRestante === 0;

  function atualizarDigito(valor: string, index: number) {
    const numero = valor.replace(/\D/g, "");

    if (!numero) {
      const novoCodigo = [...codigoDigits];
      novoCodigo[index] = "";
      setCodigoDigits(novoCodigo);
      return;
    }

    const novoCodigo = [...codigoDigits];
    novoCodigo[index] = numero[0];
    setCodigoDigits(novoCodigo);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else {
      inputRefs.current[index]?.blur();
    }
  }

  function onKeyPressDigito(key: string, index: number) {
    if (key === "Backspace" && !codigoDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function colarCodigo(texto: string) {
    const numeros = texto.replace(/\D/g, "").slice(0, 6);
    if (!numeros) return;

    const preenchido = ["", "", "", "", "", ""];

    for (let i = 0; i < numeros.length; i++) {
      preenchido[i] = numeros[i];
    }

    setCodigoDigits(preenchido);

    if (numeros.length < 6) {
      inputRefs.current[Math.min(numeros.length, 5)]?.focus();
    } else {
      inputRefs.current[5]?.blur();
    }
  }

  async function enviarCodigo() {
    if (!telefoneValido(telefone)) {
      Alert.alert("Telefone inválido", "Digite um número de celular válido.");
      return;
    }

    try {
      setSalvando(true);

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        return;
      }

      await updateDoc(doc(db, "users", user.uid), {
        telefone: telefoneLimpo,
        telefoneVerificado: false,
      });

      setCodigoDigits(["", "", "", "", "", ""]);
      setCodigoEnviado(true);
      setUltimoTelefoneEnviado(telefone);
      setTempoRestante(TEMPO_REENVIO);

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);

      Alert.alert("Código enviado", "Código de teste: 123456");
    } catch (error) {
      console.log("Erro ao enviar código:", error);
      Alert.alert("Erro", "Não foi possível enviar o código agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function reenviarCodigo() {
    if (!podeReenviar) return;
    await enviarCodigo();
  }

  async function confirmarCodigo() {
    if (confirmandoAutomaticoRef.current || salvando) return;

    if (!codigoEnviado) {
      Alert.alert("Atenção", "Envie o código primeiro.");
      return;
    }

    if (!codigo.trim()) {
      Alert.alert("Atenção", "Digite o código recebido.");
      return;
    }

    if (!codigoValido) {
      Alert.alert("Código incompleto", "Digite os 6 números do código.");
      return;
    }

    if (codigo.trim() !== CODIGO_TESTE) {
      Vibration.vibrate(180);
      animarErroCodigo();

      setTimeout(() => {
        setCodigoDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }, 180);

      Alert.alert("Código inválido", "O código informado está incorreto.");
      return;
    }

    try {
      confirmandoAutomaticoRef.current = true;
      setSalvando(true);

      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        return;
      }

      await updateDoc(doc(db, "users", user.uid), {
        telefone: telefoneLimpo,
        telefoneVerificado: true,
      });

      setCodigoEnviado(false);

      Alert.alert("Sucesso", "Telefone verificado com sucesso.", [
        {
          text: "OK",
          onPress: () => voltar(),
        },
      ]);
    } catch (error) {
      console.log("Erro ao confirmar código:", error);
      Alert.alert("Erro", "Não foi possível confirmar o código.");
    } finally {
      setSalvando(false);
      confirmandoAutomaticoRef.current = false;
    }
  }

  if (!user && !carregando) {
    return <Redirect href="/" />;
  }

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando validação...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          <AppHeader
            title="Validar Telefone"
            subtitle={
              origem === "profissional"
                ? "Confirme seu celular para liberar visibilidade e pedidos"
                : "Confirme seu celular para liberar os recursos do app"
            }
            onBack={voltar}
            compact
          />

          <View style={styles.cardAviso}>
            <View style={styles.cardAvisoTopo}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color="#fbbf24"
              />
              <Text style={styles.cardAvisoTitulo}>Segurança da conta</Text>
            </View>

            <Text style={styles.cardAvisoTexto}>
              Seu telefone validado ajuda a proteger clientes e profissionais no
              atendimento.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Celular</Text>
            <TextInput
              style={styles.input}
              placeholder="(32) 99999-9999"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              value={telefone}
              onChangeText={(texto) => setTelefone(formatarCelular(texto))}
              editable={!salvando}
            />

            <View style={styles.buttonWrap}>
              <ActionButton
                title={salvando ? "ENVIANDO..." : "ENVIAR CÓDIGO"}
                onPress={enviarCodigo}
                variant="primary"
                disabled={salvando}
              />
            </View>

            {codigoEnviado && (
              <View style={styles.statusBox}>
                <Ionicons
                  name="mail-open-outline"
                  size={18}
                  color="#22c55e"
                />
                <Text style={styles.statusText}>
                  Código enviado para {ultimoTelefoneEnviado || telefone}
                </Text>
              </View>
            )}

            {codigoEnviado && (
              <>
                <Text style={styles.label}>Código</Text>

                <Animated.View
                  style={[
                    styles.otpRow,
                    {
                      transform: [
                        {
                          translateX: shakeAnim.interpolate({
                            inputRange: [-1, 1],
                            outputRange: [-10, 10],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {codigoDigits.map((digit, index) => {
                    const focado = focusedIndex === index;

                    return (
                      <TextInput
                        key={index}
                        ref={(ref) => {
                          inputRefs.current[index] = ref;
                        }}
                        style={[
                          styles.otpInput,
                          digit ? styles.otpInputFilled : undefined,
                          focado ? styles.otpInputFocused : undefined,
                        ]}
                        value={digit}
                        onFocus={() => setFocusedIndex(index)}
                        onBlur={() =>
                          setFocusedIndex((atual) =>
                            atual === index ? null : atual
                          )
                        }
                        onChangeText={(text) => {
                          if (text.length > 1) {
                            colarCodigo(text);
                            return;
                          }
                          atualizarDigito(text, index);
                        }}
                        onKeyPress={({ nativeEvent }) =>
                          onKeyPressDigito(nativeEvent.key, index)
                        }
                        keyboardType="number-pad"
                        maxLength={1}
                        editable={!salvando}
                        textAlign="center"
                        selectTextOnFocus
                      />
                    );
                  })}
                </Animated.View>

                <View style={styles.codigoInfo}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={theme.colors.textMuted}
                  />
                  <Text style={styles.codigoInfoTexto}>
                    Código de teste: 123456
                  </Text>
                </View>

                <View style={styles.buttonWrap}>
                  <ActionButton
                    title={salvando ? "CONFIRMANDO..." : "CONFIRMAR CÓDIGO"}
                    onPress={confirmarCodigo}
                    variant="warning"
                    disabled={salvando || !codigoValido}
                  />
                </View>

                {!podeReenviar ? (
                  <View style={styles.contadorWrap}>
                    <Text style={styles.contadorTexto}>
                      Reenviar código em {tempoRestante}s
                    </Text>
                  </View>
                ) : (
                  <Pressable onPress={reenviarCodigo} style={styles.linkWrap}>
                    <Text style={styles.linkTexto}>Reenviar código</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          <Pressable onPress={voltar} style={styles.linkWrap}>
            <Text style={styles.linkTextoSecundario}>Voltar por agora</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any){
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
    paddingBottom: Platform.OS === "android" ? 120 : 24,
  },

  inner: {
    flex: 1,
    justifyContent: "flex-start",
  },

  cardAviso: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: "#fbbf24",
    padding: 16,
    marginBottom: 14,
  },

  cardAvisoTopo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  cardAvisoTitulo: {
    color: "#fbbf24",
    fontSize: 18,
    fontWeight: "bold",
  },

  cardAvisoTexto: {
    color: "#e5e7eb",
    fontSize: 14,
    lineHeight: 21,
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

  buttonWrap: {
    marginTop: 4,
    marginBottom: 8,
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },

  statusText: {
    color: "#86efac",
    fontSize: 13,
    flex: 1,
  },

  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },

  otpInput: {
    flex: 1,
    height: 58,
    backgroundColor: theme.colors.cardSoft,
    color: theme.colors.text,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 22,
    fontWeight: "bold",
  },

  otpInputFilled: {
    borderColor: theme.colors.primary,
  },

  otpInputFocused: {
    borderColor: "#fbbf24",
    borderWidth: 2,
  },

  codigoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -2,
    marginBottom: 10,
  },

  codigoInfoTexto: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },

  contadorWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },

  contadorTexto: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },

  linkWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },

  linkTexto: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },

  linkTextoSecundario: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
}