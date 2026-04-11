import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { requireAuthUid } from "../utils/validators";

export const validarPlanoProfissional = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const user = userSnap.data() as Record<string, any>;
    if (user.tipo !== "profissional" && user.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Usuário sem permissão.");
    }

    const plano = String(user.plano || "gratuito");
    const planoAtivo = user.planoAtivo !== false;
    const expiraEm = user.planoExpiraEm ?? null;

    const podeUsarWhatsapp = plano === "mensal" || plano === "turbo";
    const podeTerDestaque = plano === "mensal" || plano === "turbo";
    const podeFicarOnline = true;
    const podeReceberMaisPedidos = true;

    return {
      ok: true,
      plano,
      ativo: planoAtivo,
      expiraEm,
      beneficios: {
        podeUsarWhatsapp,
        podeTerDestaque,
        podeFicarOnline,
        podeReceberMaisPedidos,
      },
    };
  }
);
