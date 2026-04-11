import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";

export const atualizarConfigAdmin = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnap.data() as Record<string, any> | undefined;

    if (!adminSnap.exists || adminData?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode atualizar config.");
    }

    const payload: Record<string, any> = {
      atualizadoEm: serverTimestamp(),
      atualizadoPor: request.auth.uid,
    };

    if (request.data?.precoPlanoMensal != null) {
      payload.precoPlanoMensal = Number(request.data.precoPlanoMensal);
    }

    if (request.data?.precoPlanoTurbo != null) {
      payload.precoPlanoTurbo = Number(request.data.precoPlanoTurbo);
    }

    if (typeof request.data?.avisoGlobal === "string") {
      payload.avisoGlobal = String(request.data.avisoGlobal).trim().slice(0, 300);
    }

    await db.collection("config").doc("app").set(payload, { merge: true });

    return { ok: true };
  }
);
