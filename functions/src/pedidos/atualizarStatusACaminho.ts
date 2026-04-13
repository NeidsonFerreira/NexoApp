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

    const pedidoRef = db.collection("pedidos").doc(pedidoId);
    const profissionalRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const [pedidoSnap, profissionalSnap] = await Promise.all([
        tx.get(pedidoRef),
        tx.get(profissionalRef),
      ]);

      if (!pedidoSnap.exists) {
        throw new HttpsError("not-found", "Pedido não encontrado.");
      }

      if (!profissionalSnap.exists) {
        throw new HttpsError("not-found", "Profissional não encontrado.");
      }

      const pedido = pedidoSnap.data() as Record<string, any>;
      const profissional = profissionalSnap.data() as Record<string, any>;

      if (pedido.profissionalId !== uid) {
        throw new HttpsError("permission-denied", "Sem permissão.");
      }

      if (profissional.tipo !== "profissional" && profissional.tipo !== "admin") {
        throw new HttpsError("permission-denied", "Usuário sem permissão.");
      }

      validarTransicaoStatus(pedido.status, "a_caminho");

      tx.set(
        pedidoRef,
        {
          status: "a_caminho",
          atualizadoEm: serverTimestamp(),

          latitudeProfissional:
            typeof profissional.latitude === "number"
              ? profissional.latitude
              : null,
          longitudeProfissional:
            typeof profissional.longitude === "number"
              ? profissional.longitude
              : null,
        },
        { merge: true }
      );

      tx.set(
        profissionalRef,
        {
          emRota: true,
          pedidoAtivoId: pedidoId,
          emAtendimento: true,
        },
        { merge: true }
      );
    });

    return { ok: true };
  }
);