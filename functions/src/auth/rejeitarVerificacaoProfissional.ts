import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

export const rejeitarVerificacaoProfissional = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    const adminId = request.auth?.uid;

    if (!adminId) {
      throw new HttpsError("unauthenticated", "Admin não autenticado.");
    }

    const { userId, motivo } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId obrigatório.");
    }

    const adminSnap = await db.collection("users").doc(adminId).get();

    if (!adminSnap.exists || adminSnap.data()?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode rejeitar.");
    }

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Usuário não encontrado.");
    }

    const atual = snap.data() as Record<string, any>;
    const motivoFinal =
      typeof motivo === "string" ? motivo.trim().slice(0, 500) : "";

    await userRef.set(
      {
        verificacaoStatus: "rejeitado",
        onboardingStatus: "rejeitado",
        podeAparecerNoApp: false,

        // consistência entre telas
        verificado: false,
        documentosAprovados: false,
        documentosEnviados: true,

        motivoRejeicao: motivoFinal,
        rejeitadoPor: adminId,
        rejeitadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection("logsVerificacaoAdmin").add({
      acao: "rejeitar",
      userId,
      adminId,
      motivo: motivoFinal,
      statusAnterior: atual?.verificacaoStatus || null,
      criadoEm: serverTimestamp(),
    });

    return {
      ok: true,
      verificacaoStatus: "rejeitado",
      onboardingStatus: "rejeitado",
      podeAparecerNoApp: false,
      verificado: false,
    };
  }
);