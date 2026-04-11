import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireString, requireUserId } from "../utils/validators";

export const sincronizarPermissoesPlano = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnap.data() as Record<string, any> | undefined;

    if (!adminSnap.exists || adminData?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode sincronizar plano.");
    }

    const userId = requireUserId(request.data?.userId);
    const plano = requireString(request.data?.plano, "plano", 40);
    const expiraEm =
      typeof request.data?.expiraEm === "string"
        ? String(request.data.expiraEm).trim()
        : null;

    const beneficios = {
      whatsapp: plano === "mensal" || plano === "turbo",
      destaque: plano === "mensal" || plano === "turbo",
      turbo: plano === "turbo",
    };

    await db.collection("users").doc(userId).set(
      {
        plano,
        planoAtivo: true,
        planoExpiraEm: expiraEm,
        beneficios,
        planoAtualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, beneficios };
  }
);
