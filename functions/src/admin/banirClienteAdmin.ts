import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";

export const banirClienteAdmin = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const clienteId = String(request.data?.clienteId || "").trim();

  if (!uid) {
    throw new HttpsError("unauthenticated", "Não autenticado.");
  }

  if (!clienteId) {
    throw new HttpsError("invalid-argument", "Cliente inválido.");
  }

  const adminRef = db.collection("users").doc(uid);
  const clienteRef = db.collection("users").doc(clienteId);

  const [adminSnap, clienteSnap] = await Promise.all([
    adminRef.get(),
    clienteRef.get(),
  ]);

  if (!adminSnap.exists || adminSnap.data()?.tipo !== "admin") {
    throw new HttpsError("permission-denied", "Apenas admin.");
  }

  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "Cliente não encontrado.");
  }

  const cliente = clienteSnap.data() as any;

  if (cliente.tipo !== "cliente") {
    throw new HttpsError("failed-precondition", "Usuário não é cliente.");
  }

  const novoStatus = !cliente.bloqueado;

  await clienteRef.set(
    {
      bloqueado: novoStatus,
      banidoEm: novoStatus ? serverTimestamp() : null,
      atualizadoEm: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    bloqueado: novoStatus,
    mensagem: novoStatus
      ? "Cliente banido com sucesso."
      : "Cliente desbanido com sucesso.",
  };
});