import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { OfflineBanner } from "../../components/OfflineBanner";
import { useAppTheme } from "../../contexts/ThemeContext";
import { handleError } from "../../lib/errorHandler";
import { auth, functions, storage } from "../../lib/firebase";
import { isOnline } from "../../lib/network";

type EnviarDocumentosVerificacaoResponse = {
  ok?: boolean;
  verificacaoStatus?: string;
  onboardingStatus?: string;
};

const MAX_RETRY_UPLOAD = 3;
const MAX_UPLOAD_SIDE = 1800;
const JPEG_COMPRESS = 0.78;

export default function VerificacaoProfissional() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const [documentoFrente, setDocumentoFrente] = useState("");
  const [documentoVerso, setDocumentoVerso] = useState("");
  const [selfie, setSelfie] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [etapaUpload, setEtapaUpload] = useState("");

  const podeEnviar = useMemo(() => {
    return !!documentoFrente && !!selfie && !salvando;
  }, [documentoFrente, selfie, salvando]);

  async function escolherImagem(
    setter: (valor: string) => void,
    label: string
  ) {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissao.granted) {
      Alert.alert("Permissão negada", "Libere o acesso às fotos do celular.");
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: [4, 5],
    });

    if (!resultado.canceled) {
      setter(resultado.assets[0].uri);
    }
  }

  async function otimizarImagem(uri: string, rotulo: string) {
    if (!uri || uri.startsWith("http")) return uri;

    try {
      const manipulada = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_UPLOAD_SIDE } }],
        {
          compress: JPEG_COMPRESS,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return manipulada.uri;
    } catch (error) {
      handleError(error, `VerificacaoProfissional.otimizarImagem.${rotulo}`);
      throw new Error(`Não foi possível preparar a imagem: ${rotulo}.`);
    }
  }

  async function uriParaBlob(uri: string): Promise<Blob> {
    const response = await fetch(uri);
    return await response.blob();
  }

  async function uploadImagemComRetry(uri: string, caminho: string, rotulo: string) {
    if (!uri) return "";
    if (uri.startsWith("http")) return uri;

    const uriOtimizada = await otimizarImagem(uri, rotulo);
    let ultimaFalha: unknown = null;

    for (let tentativa = 1; tentativa <= MAX_RETRY_UPLOAD; tentativa++) {
      try {
        setEtapaUpload(`Enviando ${rotulo} (${tentativa}/${MAX_RETRY_UPLOAD})...`);
        const blob = await uriParaBlob(uriOtimizada);
        const storageRef = ref(storage, caminho);
        await uploadBytes(storageRef, blob);
        return await getDownloadURL(storageRef);
      } catch (error) {
        ultimaFalha = error;
        handleError(error, `VerificacaoProfissional.upload.${rotulo}.tentativa${tentativa}`);
        if (tentativa < MAX_RETRY_UPLOAD) {
          await new Promise((resolve) => setTimeout(resolve, tentativa * 900));
        }
      }
    }

    throw new Error(`Falha ao enviar ${rotulo}.`);
  }

  async function enviarDocumentosVerificacao(payload: {
    documentoFrenteUrl: string;
    documentoVersoUrl: string;
    selfieUrl: string;
    observacao: string;
  }) {
    const callable = httpsCallable<
      {
        documentoFrenteUrl: string;
        documentoVersoUrl: string;
        selfieUrl: string;
        observacao: string;
      },
      EnviarDocumentosVerificacaoResponse
    >(functions, "enviarDocumentosVerificacao");

    const response = await callable(payload);
    return response.data;
  }

  async function enviar() {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Erro", "Usuário não autenticado.");
        return;
      }

      if (!documentoFrente) {
        Alert.alert("Erro", "Envie a frente do documento.");
        return;
      }

      if (!selfie) {
        Alert.alert("Erro", "Envie uma selfie segurando o documento.");
        return;
      }

      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      setSalvando(true);

      const documentoFrenteUrl = await uploadImagemComRetry(
        documentoFrente,
        `profissionais/${user.uid}/documentos/documento-frente.jpg`,
        "documento frente"
      );

      const documentoVersoUrl = documentoVerso
        ? await uploadImagemComRetry(
            documentoVerso,
            `profissionais/${user.uid}/documentos/documento-verso.jpg`,
            "documento verso"
          )
        : "";

      const selfieUrl = await uploadImagemComRetry(
        selfie,
        `profissionais/${user.uid}/documentos/selfie.jpg`,
        "selfie"
      );

      setEtapaUpload("Registrando documentos...");

      await enviarDocumentosVerificacao({
        documentoFrenteUrl,
        documentoVersoUrl,
        selfieUrl,
        observacao: observacao.trim(),
      });

      setEtapaUpload("");

      Alert.alert(
        "Documentos enviados",
        "Seus documentos foram enviados com sucesso e agora estão em análise.",
        [{ text: "OK", onPress: () => router.replace("/painel-profissional") }]
      );
    } catch (error: any) {
      handleError(error, "VerificacaoProfissional.enviar");
      Alert.alert("Erro", error?.message || "Não foi possível enviar os documentos.");
    } finally {
      setSalvando(false);
      setEtapaUpload("");
    }
  }

  function renderBoxImagem(
    uri: string,
    onPress: () => void,
    label: string
  ) {
    return (
      <TouchableOpacity style={styles.boxImagem} onPress={onPress}>
        {uri ? (
          <Image source={{ uri }} style={styles.preview} />
        ) : (
          <Text style={styles.textoImagem}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <OfflineBanner />

        <Text style={styles.titulo}>Verificação Profissional</Text>
        <Text style={styles.subtitulo}>
          Envie seus documentos para análise e ativação da conta.
        </Text>

        <View style={styles.avisoCard}>
          <Text style={styles.avisoTitle}>O que enviar</Text>
          <Text style={styles.avisoText}>
            1. Frente do documento
          </Text>
          <Text style={styles.avisoText}>
            2. Verso do documento (opcional, mas recomendado)
          </Text>
          <Text style={styles.avisoText}>
            3. Selfie segurando o documento
          </Text>
        </View>

        <Text style={styles.label}>Documento frente</Text>
        {renderBoxImagem(
          documentoFrente,
          () => escolherImagem(setDocumentoFrente, "documento frente"),
          "Selecionar frente"
        )}

        <Text style={styles.label}>Documento verso</Text>
        {renderBoxImagem(
          documentoVerso,
          () => escolherImagem(setDocumentoVerso, "documento verso"),
          "Selecionar verso"
        )}

        <Text style={styles.label}>Selfie com documento</Text>
        {renderBoxImagem(
          selfie,
          () => escolherImagem(setSelfie, "selfie"),
          "Selecionar selfie"
        )}

        <Text style={styles.label}>Observação (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputGrande]}
          value={observacao}
          onChangeText={setObservacao}
          placeholder="Alguma observação para a análise"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />

        <TouchableOpacity
          style={[styles.botaoEnviar, !podeEnviar && styles.botaoDesabilitado]}
          onPress={enviar}
          disabled={!podeEnviar}
        >
          {salvando ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.textoBotao}>ENVIAR DOCUMENTOS</Text>
          )}
        </TouchableOpacity>

        {!!etapaUpload && <Text style={styles.uploadStatus}>{etapaUpload}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 18, paddingBottom: 40 },
    titulo: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "bold",
      marginBottom: 6,
    },
    subtitulo: {
      color: theme.colors.textMuted,
      fontSize: 15,
      marginBottom: 14,
    },
    avisoCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 12,
    },
    avisoTitle: {
      color: theme.colors.text,
      fontWeight: "bold",
      marginBottom: 8,
    },
    avisoText: {
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    label: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "bold",
      marginBottom: 8,
      marginTop: 12,
    },
    boxImagem: {
      height: 180,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    preview: {
      width: "100%",
      height: "100%",
    },
    textoImagem: {
      color: theme.colors.textMuted,
      fontWeight: "bold",
      textAlign: "center",
      paddingHorizontal: 8,
    },
    input: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: theme.colors.text,
      fontSize: 15,
    },
    inputGrande: {
      minHeight: 95,
      textAlignVertical: "top",
    },
    botaoEnviar: {
      backgroundColor: theme.colors.primary,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 24,
    },
    botaoDesabilitado: {
      opacity: 0.65,
    },
    textoBotao: {
      color: "#fff",
      fontWeight: "bold",
      fontSize: 16,
    },
    uploadStatus: {
      color: theme.colors.textMuted,
      marginTop: 12,
      textAlign: "center",
    },
  });
}
