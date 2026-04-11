import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requirePedidoId } from "../utils/validators";

export const cancelarPedido = onCall({ region: REGION }, async (request) => {
  const uid = requireAuthUid(request.auth?.uid);
  const pedidoId = requirePedidoId(request.data?.pedidoId);
  const motivo =
    typeof request.data?.motivo === "string"
      ? String(request.data.motivo).trim().slice(0, 300)
      : "";

  const pedidoRef = db.collection("pedidos").doc(pedidoId);

  await db.runTransaction(async (tx) => {
    const pedidoSnap = await tx.get(pedidoRef);

    if (!pedidoSnap.exists) {
      throw new HttpsError("not-found", "Pedido não encontrado.");
    }

    const pedido = pedidoSnap.data() as Record<string, any>;

    const ehCliente = pedido.clienteId === uid;
    const ehProfissional = pedido.profissionalId === uid;

    if (!ehCliente && !ehProfissional) {
      throw new HttpsError("permission-denied", "Sem permissão.");
    }

    if (["concluido", "recusado", "cancelado"].includes(String(pedido.status))) {
      throw new HttpsError("failed-precondition", "Pedido não pode mais ser cancelado.");
    }

    tx.set(
      pedidoRef,
      {
        status: "cancelado",
        canceladoPor: uid,
        motivoCancelamento: motivo,
        canceladoEm: serverTimestamp(),
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
