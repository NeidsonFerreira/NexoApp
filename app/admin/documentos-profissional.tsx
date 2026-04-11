import { Redirect, router, useLocalSearchParams } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { useAppTheme } from "../../contexts/ThemeContext";
import { auth, db } from "../../lib/firebase";

type StatusTela = "carregando" | "admin" | "sem-acesso" | "sem-user";

type ProfissionalDocumento = {
  id: string;
  nome?: string;
  servico?: string;
  cidade?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  documentoFrente?: string;
  documentoVerso?: string;
  selfieDocumento?: string;
  verificacaoStatus?: string;
  motivoRejeicao?: string;
};

export default function AdminDocumentosProfissional() {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const params = useLocalSearchParams<{ id?: string }>();

  const [statusTela, setStatusTela] = useState<StatusTela>("carregando");
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [profissional, setProfissional] = useState<ProfissionalDocumento | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (ativo) setStatusTela("sem-user");
          return;
        }

        const snapAdmin = await getDoc(doc(db, "users", user.uid));

        if (!snapAdmin.exists()) {
          if (ativo) setStatusTela("sem-acesso");
          return;
        }

        const dadosAdmin = snapAdmin.data() as any;

        if (dadosAdmin.tipo !== "admin") {
          if (ativo) setStatusTela("sem-acesso");
          return;
        }

        if (ativo) setStatusTela("admin");

        if (!params.id || typeof params.id !== "string") {
          Alert.alert("Erro", "ID do profissional não encontrado.");
          if (ativo) {
            setCarregandoDados(false);
          }
          return;
        }

        const snapProf = await getDoc(doc(db, "users", params.id));

        if (!snapProf.exists()) {
          Alert.alert("Erro", "Profissional não encontrado.");
          if (ativo) {
            setCarregandoDados(false);
          }
          return;
        }

        const dadosProf = snapProf.data() as any;

        const profissionalCarregado: ProfissionalDocumento = {
          id: snapProf.id,
          nome: dadosProf.nome || "",
          servico: dadosProf.servico || "",
          cidade: dadosProf.cidade || "",
          tipoDocumento: dadosProf.tipoDocumento || "",
          numeroDocumento: dadosProf.numeroDocumento || "",
          documentoFrente: dadosProf.documentoFrente || "",
          documentoVerso: dadosProf.documentoVerso || "",
          selfieDocumento: dadosProf.selfieDocumento || "",
          verificacaoStatus: dadosProf.verificacaoStatus || "nao_enviado",
          motivoRejeicao: dadosProf.motivoRejeicao || "",
        };

        if (ativo) {
          setProfissional(profissionalCarregado);
          setMotivoRejeicao(dadosProf.motivoRejeicao || "");
          setCarregandoDados(false);
        }
      } catch (error) {
        console.log("Erro ao carregar documentos do profissional:", error);
        if (ativo) {
          setCarregandoDados(false);
          setStatusTela("sem-acesso");
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
    };
  }, [params.id]);

  async function aprovarProfissional() {
    try {
      if (!profissional) return;

      setProcessando(true);

      await updateDoc(doc(db, "users", profissional.id), {
        verificacaoStatus: "aprovado",
        documentosEnviados: true,
        online: false,
        motivoRejeicao: "",
      });

      Alert.alert("Sucesso", "Profissional aprovado com sucesso.", [
        {
          text: "OK",
          onPress: () => router.replace("/admin/verificacoes"),
        },
      ]);
    } catch (error) {
      console.log("Erro ao aprovar profissional:", error);
      Alert.alert("Erro", "Não foi possível aprovar o profissional.");
    } finally {
      setProcessando(false);
    }
  }

  async function rejeitarProfissional() {
    try {
      if (!profissional) return;

      const motivoFinal = motivoRejeicao.trim();

      if (!motivoFinal) {
        Alert.alert(
          "Motivo obrigatório",
          "Digite o motivo da rejeição antes de continuar."
        );
        return;
      }

      setProcessando(true);

      await updateDoc(doc(db, "users", profissional.id), {
        verificacaoStatus: "rejeitado",
        documentosEnviados: true,
        online: false,
        motivoRejeicao: motivoFinal,
      });

      Alert.alert("Sucesso", "Profissional rejeitado.", [
        {
          text: "OK",
          onPress: () => router.replace("/admin/verificacoes"),
        },
      ]);
    } catch (error) {
      console.log("Erro ao rejeitar profissional:", error);
      Alert.alert("Erro", "Não foi possível rejeitar o profissional.");
    } finally {
      setProcessando(false);
    }
  }

  function renderBlocoImagem(
    titulo: string,
    uri?: string,
    altura: number = 220
  ) {
    return (
      <View style={styles.section}>
        <Text style={styles.label}>{titulo}</Text>

        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.image, { height: altura }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholder, { height: altura }]}>
            <Text style={styles.placeholderText}>Imagem não enviada</Text>
          </View>
        )}
      </View>
    );
  }

  if (statusTela === "carregando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Verificando acesso...</Text>
      </View>
    );
  }

  if (statusTela === "sem-user") {
    return <Redirect href="/" />;
  }

  if (statusTela === "sem-acesso") {
    return <Redirect href="/" />;
  }

  if (carregandoDados) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando documentos...</Text>
      </View>
    );
  }

  if (!profissional) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Profissional não encontrado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title={profissional.nome || "Documentos"}
          subtitle="Confira os arquivos enviados pelo profissional"
          showBackButton
        />

        <View style={styles.cardInfo}>
          <View style={styles.statusWrap}>
            <Text style={styles.statusBadge}>EM ANÁLISE</Text>
          </View>

          <Text style={styles.nome}>{profissional.nome || "Profissional"}</Text>

          <Text style={styles.meta}>
            {profissional.servico || "Sem serviço"} •{" "}
            {profissional.cidade || "Sem cidade"}
          </Text>

          <Text style={styles.meta}>
            {String(profissional.tipoDocumento || "").toUpperCase()}:{" "}
            {profissional.numeroDocumento || "Não informado"}
          </Text>
        </View>

        {renderBlocoImagem(
          "Frente do documento",
          profissional.documentoFrente,
          220
        )}

        {renderBlocoImagem(
          "Verso do documento",
          profissional.documentoVerso,
          220
        )}

        {renderBlocoImagem(
          "Selfie com documento",
          profissional.selfieDocumento,
          360
        )}

        <View style={styles.motivoBox}>
          <Text style={styles.label}>Motivo da rejeição</Text>

          <TextInput
            style={styles.inputMotivo}
            value={motivoRejeicao}
            onChangeText={setMotivoRejeicao}
            placeholder="Ex: documento ilegível, selfie não corresponde, foto cortada..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
        </View>

        <View style={styles.buttonGap}>
          <ActionButton
            title={processando ? "PROCESSANDO..." : "APROVAR"}
            onPress={aprovarProfissional}
            variant="success"
            disabled={processando}
          />
        </View>

        <View style={styles.buttonGap}>
          <ActionButton
            title={processando ? "PROCESSANDO..." : "REJEITAR"}
            onPress={rejeitarProfissional}
            variant="danger"
            disabled={processando}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    container: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 32,
    },

    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: theme.colors.background,
    },

    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 15,
      marginTop: 12,
      textAlign: "center",
    },

    cardInfo: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    statusWrap: {
      alignItems: "flex-end",
      marginBottom: 10,
    },

    statusBadge: {
      color: "#fff",
      backgroundColor: theme.colors.warning,
      fontSize: 11,
      fontWeight: "800",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      overflow: "hidden",
    },

    nome: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 6,
    },

    meta: {
      color: theme.colors.textMuted,
      fontSize: 14,
      marginBottom: 4,
      lineHeight: 20,
    },

    section: {
      marginBottom: 18,
    },

    label: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 8,
    },

    image: {
      width: "100%",
      borderRadius: 16,
      backgroundColor: theme.colors.card,
    },

    placeholder: {
      width: "100%",
      borderRadius: 16,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },

    placeholderText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: "center",
    },

    motivoBox: {
      marginBottom: 10,
    },

    inputMotivo: {
      minHeight: 95,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.colors.text,
      fontSize: 15,
      textAlignVertical: "top",
    },

    buttonGap: {
      marginTop: 10,
    },
  });
}