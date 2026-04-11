import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requirePedidoId, requireStatus } from "../utils/validators";

export const reabrirOuCorrigirPedidoAdmin = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnap.data() as Record<string, any> | undefined;

    if (!adminSnap.exists || adminData?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode corrigir pedido.");
    }

    const pedidoId = requirePedidoId(request.data?.pedidoId);
    const status = requireStatus(request.data?.status);
    const observacao =
      typeof request.data?.observacao === "string"
        ? String(request.data.observacao).trim().slice(0, 300)
        : "";

    await db.collection("pedidos").doc(pedidoId).set(
      {
        status,
        atualizadoEm: serverTimestamp(),
        observacaoAdmin: observacao,
      },
      { merge: true }
    );

    return { ok: true };
  }
);
