import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requirePedidoId } from "../utils/validators";
import { validarTransicaoStatus } from "../utils/pedidoStatus";

export const recusarPedido = onCall({ region: REGION }, async (request) => {
  const uid = requireAuthUid(request.auth?.uid);
  const pedidoId = requirePedidoId(request.data?.pedidoId);

  const pedidoRef = db.collection("pedidos").doc(pedidoId);

  await db.runTransaction(async (tx) => {
    const pedidoSnap = await tx.get(pedidoRef);

    if (!pedidoSnap.exists) {
      throw new HttpsError("not-found", "Pedido não existe.");
    }

    const pedido = pedidoSnap.data() as Record<string, any>;

    if (pedido.profissionalId !== uid) {
      throw new HttpsError("permission-denied", "Não é seu pedido.");
    }

    validarTransicaoStatus(pedido.status, "recusado");

    tx.set(
      pedidoRef,
      {
        status: "recusado",
        recusadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    if (pedido.clienteId) {
      tx.set(
        db.collection("users").doc(String(pedido.clienteId)),
        {
          pedidoAtivoId: null,
          emAtendimento: false,
        },
        { merge: true }
      );
    }

    if (pedido.profissionalId) {
      tx.set(
        db.collection("users").doc(String(pedido.profissionalId)),
        {
          pedidoAtivoId: null,
          emAtendimento: false,
        },
        { merge: true }
      );
    }
  });

  return { ok: true };
});
