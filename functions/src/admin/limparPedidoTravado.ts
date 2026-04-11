import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireUserId, requireString } from "../utils/validators";

export const limparPedidoTravado = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnap.data() as Record<string, any> | undefined;

    if (!adminSnap.exists || adminData?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode limpar travas.");
    }

    const pedidoId =
      typeof request.data?.pedidoId === "string"
        ? String(request.data.pedidoId).trim()
        : "";
    const clienteId =
      typeof request.data?.clienteId === "string"
        ? requireUserId(request.data.clienteId, "clienteId")
        : "";
    const profissionalId =
      typeof request.data?.profissionalId === "string"
        ? requireUserId(request.data.profissionalId, "profissionalId")
        : "";
    const observacao =
      typeof request.data?.observacao === "string"
        ? requireString(request.data.observacao, "observacao", 300)
        : "Limpeza manual de trava";

    const batch = db.batch();

    if (pedidoId) {
      batch.set(
        db.collection("pedidos").doc(pedidoId),
        {
          status: "corrigido_admin",
          atualizadoEm: serverTimestamp(),
          observacaoAdmin: observacao,
        },
        { merge: true }
      );
    }

    if (clienteId) {
      batch.set(
        db.collection("users").doc(clienteId),
        { pedidoAtivoId: null, emAtendimento: false, atualizadoEm: serverTimestamp() },
        { merge: true }
      );
    }

    if (profissionalId) {
      batch.set(
        db.collection("users").doc(profissionalId),
        { pedidoAtivoId: null, emAtendimento: false, atualizadoEm: serverTimestamp() },
        { merge: true }
      );
    }

    await batch.commit();

    return { ok: true };
  }
);
