import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader } from "../../components/AppHeader";
import { ActionButton } from "../../components/ActionButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAppTheme } from "../../contexts/ThemeContext";

export default function AjudaProfissional() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  function abrirChatSuporte() {
  router.push({
    pathname: "/chat-suporte",
    params: { categoria: "Suporte Técnico Profissional" },
  });
  }

  function abrirWhatsapp() {
    const numero = "5532991223690";
    const mensagem = "Olá, preciso de ajuda no app Nexo Profissional.";
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

    Linking.openURL(url).catch(() => {
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    });
  }

  function abrirEmail() {
    const email = "suporte@nexoapp.com";
    const assunto = "Ajuda no app Nexo Profissional";
    const body = "Olá, preciso de ajuda com minha conta profissional no app.";

    const url = `mailto:${email}?subject=${encodeURIComponent(
      assunto
    )}&body=${encodeURIComponent(body)}`;

    Linking.openURL(url).catch(() => {
      Alert.alert("Erro", "Não foi possível abrir o email.");
    });
  }

  
// 🔥 MELHORIAS NÍVEL APP GRANDE (PROFISSIONAL)

function abrirTicketProfissional() {
  router.push({
    pathname: "/chat-suporte",
    params: {
      categoria: "Financeiro Profissional",
    },
  });
}

function respostaRapidaProfissional(tipo: "pedido" | "pagamento" | "visibilidade") {
  if (tipo === "pedido") {
    Alert.alert(
      "Resposta rápida",
      "Verifique seus pedidos no painel. Aceite rapidamente para não perder clientes."
    );
    return;
  }

  if (tipo === "pagamento") {
    Alert.alert(
      "Resposta rápida",
      "Pagamentos dependem do serviço combinado. Use o chat para alinhar com o cliente."
    );
    return;
  }

  Alert.alert(
    "Resposta rápida",
    "Mantenha seu perfil completo, online e com boas avaliações para aparecer mais."
  );
}

function reportarProblemaProfissional() {
  router.push({
    pathname: "/chat-suporte",
    params: {
      origem: "erro_agenda_profissional",
      categoria: "Erro na Agenda",
    },
  });
}

function reportarClienteProfissional() {
  router.push({
    pathname: "/chat-suporte",
    params: { categoria: "Denúncia de Cliente" },
  });
}

function avaliarAppProfissional() {
  Alert.alert("Avaliar app", "Adicione aqui depois o link da loja.");
}

function abrirFaq(titulo: string, resposta: string) {
    Alert.alert(titulo, resposta);
  }

  return (
    <ScreenContainer>
      <AppHeader
        title="Ajuda"
        subtitle="Dúvidas sobre uso do app profissional"
        showBackButton
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Perguntas frequentes</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como aceitar pedidos?"
              onPress={() =>
                abrirFaq(
                  "Como aceitar pedidos?",
                  "Quando um cliente solicitar um atendimento, o pedido aparecerá no seu painel profissional. Você poderá analisar e aceitar por lá."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como ficar online?"
              onPress={() =>
                abrirFaq(
                  "Como ficar online?",
                  "Ative o botão 'Online' no seu painel profissional para aparecer no mapa e ficar disponível para novos clientes."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como funciona meu plano?"
              onPress={() =>
                abrirFaq(
                  "Como funciona meu plano?",
                  "Seu plano define recursos como destaque no app, visibilidade para clientes e, dependendo do plano, opções extras como contato direto."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como recebo clientes?"
              onPress={() =>
                abrirFaq(
                  "Como recebo clientes?",
                  "Clientes próximos podem encontrar seu perfil, visualizar seus serviços, analisar seu portfólio e solicitar atendimento."
                )
              }
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Como melhorar minha visibilidade?"
              onPress={() =>
                abrirFaq(
                  "Como melhorar minha visibilidade?",
                  "Manter seu perfil completo, com boas fotos, descrição clara, avaliação positiva e status online ativo ajuda você a aparecer melhor para os clientes."
                )
              }
              variant="neutral"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Suporte</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Chamar chat-suporte"
              onPress={abrirChatSuporte}
              variant="warning"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Falar no WhatsApp"
              onPress={abrirWhatsapp}
              variant="success"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Enviar Email"
              onPress={abrirEmail}
              variant="primary"
            />
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Suporte avançado</Text>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Dúvida sobre Repasses/Pagamentos"
              onPress={abrirTicketProfissional}
              variant="warning"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Problema com Agenda/Calendário"
              onPress={reportarProblemaProfissional}
              variant="danger"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Reportar Comportamento de Cliente"
              onPress={reportarClienteProfissional}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Resposta rápida (Pedidos)"
              onPress={() => respostaRapidaProfissional("pedido")}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Resposta rápida (Pagamentos)"
              onPress={() => respostaRapidaProfissional("pagamento")}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Resposta rápida (Visibilidade)"
              onPress={() => respostaRapidaProfissional("visibilidade")}
              variant="neutral"
            />
          </View>

          <View style={styles.buttonTop}>
            <ActionButton
              title="Avaliar aplicativo"
              onPress={avaliarAppProfissional}
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