import { Redirect } from "expo-router";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";

type ConfigAdmin = {
  precoPlanoMensal?: number;
  precoPlanoTurbo?: number;
  appEmManutencao?: boolean;
  avisoGlobal?: string;
};

export default function AdminConfiguracoes() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [precoPlanoMensal, setPrecoPlanoMensal] = useState("19,90");
  const [precoPlanoTurbo, setPrecoPlanoTurbo] = useState("49,90");
  const [appEmManutencao, setAppEmManutencao] = useState(false);
  const [avisoGlobal, setAvisoGlobal] = useState("");

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) {
            setStatusTela("sem-user");
            setCarregandoDados(false);
          }
          return;
        }

        const snapAdmin = await getDoc(doc(db, "users", user.uid));

        if (!snapAdmin.exists()) {
          if (ativo) {
            setStatusTela("sem-acesso");
            setCarregandoDados(false);
          }
          return;
        }

        const dadosAdmin = snapAdmin.data() as any;

        if (dadosAdmin.tipo !== "admin") {
          if (ativo) {
            setStatusTela("sem-acesso");
            setCarregandoDados(false);
          }
          return;
        }

        if (ativo) {
          setStatusTela("admin");
        }

        const snapConfig = await getDoc(doc(db, "configuracoes", "app"));

        if (snapConfig.exists()) {
          const dados = snapConfig.data() as ConfigAdmin;

          if (ativo) {
            setPrecoPlanoMensal(
              formatarValorInput(dados.precoPlanoMensal ?? 19.9)
            );
            setPrecoPlanoTurbo(
              formatarValorInput(dados.precoPlanoTurbo ?? 49.9)
            );
            setAppEmManutencao(dados.appEmManutencao === true);
            setAvisoGlobal(dados.avisoGlobal || "");
          }
        }

        if (ativo) {
          setCarregandoDados(false);
        }
      } catch (error) {
        console.log("Erro ao carregar configurações admin:", error);

        if (ativo) {
          setStatusTela("sem-acesso");
          setCarregandoDados(false);
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
    };
  }, []);

  function formatarValorInput(valor: number) {
    return valor.toFixed(2).replace(".", ",");
  }

  function parsePreco(texto: string) {
    const normalizado = String(texto || "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const numero = Number(normalizado);

    if (!Number.isFinite(numero) || numero < 0) {
      return null;
    }

    return numero;
  }

  async function salvarConfiguracoes() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Erro", "Usuário não autenticado.");
        return;
      }

      const snapAdmin = await getDoc(doc(db, "users", user.uid));

      if (!snapAdmin.exists()) {
        Alert.alert("Erro", "Usuário sem permissão.");
        return;
      }

      const dadosAdmin = snapAdmin.data() as any;

      if (dadosAdmin.tipo !== "admin") {
        Alert.alert("Erro", "Apenas administradores podem salvar.");
        return;
      }

      const mensal = parsePreco(precoPlanoMensal);
      const turbo = parsePreco(precoPlanoTurbo);

      if (mensal === null) {
        Alert.alert("Erro", "Preço do plano mensal inválido.");
        return;
      }

      if (turbo === null) {
        Alert.alert("Erro", "Preço do plano turbo inválido.");
        return;
      }

      setSalvando(true);

      await setDoc(
        doc(db, "configuracoes", "app"),
        {
          precoPlanoMensal: mensal,
          precoPlanoTurbo: turbo,
          appEmManutencao,
          avisoGlobal: avisoGlobal.trim(),
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Sucesso", "Configurações salvas com sucesso.");
    } catch (error: any) {
      console.log("Erro ao salvar configurações:", error);

      Alert.alert(
        "Erro ao salvar",
        error?.message || "Não foi possível salvar as configurações."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Verificando acesso...</Text>
      </View>
    );
  }

  if (statusTela !== "admin") {
    return <Redirect href="/" />;
  }

  if (carregandoDados) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando configurações...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppHeader
          title="Configurações"
          subtitle="Ajustes gerais do app"
          showBackButton
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Painel de controle</Text>
          <Text style={styles.heroText}>
            Gerencie preços, manutenção e avisos globais do Nexo em um só lugar.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Planos</Text>

          <Text style={styles.label}>Preço do plano mensal</Text>
          <TextInput
            style={styles.input}
            value={precoPlanoMensal}
            onChangeText={setPrecoPlanoMensal}
            placeholder="19,90"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Preço do plano turbo</Text>
          <TextInput
            style={styles.input}
            value={precoPlanoTurbo}
            onChangeText={setPrecoPlanoTurbo}
            placeholder="49,90"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>App</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>Modo manutenção</Text>
              <Text style={styles.switchSubtitle}>
                Ative quando quiser restringir o uso do app temporariamente.
              </Text>
            </View>

            <Switch
              value={appEmManutencao}
              onValueChange={setAppEmManutencao}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.warning,
              }}
              thumbColor="#ffffff"
            />
          </View>

          <Text style={styles.label}>Aviso global</Text>
          <TextInput
            style={[styles.input, styles.inputGrande]}
            value={avisoGlobal}
            onChangeText={setAvisoGlobal}
            placeholder="Digite um aviso que poderá ser mostrado no app"
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Resumo atual</Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Plano mensal: </Text>
            R$ {precoPlanoMensal || "0,00"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Plano turbo: </Text>
            R$ {precoPlanoTurbo || "0,00"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Manutenção: </Text>
            {appEmManutencao ? "Ativa" : "Desativada"}
          </Text>

          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Aviso global: </Text>
            {avisoGlobal.trim() ? avisoGlobal.trim() : "Sem aviso"}
          </Text>
        </View>

        <View style={styles.buttonGap}>
          <ActionButton
            title={salvando ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
            onPress={salvarConfiguracoes}
            variant="primary"
            disabled={salvando}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    content: {
      padding: 16,
      paddingBottom: 32,
      gap: 12,
    },

    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: theme.colors.background,
    },

    loadingText: {
      marginTop: 12,
      color: theme.colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },

    heroCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },

    heroTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 6,
    },

    heroText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.14 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    sectionTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "bold",
      marginBottom: 12,
    },

    label: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 8,
      marginTop: 10,
    },

    input: {
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.border,
      fontSize: 15,
    },

    inputGrande: {
      minHeight: 100,
      textAlignVertical: "top",
    },

    switchRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 8,
    },

    switchTextWrap: {
      flex: 1,
    },

    switchTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
    },

    switchSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },

    infoLine: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 6,
    },

    infoLabel: {
      color: theme.colors.text,
      fontWeight: "700",
    },

    buttonGap: {
      marginTop: 4,
    },
  });
}