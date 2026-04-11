import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requirePedidoId } from "../utils/validators";
import { validarTransicaoStatus } from "../utils/pedidoStatus";

export const atualizarStatusACaminho = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const pedidoId = requirePedidoId(request.data?.pedidoId);

    const ref = db.collection("pedidos").doc(pedidoId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        throw new HttpsError("not-found", "Pedido não encontrado.");
      }

      const pedido = snap.data() as Record<string, any>;

      if (pedido.profissionalId !== uid) {
        throw new HttpsError("permission-denied", "Sem permissão.");
      }

      validarTransicaoStatus(pedido.status, "a_caminho");

      tx.set(
        ref,
        {
          status: "a_caminho",
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    });

    return { ok: true };
  }
);
