import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
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
import { auth, db, functions, storage } from "../../lib/firebase";
import { isOnline } from "../../lib/network";

type TipoAtendimento = "fixo" | "movel";

type FinalizarCadastroProfissionalResponse = {
  ok?: boolean;
  perfilCompleto?: boolean;
  onboardingStatus?: string;
};

const SERVICOS_DISPONIVEIS = [
  { nome: "Eletricista", emoji: "⚡" },
  { nome: "Encanador", emoji: "🚰" },
  { nome: "Chaveiro", emoji: "🔑" },
  { nome: "Mecânico", emoji: "🔧" },
  { nome: "Tatuador", emoji: "🖊️" },
  { nome: "Barbeiro", emoji: "💈" },
  { nome: "Cabeleireiro", emoji: "💇" },
  { nome: "Manicure", emoji: "💅" },
  { nome: "Esteticista", emoji: "🧴" },
  { nome: "Maquiador(a)", emoji: "💄" },
  { nome: "Diarista", emoji: "🧼" },
  { nome: "Faxineiro(a)", emoji: "🧹" },
  { nome: "Marceneiro", emoji: "🪚" },
  { nome: "Pedreiro", emoji: "🧱" },
  { nome: "Pintor", emoji: "🎨" },
  { nome: "Técnico de Ar Condicionado", emoji: "❄️" },
  { nome: "Técnico de TV", emoji: "📺" },
  { nome: "Técnico de Celular", emoji: "📱" },
  { nome: "Técnico de Informática", emoji: "💻" },
  { nome: "Lavador de Carro", emoji: "🚗" },
  { nome: "Pet Groomer", emoji: "🐶" },
  { nome: "Cozinheiro(a)", emoji: "🧑‍🍳" },
  { nome: "DJ", emoji: "🎧" },
  { nome: "Fotógrafo", emoji: "📸" },
  { nome: "Videomaker", emoji: "🎥" },
  { nome: "Motoboy", emoji: "🛵" },
  { nome: "Frete/Mudança", emoji: "🚚" },
  { nome: "Contador", emoji: "🧾" },
  { nome: "Advogado", emoji: "⚖️" },
];

const MAX_RETRY_UPLOAD = 3;

