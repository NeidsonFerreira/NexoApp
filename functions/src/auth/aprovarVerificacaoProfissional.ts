import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

export const aprovarVerificacaoProfissional = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    const adminId = request.auth?.uid;
    if (!adminId) throw new HttpsError("unauthenticated","Admin não autenticado.");

    const { userId } = request.data || {};
    if (!userId) throw new HttpsError("invalid-argument","userId obrigatório.");

    const adminSnap = await db.collection("users").doc(adminId).get();
    if (!adminSnap.exists || adminSnap.data()?.tipo !== "admin") {
      throw new HttpsError("permission-denied","Apenas admin pode aprovar.");
    }

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found","Usuário não encontrado.");
    }

    await userRef.set({
      verificacaoStatus: "aprovado",
      onboardingStatus: "aprovado",
      podeAparecerNoApp: true,
      aprovadoPor: adminId,
      aprovadoEm: serverTimestamp(),
    }, { merge: true });

    await db.collection("logsVerificacaoAdmin").add({
      acao: "aprovar",
      userId,
      adminId,
      criadoEm: serverTimestamp()
    });

    return { ok: true };
  }
);
