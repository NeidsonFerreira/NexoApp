import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { requireAuthUid } from "../utils/validators";

export const podeUsarWhatsapp = onCall({ region: REGION }, async (request) => {
  const uid = requireAuthUid(request.auth?.uid);
  const snap = await db.collection("users").doc(uid).get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Usuário não encontrado.");
  }

  const user = snap.data() as Record<string, any>;
  const beneficios = user.beneficios ?? {};
  const liberado = Boolean(beneficios.whatsapp);

  return {
    ok: true,
    liberado,
    motivo: liberado ? null : "Plano atual não permite WhatsApp.",
  };
});