export default function CadastroProfissional() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [nome, setNome] = useState("");
  const [servicosSelecionados, setServicosSelecionados] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>("fixo");
  const [endereco, setEndereco] = useState("");
  const [fotoPerfil, setFotoPerfil] = useState("");
  const [portfolio1, setPortfolio1] = useState("");
  const [portfolio2, setPortfolio2] = useState("");
  const [portfolio3, setPortfolio3] = useState("");
  const [statusOnboarding, setStatusOnboarding] = useState("cadastro_inicial");
  const [planoAtual, setPlanoAtual] = useState("gratuito");
  const [documentosEnviados, setDocumentosEnviados] = useState(false);
  const [verificacaoStatus, setVerificacaoStatus] = useState("nao_enviado");

  const portfolioUris = useMemo(
    () => [portfolio1, portfolio2, portfolio3].filter(Boolean),
    [portfolio1, portfolio2, portfolio3]
  );

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const dados = snap.data() as any;
        setNome(dados.nome || "");
        setServicosSelecionados(Array.isArray(dados.servicos) ? dados.servicos : []);
        setDescricao(dados.descricao || "");
        setTelefone(formatarTelefone(dados.telefone || ""));
        setCidade(dados.cidade || "");
        setTipoAtendimento(dados.tipoAtendimento === "movel" ? "movel" : "fixo");
        setEndereco(dados.endereco || "");
        setFotoPerfil(dados.fotoPerfil || "");
        setPortfolio1(dados.portfolio?.[0] || "");
        setPortfolio2(dados.portfolio?.[1] || "");
        setPortfolio3(dados.portfolio?.[2] || "");
        setStatusOnboarding(dados.onboardingStatus || "cadastro_inicial");
        setPlanoAtual(dados.plano || "gratuito");
        setDocumentosEnviados(dados.documentosEnviados === true);
        setVerificacaoStatus(dados.verificacaoStatus || "nao_enviado");
      }
    } catch (error) {
      handleError(error, "CadastroProfissional.carregarDados");
    } finally {
      setCarregandoDados(false);
    }
  }

  function formatarTelefone(valor: string) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);
    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  function normalizarTelefone(valor: string) {
    return valor.replace(/\D/g, "");
  }

  function telefoneValido(valor: string) {
    const numeros = normalizarTelefone(valor);
    return numeros.length >= 10 && numeros.length <= 11;
  }

  function descricaoValida(valor: string) {
    return !valor.trim() || valor.trim().length >= 10;
  }

  function alternarServico(nomeServico: string) {
    setServicosSelecionados((atual) => {
      if (atual.includes(nomeServico)) return atual.filter((item) => item !== nomeServico);
      if (atual.length >= 5) {
        Alert.alert("Limite atingido", "Selecione no máximo 5 serviços.");
        return atual;
      }
      return [...atual, nomeServico];
    });
  }

  async function escolherImagem(setter: (valor: string) => void) {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert("Permissão negada", "Libere o acesso às fotos do celular.");
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
      aspect: [1, 1],
    });

    if (!resultado.canceled) setter(resultado.assets[0].uri);
  }

  async function uriParaBlob(uri: string): Promise<Blob> {
    const response = await fetch(uri);
    return await response.blob();
  }

  async function uploadImagemComRetry(uri: string, caminho: string) {
    if (!uri) return "";
    if (uri.startsWith("http")) return uri;

    let ultimaFalha: unknown = null;

    for (let tentativa = 1; tentativa <= MAX_RETRY_UPLOAD; tentativa++) {
      try {
        const blob = await uriParaBlob(uri);
        const storageRef = ref(storage, caminho);
        await uploadBytes(storageRef, blob);
        return await getDownloadURL(storageRef);
      } catch (error) {
        ultimaFalha = error;
        if (tentativa < MAX_RETRY_UPLOAD) {
          await new Promise((resolve) => setTimeout(resolve, tentativa * 800));
        }
      }
    }

    throw ultimaFalha || new Error("Falha no upload da imagem.");
  }

  async function finalizarCadastroProfissional(payload: {
    nome: string;
    servicos: string[];
    descricao: string;
    telefone: string;
    cidade: string;
    tipoAtendimento: TipoAtendimento;
    endereco: string;
    fotoPerfil: string;
    portfolio: string[];
  }) {
    const callable = httpsCallable<any, FinalizarCadastroProfissionalResponse>(
      functions,
      "finalizarCadastroProfissional"
    );
    const response = await callable(payload);
    return response.data;
  }

  async function salvarCadastro() {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Erro", "Usuário não autenticado.");
        return;
      }

      if (!nome.trim() || !telefone.trim() || !cidade.trim()) {
        Alert.alert("Erro", "Preencha nome, telefone e cidade.");
        return;
      }

      if (!telefoneValido(telefone)) {
        Alert.alert("Erro", "Telefone inválido.");
        return;
      }

      if (!descricaoValida(descricao)) {
        Alert.alert("Erro", "A descrição deve ter pelo menos 10 caracteres.");
        return;
      }

      if (servicosSelecionados.length === 0) {
        Alert.alert("Erro", "Selecione pelo menos um serviço.");
        return;
      }

      if (tipoAtendimento === "fixo" && !endereco.trim()) {
        Alert.alert("Erro", "Informe o endereço do atendimento fixo.");
        return;
      }

      if (!fotoPerfil) {
        Alert.alert("Erro", "Escolha uma foto de perfil.");
        return;
      }

      if (portfolioUris.length === 0) {
        Alert.alert("Erro", "Adicione pelo menos uma imagem no portfólio.");
        return;
      }

      const online = await isOnline();
      if (!online) {
        Alert.alert("Sem internet", "Conecte-se à internet para continuar.");
        return;
      }

      setSalvando(true);

      const fotoPerfilUrl = await uploadImagemComRetry(
        fotoPerfil,
        `profissionais/${user.uid}/foto-perfil.jpg`
      );

      const portfolioUrls = await Promise.all([
        portfolio1
          ? uploadImagemComRetry(
              portfolio1,
              `profissionais/${user.uid}/portfolio/portfolio-1.jpg`
            )
          : Promise.resolve(""),
        portfolio2
          ? uploadImagemComRetry(
              portfolio2,
              `profissionais/${user.uid}/portfolio/portfolio-2.jpg`
            )
          : Promise.resolve(""),
        portfolio3
          ? uploadImagemComRetry(
              portfolio3,
              `profissionais/${user.uid}/portfolio/portfolio-3.jpg`
            )
          : Promise.resolve(""),
      ]);

      const resposta = await finalizarCadastroProfissional({
        nome: nome.trim(),
        servicos: servicosSelecionados,
        descricao: descricao.trim(),
        telefone: telefone.trim(),
        cidade: cidade.trim(),
        tipoAtendimento,
        endereco: tipoAtendimento === "fixo" ? endereco.trim() : "",
        fotoPerfil: fotoPerfilUrl,
        portfolio: portfolioUrls.filter(Boolean),
      });

      if (resposta?.onboardingStatus) {
        setStatusOnboarding(resposta.onboardingStatus);
      }

      const primeiraVezSemDocumentos =
        !documentosEnviados && verificacaoStatus === "nao_enviado";

      if (primeiraVezSemDocumentos) {
        Alert.alert(
          "Sucesso",
          "Cadastro profissional salvo com sucesso. Agora envie seus documentos para análise.",
          [{ text: "OK", onPress: () => router.push("/verificacao-profissional") }]
        );
      } else {
        Alert.alert("Sucesso", "Cadastro profissional atualizado com sucesso.");
      }

      await carregarDados();
    } catch (error: any) {
      handleError(error, "CadastroProfissional.salvarCadastro");
      Alert.alert("Erro", error?.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  function renderBoxImagem(uri: string, onPress: () => void, label: string) {
    return (
      <TouchableOpacity style={styles.boxImagem} onPress={onPress}>
        {uri ? (
          <Image source={{ uri }} style={styles.imagemPortfolio} />
        ) : (
          <Text style={styles.textoImagem}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (carregandoDados) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando cadastro...</Text>
      </View>
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

        <Text style={styles.titulo}>Cadastro Profissional</Text>
        <Text style={styles.subtitulo}>
          Monte seu perfil para aparecer bonito na lista, perfil e mapa
        </Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Status do onboarding</Text>
          <Text style={styles.statusText}>Atual: {statusOnboarding}</Text>
          <Text style={styles.statusText}>Plano atual: {planoAtual}</Text>
          <Text style={styles.statusText}>
            Documentos enviados: {documentosEnviados ? "sim" : "não"}
          </Text>
          <Text style={styles.statusText}>
            Verificação: {verificacaoStatus}
          </Text>
        </View>

        <Text style={styles.avisoFluxo}>
          Depois de salvar seu perfil, você poderá enviar seus documentos para ativar sua conta.
        </Text>

        <Text style={styles.label}>Foto de perfil</Text>
        <View style={styles.fotoPerfilArea}>
          <TouchableOpacity
            style={styles.fotoPerfilBox}
            onPress={() => escolherImagem(setFotoPerfil)}
          >
            {fotoPerfil ? (
              <Image source={{ uri: fotoPerfil }} style={styles.fotoPerfil} />
            ) : (
              <Text style={styles.textoImagem}>Escolher foto</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Portfólio</Text>
        <Text style={styles.helperText}>
          Envie até 3 imagens. Pelo menos 1 é obrigatória.
        </Text>
        <View style={styles.portfolioRow}>
          {renderBoxImagem(portfolio1, () => escolherImagem(setPortfolio1), "Foto 1")}
          {renderBoxImagem(portfolio2, () => escolherImagem(setPortfolio2), "Foto 2")}
          {renderBoxImagem(portfolio3, () => escolherImagem(setPortfolio3), "Foto 3")}
        </View>

        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholder="Seu nome profissional"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.label}>Serviços</Text>
        <Text style={styles.helperText}>
          Selecione até 5 serviços. O primeiro selecionado vira o principal.
        </Text>
        <View style={styles.servicosGrid}>
          {SERVICOS_DISPONIVEIS.map((item) => {
            const ativo = servicosSelecionados.includes(item.nome);
            return (
              <TouchableOpacity
                key={item.nome}
                style={[styles.servicoCard, ativo && styles.servicoCardAtivo]}
                onPress={() => alternarServico(item.nome)}
                activeOpacity={0.9}
              >
                <Text style={styles.servicoEmoji}>{item.emoji}</Text>
                <Text style={[styles.servicoTexto, ativo && styles.servicoTextoAtivo]}>
                  {item.nome}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {servicosSelecionados.length > 0 && (
          <Text style={styles.servicoSelecionado}>
            Selecionados: {servicosSelecionados.join(", ")}
          </Text>
        )}

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={[styles.input, styles.inputGrande]}
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Fale sobre seu trabalho"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />

        <Text style={styles.label}>Telefone / WhatsApp</Text>
        <TextInput
          style={styles.input}
          value={telefone}
          onChangeText={(v) => setTelefone(formatarTelefone(v))}
          placeholder="(32) 99999-9999"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Cidade</Text>
        <TextInput
          style={styles.input}
          value={cidade}
          onChangeText={setCidade}
          placeholder="Ex: Juiz de Fora"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.label}>Tipo de atendimento</Text>
        <View style={styles.tipoRow}>
          <TouchableOpacity
            style={[styles.tipoBotao, tipoAtendimento === "fixo" && styles.tipoBotaoAtivo]}
            onPress={() => setTipoAtendimento("fixo")}
          >
            <Text style={[styles.tipoTexto, tipoAtendimento === "fixo" && styles.tipoTextoAtivo]}>
              📍 Fixo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tipoBotao, tipoAtendimento === "movel" && styles.tipoBotaoAtivo]}
            onPress={() => setTipoAtendimento("movel")}
          >
            <Text style={[styles.tipoTexto, tipoAtendimento === "movel" && styles.tipoTextoAtivo]}>
              🚗 Móvel
            </Text>
          </TouchableOpacity>
        </View>

        {tipoAtendimento === "fixo" && (
          <>
            <Text style={styles.label}>Endereço</Text>
            <TextInput
              style={[styles.input, styles.inputGrande]}
              value={endereco}
              onChangeText={setEndereco}
              placeholder="Rua, número, bairro"
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
            <Text style={styles.helperText}>
              A localização será resolvida no backend para evitar coordenadas falsas.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[styles.botaoSalvar, salvando && styles.botaoSalvarDisabled]}
          onPress={salvarCadastro}
          disabled={salvando}
        >
          <Text style={styles.textoBotao}>
            {salvando ? "SALVANDO..." : "SALVAR CADASTRO"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 18, paddingBottom: 40 },
    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: { color: theme.colors.text, marginTop: 12, fontSize: 15 },
    titulo: { color: theme.colors.text, fontSize: 28, fontWeight: "bold", marginBottom: 6 },
    subtitulo: { color: theme.colors.textMuted, fontSize: 15, marginBottom: 10 },
    statusCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 12,
    },
    statusTitle: { color: theme.colors.text, fontWeight: "bold", marginBottom: 6 },
    statusText: { color: theme.colors.textMuted, lineHeight: 20 },
    avisoFluxo: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 18,
    },
    label: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "bold",
      marginBottom: 8,
      marginTop: 12,
    },
    helperText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginBottom: 8,
      lineHeight: 18,
    },
    fotoPerfilArea: { alignItems: "center", marginBottom: 8 },
    fotoPerfilBox: {
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: theme.colors.card,
      borderWidth: 2,
      borderColor: theme.colors.border,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    fotoPerfil: { width: "100%", height: "100%" },
    portfolioRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    boxImagem: {
      flex: 1,
      height: 110,
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    imagemPortfolio: { width: "100%", height: "100%" },
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
    inputGrande: { minHeight: 95, textAlignVertical: "top" },
    servicosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    servicoCard: {
      width: "48%",
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    servicoCardAtivo: {
      backgroundColor: theme.colors.success,
      borderColor: theme.colors.success,
    },
    servicoEmoji: { fontSize: 24, marginBottom: 8 },
    servicoTexto: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: "bold",
      textAlign: "center",
    },
    servicoTextoAtivo: { color: "#fff" },
    servicoSelecionado: {
      color: theme.colors.success,
      fontSize: 14,
      fontWeight: "bold",
      marginTop: 10,
    },
    tipoRow: { flexDirection: "row", gap: 10 },
    tipoBotao: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    tipoBotaoAtivo: {
      borderColor: theme.colors.success,
      backgroundColor: theme.colors.success,
    },
    tipoTexto: { color: theme.colors.text, fontWeight: "bold", fontSize: 15 },
    tipoTextoAtivo: { color: "#fff" },
    botaoSalvar: {
      backgroundColor: theme.colors.primary,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 24,
    },
    botaoSalvarDisabled: { opacity: 0.7 },
    textoBotao: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  });
}