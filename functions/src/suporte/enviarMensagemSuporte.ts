import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type TipoMensagem = "texto" | "imagem";

type RequestData = {
  texto?: string;
  tipo?: TipoMensagem;
  imagemUrl?: string;
  origem?: string;
  categoria?: string;
  topico?: string;
};

function limparTexto(valor: unknown) {
  return String(valor || "").trim();
}

function agoraUnix() {
  return Math.floor(Date.now() / 1000);
}

export const enviarMensagemSuporte = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const texto = limparTexto(request.data?.texto);
    const tipo = (limparTexto(request.data?.tipo) || "texto") as TipoMensagem;
    const imagemUrl = limparTexto(request.data?.imagemUrl);
    const origem = limparTexto(request.data?.origem) || "geral";
    const categoria =
      limparTexto(request.data?.categoria) ||
      limparTexto(request.data?.topico) ||
      "Suporte Geral";

    if (!["texto", "imagem"].includes(tipo)) {
      throw new HttpsError("invalid-argument", "Tipo de mensagem inválido.");
    }

    if (tipo === "texto" && !texto) {
      throw new HttpsError("invalid-argument", "Texto é obrigatório.");
    }

    if (tipo === "imagem" && !imagemUrl) {
      throw new HttpsError("invalid-argument", "imagemUrl é obrigatória.");
    }

    if (texto.length > 1500) {
      throw new HttpsError("invalid-argument", "Mensagem muito grande.");
    }

    const userRef = db.collection("users").doc(uid);
    const chatRef = db.collection("suporte_chats").doc(uid);
    const rateRef = db.collection("suporte_rate_limit").doc(uid);

    const [userSnap, chatSnap, rateSnap] = await Promise.all([
      userRef.get().catch(() => null),
      chatRef.get(),
      rateRef.get(),
    ]);

    const user = userSnap && userSnap.exists ? (userSnap.data() as Record<string, any>) : null;
    const userTipo = String(user?.tipo || "cliente").trim().toLowerCase();
    const userNome =
      limparTexto(user?.nome) ||
      limparTexto(request.auth?.token?.name) ||
      limparTexto(user?.email) ||
      "Usuário";

    const isAnonimo = user ? false : true;

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

    if (newMinuteCount >= 20) {
      throw new HttpsError("resource-exhausted", "Limite de mensagens por minuto atingido.");
    }

    const resumo = tipo === "imagem" ? "Imagem enviada" : texto;
    const mensagemRef = chatRef.collection("mensagens").doc();

    await db.runTransaction(async (tx) => {
      tx.set(
        chatRef,
        {
          userId: uid,
          userNome: userNome,
          userTipo: userTipo === "profissional" ? "profissional" : "cliente",
          status: "aberto",
          atualizadoEm: serverTimestamp(),
          criadoEm: chatSnap.exists ? chatSnap.data()?.criadoEm || serverTimestamp() : serverTimestamp(),
          isAnonimo,
          origemSuporte: origem,
          categoria,
          topico: categoria,
        },
        { merge: true }
      );

      tx.set(
        mensagemRef,
        {
          texto: tipo === "texto" ? texto : "",
          imagemUrl: tipo === "imagem" ? imagemUrl : "",
          autorId: uid,
          autorTipo: userTipo === "profissional" ? "profissional" : "cliente",
          tipo,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        chatRef,
        {
          ultimaMensagem: resumo,
          atualizadoEm: serverTimestamp(),
          status: "aberto",
          categoria,
          topico: categoria,
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
        db.collection("logs_suporte").doc(),
        {
          userId: uid,
          userTipo: userTipo === "profissional" ? "profissional" : "cliente",
          userNome,
          tipo,
          resumo,
          origemSuporte: origem,
          categoria,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    });

    return {
      ok: true,
      mensagemId: mensagemRef.id,
      resumo,
      tipo,
    };
  }
);
