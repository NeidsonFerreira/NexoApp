import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { enviarParaExpo } from "../utils/expoPush";
import { requireAuthUid, requirePedidoId, requireStatus } from "../utils/validators";

export const notificarStatusClientePedido = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const pedidoId = requirePedidoId(request.data?.pedidoId);
    const tipo = requireStatus(request.data?.tipo);

    if (tipo !== "cliente_a_caminho" && tipo !== "cliente_chegou") {
      throw new HttpsError("invalid-argument", "tipo inválido.");
    }

    const pedidoSnap = await db.collection("pedidos").doc(pedidoId).get();

    if (!pedidoSnap.exists) {
      throw new HttpsError("not-found", "Pedido não encontrado.");
    }

    const pedido = pedidoSnap.data() as Record<string, any>;

    if (pedido.clienteId !== uid) {
      throw new HttpsError("permission-denied", "Pedido não pertence ao cliente.");
    }

    const profissionalId = String(pedido.profissionalId || "").trim();
    if (!profissionalId) {
      return { ok: true, enviado: false };
    }

    const profissionalSnap = await db.collection("users").doc(profissionalId).get();
    if (!profissionalSnap.exists) {
      return { ok: true, enviado: false };
    }

    const pushToken = String(profissionalSnap.data()?.pushToken || "").trim();
    if (!pushToken) {
      return { ok: true, enviado: false };
    }

    const title =
      tipo === "cliente_a_caminho" ? "Cliente a caminho 🚶" : "Cliente chegou 📍";

    const body =
      tipo === "cliente_a_caminho"
        ? `${pedido.nomeCliente || "Cliente"} está indo até você.`
        : `${pedido.nomeCliente || "Cliente"} chegou ao local.`;

    const resultado = await enviarParaExpo({
      to: pushToken,
      title,
      body,
      data: { tela: "pedidos-profissional", pedidoId, tipo },
    });

    return { ok: true, enviado: true, resultado };
  }
);
