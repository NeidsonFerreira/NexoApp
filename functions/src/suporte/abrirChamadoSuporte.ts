import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requireString } from "../utils/validators";

export const abrirChamadoSuporte = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const tipo = requireString(request.data?.tipo, "tipo", 80);
    const descricao = requireString(request.data?.descricao, "descricao", 1000);

    const pedidoId =
      typeof request.data?.pedidoId === "string"
        ? String(request.data.pedidoId).trim().slice(0, 120)
        : null;

    const ref = db.collection("suporteChamados").doc();

    await ref.set({
      userId: uid,
      tipo,
      descricao,
      pedidoId,
      status: "aberto",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    return { ok: true, chamadoId: ref.id };
  }
);
