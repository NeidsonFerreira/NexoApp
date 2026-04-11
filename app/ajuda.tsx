import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader } from "../components/AppHeader";
import { ActionButton } from "../components/ActionButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppTheme } from "../contexts/ThemeContext";

export default function Ajuda() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  function abrirChatSuporte() {
    router.push("/chat-suporte");
  }

  function abrirWhatsappSuporte() {
    const numero = "5532991223690";
    const mensagem = "Olá, preciso de ajuda no app Nexo.";
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

    Linking.openURL(url).catch(() => {
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    });
  }

  function abrirEmailSuporte() {
    const email = "suporte@nexoapp.com";
    const assunto = "Ajuda no app Nexo";
    const body = "Olá, preciso de ajuda com o aplicativo.";

    const url = `mailto:${email}?subject=${encodeURIComponent(
      assunto
    )}&body=${encodeURIComponent(body)}`;

    Linking.openURL(url).catch(() => {
      Alert.alert("Erro", "Não foi possível abrir o email.");
    });
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

  
  function abrirTicketSuporte() {
    router.push("/chat-suporte");
  }

  function autoRespostaRapida(chave: "pedido" | "pagamento" | "cadastro") {
    if (chave === "pedido") {
      Alert.alert(
        "Resposta rápida",
        "Você pode acompanhar tudo em 'Meus pedidos'. Se houver atraso ou problema, abra o chat-suporte."
      );
      return;
    }

    if (chave === "pagamento") {
      Alert.alert(
        "Resposta rápida",
        "Pagamentos e cobranças do app podem variar conforme o serviço. Se algo estiver errado, abra um chamado no suporte."
      );
      return;
    }

    Alert.alert(
      "Resposta rápida",
      "Você pode alterar seus dados na tela de perfil e configurações. Se não conseguir entrar na conta, use o chat-suporte."
    );
  }

  function reportarBug() {
    router.push({
      pathname: "/chat-suporte",
      params: {
        origem: "bug_app_cliente",
      },
    });
  }

  function avaliarApp() {
    Alert.alert(
      "Avaliar app",
      "Adicione aqui depois o link real da App Store e Google Play para avaliação do aplicativo."
    );
  }

  function ajudaComPedidoAtual() {
    router.push({
      pathname: "/chat-suporte",
      params: {
        origem: "ajuda_pedido_cliente",
      },
    });
  }

  function abrirFaq(titulo: string, resposta: string) {
    Alert.alert(titulo, resposta);
  }

  return (
    <ScreenContainer>
      <AppHeader
        title="Ajuda"
        subtitle="Tire dúvidas e fale com o suporte"
        showBackButton
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Dúvidas frequentes</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como contratar um profissional?"
              onPress={() =>
                abrirFaq(
                  "Como contratar um profissional?",
                  "Na tela inicial, toque em 'Encontrar serviço', escolha um profissional e envie seu pedido."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como ver meus pedidos?"
              onPress={() =>
                abrirFaq(
                  "Como ver meus pedidos?",
                  "Na tela inicial, toque em 'Meus pedidos' para acompanhar o status dos atendimentos."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como funciona o mapa?"
              onPress={() =>
                abrirFaq(
                  "Como funciona o mapa?",
                  "Na tela 'Ver no mapa', você pode acompanhar a localização do profissional ou a rota até o atendimento."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como alterar meus dados?"
              onPress={() =>
                abrirFaq(
                  "Como alterar meus dados?",
                  "Na tela de perfil, você pode editar nome, telefone, email e senha."
                )
              }
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Falar com suporte</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Chamar chat-suporte"
              onPress={abrirChatSuporte}
              variant="warning"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="WhatsApp"
              onPress={abrirWhatsappSuporte}
              variant="success"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Email"
              onPress={abrirEmailSuporte}
              variant="primary"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Privacidade e termos</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Política de privacidade"
              onPress={abrirPolitica}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Termos de uso"
              onPress={abrirTermos}
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Suporte rápido</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Abrir chamado"
              onPress={abrirTicketSuporte}
              variant="warning"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Ajuda com meu pedido"
              onPress={ajudaComPedidoAtual}
              variant="primary"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Reportar bug no app"
              onPress={reportarBug}
              variant="danger"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Resposta rápida sobre pedido"
              onPress={() => autoRespostaRapida("pedido")}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Resposta rápida sobre pagamento"
              onPress={() => autoRespostaRapida("pagamento")}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Resposta rápida sobre cadastro"
              onPress={() => autoRespostaRapida("cadastro")}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Avaliar aplicativo"
              onPress={avaliarApp}
              variant="success"
            />
          </View>
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    content: {
      paddingBottom: 40,
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

    buttonTop: {
      marginTop: 10,
    },
  });
}