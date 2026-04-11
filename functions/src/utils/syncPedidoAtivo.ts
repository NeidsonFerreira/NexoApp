import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/admin";

type SyncPedidoAtivoParams = {
  clienteId?: string | null;
  profissionalId?: string | null;
  pedidoId?: string | null;
  ativo: boolean;
};

export async function syncPedidoAtivo({
  clienteId,
  profissionalId,
  pedidoId,
  ativo,
}: SyncPedidoAtivoParams) {
  const tasks: Promise<any>[] = [];

  if (clienteId) {
    tasks.push(
      db.collection("users").doc(clienteId).set(
        {
          pedidoAtivoId: ativo ? pedidoId || null : null,
          emAtendimento: ativo,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  if (profissionalId) {
    tasks.push(
      db.collection("users").doc(profissionalId).set(
        {
          pedidoAtivoId: ativo ? pedidoId || null : null,
          emAtendimento: ativo,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  await Promise.all(tasks);
}
