import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db, serverTimestamp } from "../config/admin";

type TipoMensagem = "texto" | "imagem";

type RequestData = {
  pedidoId?: string;
  texto?: string;
  tipo?: TipoMensagem;
  imagemUrl?: string;
};

function limparTexto(valor: unknown) {
  return String(valor || "").trim();
}

function agoraUnix() {
  return Math.floor(Date.now() / 1000);
}

export const enviarMensagemChat = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const pedidoId = limparTexto(request.data?.pedidoId);
    const texto = limparTexto(request.data?.texto);
    const tipo = (limparTexto(request.data?.tipo) || "texto") as TipoMensagem;
    const imagemUrl = limparTexto(request.data?.imagemUrl);

    if (!pedidoId) {
      throw new HttpsError("invalid-argument", "pedidoId é obrigatório.");
    }

    if (!["texto", "imagem"].includes(tipo)) {
      throw new HttpsError("invalid-argument", "Tipo de mensagem inválido.");
    }

    if (tipo === "texto" && !texto) {
      throw new HttpsError("invalid-argument", "Texto é obrigatório.");
    }

    if (tipo === "imagem" && !imagemUrl) {
      throw new HttpsError("invalid-argument", "imagemUrl é obrigatória.");
    }

    if (tipo === "texto" && texto.length > 1000) {
      throw new HttpsError("invalid-argument", "Texto muito grande.");
    }

    const userRef = db.collection("users").doc(uid);
    const pedidoRef = db.collection("pedidos").doc(pedidoId);
    const chatRef = db.collection("chats").doc(pedidoId);
    const rateRef = db.collection("chatRateLimit").doc(uid);

    const [userSnap, pedidoSnap, rateSnap] = await Promise.all([
      userRef.get(),
      pedidoRef.get(),
      rateRef.get(),
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "Usuário não encontrado.");
    }

    if (!pedidoSnap.exists) {
      throw new HttpsError("not-found", "Pedido não encontrado.");
    }

    const user = userSnap.data() as Record<string, any>;
    const pedido = pedidoSnap.data() as Record<string, any>;
    const userTipo = String(user.tipo || "").trim().toLowerCase();

    const clienteId = String(pedido.clienteId || "");
    const profissionalId = String(pedido.profissionalId || "");
    const status = String(pedido.status || "").trim().toLowerCase();

    const participaDoPedido = uid === clienteId || uid === profissionalId;
    if (!participaDoPedido) {
      throw new HttpsError("permission-denied", "Você não participa deste pedido.");
    }

    if (["concluido", "recusado", "cancelado"].includes(status)) {
      throw new HttpsError("failed-precondition", "Esse chat não aceita novas mensagens.");
    }

    // rate limit simples
    const agora = agoraUnix();
    const rate = rateSnap.exists ? (rateSnap.data() as Record<string, any>) : {};
    const lastAt = Number(rate.lastAt || 0);
    const minuteWindowStart = Number(rate.minuteWindowStart || agora);
    const minuteCount = Number(rate.minuteCount || 0);

    if (agora - lastAt < 1) {
      throw new HttpsError("resource-exhausted", "Espere 1 segundo para enviar outra mensagem.");
    }

    let newMinuteWindowStart = minuteWindowStart
    let newMinuteCount = minuteCount

    if (agora - minuteWindowStart >= 60) {
      newMinuteWindowStart = agora
      newMinuteCount = 0
    }

    if (newMinuteCount >= 30) {
      throw new HttpsError("resource-exhausted", "Limite de mensagens por minuto atingido.");
    }

    const mensagemRef = chatRef.collection("mensagens").doc();
    const ehCliente = uid === clienteId;

    const conteudoResumo = tipo === "imagem" ? "📷 Foto" : texto;

    await db.runTransaction(async (tx) => {
      tx.set(
        mensagemRef,
        {
          texto: tipo === "texto" ? texto : "",
          tipo,
          imagemUrl: tipo === "imagem" ? imagemUrl : "",
          autorId: uid,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        chatRef,
        {
          pedidoId,
          clienteId,
          profissionalId,
          ultimoAutorId: uid,
          ultimaMensagem: conteudoResumo,
          ultimoTipo: tipo,
          atualizadoEm: serverTimestamp(),
          lidoCliente: ehCliente ? true : false,
          lidoProfissional: ehCliente ? false : true,
        },
        { merge: true }
      );

      tx.set(
        pedidoRef,
        {
          ultimaMensagem: conteudoResumo,
          ultimaMensagemAt: serverTimestamp(),
          temMensagemNovaCliente: ehCliente ? false : true,
          temMensagemNovaProfissional: ehCliente ? true : false,
        },
        { merge: true }
      );

      tx.set(
        rateRef,
        {
          lastAt: agora,
          minuteWindowStart: newMinuteWindowStart,
          minuteCount: newMinuteCount + 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        db.collection("logsChat").doc(),
        {
          pedidoId,
          autorId: uid,
          autorTipo: userTipo,
          tipo,
          resumo: conteudoResumo,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    });

    // push simples usando expoPushToken salvo no users
    try {
      const alvoId = ehCliente ? profissionalId : clienteId;
      if (alvoId) {
        const alvoSnap = await db.collection("users").doc(alvoId).get();
        const alvo = alvoSnap.exists ? (alvoSnap.data() as Record<string, any>) : null;
        const expoPushToken = String(alvo?.expoPushToken || "").trim();

        if (expoPushToken) {
          const nomeAutor =
            String(user.nome || "").trim() ||
            String(user.email || "").trim() ||
            (ehCliente ? "Cliente" : "Profissional");

          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: expoPushToken,
              title: "Nova mensagem 💬",
              body: `${nomeAutor}: ${conteudoResumo}`,
              sound: "default",
              priority: "high",
              data: {
                tela: "chat",
                pedidoId,
                tipo: "nova_mensagem",
              },
            }),
          });
        }
      }
    } catch (error) {
      console.error("Erro ao enviar push do chat:", error);
    }

    return {
      ok: true,
      mensagemId: mensagemRef.id,
      resumo: conteudoResumo,
      tipo,
    };
  }
);
