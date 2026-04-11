import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { enviarParaExpo } from "../utils/expoPush";
import {
  requireAuthUid,
  requirePedidoId,
  requireStatus,
  requireUserId,
  requireString,
} from "../utils/validators";

export const notificarStatusPedidoProfissional = onCall(
  { region: REGION },
  async (request) => {
    requireAuthUid(request.auth?.uid);

    const clienteId = requireUserId(request.data?.clienteId, "clienteId");
    const status = requireStatus(request.data?.status);
    const pedidoId = requirePedidoId(request.data?.pedidoId);
    const nomeProfissional =
      typeof request.data?.nomeProfissional === "string"
        ? requireString(request.data.nomeProfissional, "nomeProfissional", 120)
        : "Profissional";

    const clienteSnap = await db.collection("users").doc(clienteId).get();
    if (!clienteSnap.exists) {
      return { ok: true, enviado: false };
    }

    const pushToken = String(clienteSnap.data()?.pushToken || "").trim();
    if (!pushToken) {
      return { ok: true, enviado: false };
    }

    let title = "Atualização do pedido";
    let body = `${nomeProfissional} atualizou seu pedido.`;
    let tela = "pedidos";

    if (status === "aceito") {
      title = "Pedido aceito ✅";
      body = `${nomeProfissional} aceitou seu pedido.`;
    } else if (status === "a_caminho") {
      title = "Profissional a caminho 🚗";
      body = `${nomeProfissional} está indo até você.`;
      tela = "mapa";
    } else if (status === "chegou") {
      title = "Profissional chegou 📍";
      body = `${nomeProfissional} chegou ao local.`;
      tela = "mapa";
    } else if (status === "concluido") {
      title = "Pedido concluído 🏁";
      body = `${nomeProfissional} concluiu o atendimento.`;
    } else if (status === "recusado") {
      title = "Pedido recusado ❌";
      body = `${nomeProfissional} recusou o atendimento.`;
    }

    const resultado = await enviarParaExpo({
      to: pushToken,
      title,
      body,
      data: { tela, pedidoId, tipo: status },
    });

    return { ok: true, enviado: true, resultado };
  }
);
