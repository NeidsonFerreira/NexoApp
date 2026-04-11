import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { requirePedidoId } from "../utils/validators";

export const buscarDiagnosticoPedido = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnap.data() as Record<string, any> | undefined;

    if (!adminSnap.exists || adminData?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode consultar diagnóstico.");
    }

    const pedidoId = requirePedidoId(request.data?.pedidoId);
    const pedidoSnap = await db.collection("pedidos").doc(pedidoId).get();

    if (!pedidoSnap.exists) {
      throw new HttpsError("not-found", "Pedido não encontrado.");
    }

    const pedido = pedidoSnap.data() as Record<string, any>;
    const clienteSnap = pedido.clienteId
      ? await db.collection("users").doc(String(pedido.clienteId)).get()
      : null;
    const profissionalSnap = pedido.profissionalId
      ? await db.collection("users").doc(String(pedido.profissionalId)).get()
      : null;

    return {
      ok: true,
      pedido,
      cliente: clienteSnap?.exists ? clienteSnap.data() : null,
      profissional: profissionalSnap?.exists ? profissionalSnap.data() : null,
      sinais: {
        clienteTravado: Boolean(clienteSnap?.data()?.pedidoAtivoId || clienteSnap?.data()?.emAtendimento),
        profissionalTravado: Boolean(profissionalSnap?.data()?.pedidoAtivoId || profissionalSnap?.data()?.emAtendimento),
      },
    };
  }
);
