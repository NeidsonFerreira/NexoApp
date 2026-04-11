import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

export const rejeitarVerificacaoProfissional = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    const adminId = request.auth?.uid;
    if (!adminId) throw new HttpsError("unauthenticated","Admin não autenticado.");

    const { userId, motivo } = request.data || {};
    if (!userId) throw new HttpsError("invalid-argument","userId obrigatório.");

    const adminSnap = await db.collection("users").doc(adminId).get();
    if (!adminSnap.exists || adminSnap.data()?.tipo !== "admin") {
      throw new HttpsError("permission-denied","Apenas admin pode rejeitar.");
    }

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found","Usuário não encontrado.");
    }

    await userRef.set({
      verificacaoStatus: "rejeitado",
      onboardingStatus: "rejeitado",
      podeAparecerNoApp: false,
      motivoRejeicao: motivo || "",
      rejeitadoPor: adminId,
      rejeitadoEm: serverTimestamp(),
    }, { merge: true });

    await db.collection("logsVerificacaoAdmin").add({
      acao: "rejeitar",
      userId,
      adminId,
      motivo: motivo || "",
      criadoEm: serverTimestamp()
    });

    return { ok: true };
  }
);
