import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { requireString } from "../utils/validators";

type RateLimitLoginRequest = {
  email?: string;
};

const LIMITE_TENTATIVAS = 5;

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export const verificarRateLimitLogin = onCall<RateLimitLoginRequest>(
  { region: REGION },
  async (request) => {
    const email = normalizarEmail(requireString(request.data?.email, "email", 160));
    const ref = db.collection("loginRateLimit").doc(email);
    const snap = await ref.get();

    if (!snap.exists) {
      return {
        ok: true,
        bloqueado: false,
        tentativasRestantes: LIMITE_TENTATIVAS,
        desbloqueiaEm: null,
      };
    }

    const data = snap.data() as Record<string, any>;
    const tentativas = Number(data.tentativas || 0);
    const bloqueadoAte = data.bloqueadoAte?.toDate?.() ?? null;
    const agora = new Date();

    if (bloqueadoAte && bloqueadoAte.getTime() > agora.getTime()) {
      return {
        ok: true,
        bloqueado: true,
        tentativasRestantes: 0,
        desbloqueiaEm: bloqueadoAte.toISOString(),
      };
    }

    return {
      ok: true,
      bloqueado: false,
      tentativasRestantes: Math.max(0, LIMITE_TENTATIVAS - tentativas),
      desbloqueiaEm: null,
    };
  }
);
