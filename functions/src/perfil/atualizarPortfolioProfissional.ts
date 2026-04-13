import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";
import { validarPortfolioUrls } from "../utils/profileValidators";

export const atualizarPortfolioProfissional = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const user = snap.data() as Record<string, any>;
    if (user.tipo !== "profissional" && user.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Usuário sem permissão.");
    }

    const recebeuCampoPortfolio = Object.prototype.hasOwnProperty.call(
      request.data ?? {},
      "portfolio"
    );

    const portfolioValidado = validarPortfolioUrls(request.data?.portfolio);

    if (!recebeuCampoPortfolio) {
      throw new HttpsError(
        "invalid-argument",
        "Campo portfolio não enviado."
      );
    }

    if (!Array.isArray(request.data?.portfolio)) {
      throw new HttpsError(
        "invalid-argument",
        "Portfolio deve ser um array."
      );
    }

    if (portfolioValidado === undefined) {
      throw new HttpsError(
        "invalid-argument",
        "Portfolio inválido."
      );
    }

    await ref.set(
      {
        portfolio: portfolioValidado,
        portfolioAtualizadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, total: portfolioValidado.length };
  }
);