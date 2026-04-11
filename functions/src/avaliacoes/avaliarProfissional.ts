import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type RequestData = {
  profissionalId?: string;
  pedidoId?: string;
  nota?: number;
  comentario?: string;
  nomeProfissional?: string;
};

function limparTexto(valor: unknown) {
  return String(valor || "").trim();
}

export const avaliarProfissional = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const profissionalId = limparTexto(request.data?.profissionalId);
    const pedidoId = limparTexto(request.data?.pedidoId);
    const comentario = limparTexto(request.data?.comentario);
    const nomeProfissional =
      limparTexto(request.data?.nomeProfissional) || "Profissional";
    const nota = Number(request.data?.nota || 0);

    if (!profissionalId || !pedidoId) {
      throw new HttpsError(
        "invalid-argument",
        "profissionalId e pedidoId são obrigatórios."
      );
    }

    if (!Number.isFinite(nota) || nota < 1 || nota > 5) {
      throw new HttpsError("invalid-argument", "Nota inválida. Use 1 a 5.");
    }

    if (comentario.length > 1000) {
      throw new HttpsError("invalid-argument", "Comentário muito grande.");
    }

    const pedidoRef = db.collection("pedidos").doc(pedidoId);
    const profissionalRef = db.collection("users").doc(profissionalId);
    const avaliacoesRef = db.collection("avaliacoes");

    const [pedidoSnap, profissionalSnap] = await Promise.all([
      pedidoRef.get(),
      profissionalRef.get(),
    ]);

    if (!pedidoSnap.exists) {
      throw new HttpsError("not-found", "Pedido não encontrado.");
    }

    if (!profissionalSnap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const pedido = pedidoSnap.data() as Record<string, any>;

    if (String(pedido.clienteId || "") !== uid) {
      throw new HttpsError(
        "permission-denied",
        "Você não pode avaliar este pedido."
      );
    }

    if (String(pedido.profissionalId || "") !== profissionalId) {
      throw new HttpsError(
        "failed-precondition",
        "Este pedido não pertence a esse profissional."
      );
    }

    if (String(pedido.status || "").trim().toLowerCase() !== "concluido") {
      throw new HttpsError(
        "failed-precondition",
        "Só é possível avaliar pedidos concluídos."
      );
    }

    if (pedido.avaliado === true) {
      throw new HttpsError("already-exists", "Esse pedido já foi avaliado.");
    }

    const duplicadaSnap = await avaliacoesRef
      .where("clienteId", "==", uid)
      .where("pedidoId", "==", pedidoId)
      .limit(1)
      .get();

    if (!duplicadaSnap.empty) {
      throw new HttpsError("already-exists", "Esse pedido já foi avaliado.");
    }

    const profissional = profissionalSnap.data() as Record<string, any>;
    const mediaAtual = Number(
      profissional.mediaAvaliacoes || profissional.media || 0
    );
    const totalAtual = Number(
      profissional.totalAvaliacoes || profissional.total || 0
    );

    const novoTotal = totalAtual + 1;
    const novaMedia =
      novoTotal > 0 ? (mediaAtual * totalAtual + nota) / novoTotal : nota;

    const avaliacaoRef = avaliacoesRef.doc();

    await db.runTransaction(async (tx) => {
      tx.set(
        avaliacaoRef,
        {
          profissionalId,
          pedidoId,
          clienteId: uid,
          nomeProfissional,
          nota,
          comentario,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        pedidoRef,
        {
          avaliado: true,
          avaliadoEm: serverTimestamp(),
          notaAvaliacao: nota,
        },
        { merge: true }
      );

      tx.set(
        profissionalRef,
        {
          mediaAvaliacoes: Number(novaMedia.toFixed(2)),
          totalAvaliacoes: novoTotal,
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    });

    return {
      ok: true,
      avaliacaoId: avaliacaoRef.id,
      mediaAvaliacoes: Number(novaMedia.toFixed(2)),
      totalAvaliacoes: novoTotal,
    };
  }
);