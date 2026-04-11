import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireString, requireAuthUid } from "../utils/validators";

type RegistrarSucessoLoginRequest = {
  email?: string;
  origem?: string;
};

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export const registrarSucessoLogin = onCall<RegistrarSucessoLoginRequest>(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const email = normalizarEmail(requireString(request.data?.email, "email", 160));
    const origem =
      typeof request.data?.origem === "string"
        ? String(request.data.origem).trim().slice(0, 80)
        : "app";

    const rateRef = db.collection("loginRateLimit").doc(email);
    const userRef = db.collection("users").doc(uid);

    const batch = db.batch();

    batch.set(
      rateRef,
      {
        tentativas: 0,
        bloqueadoAte: null,
        ultimoSucessoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      userRef,
      {
        ultimoLoginEm: serverTimestamp(),
        ultimaOrigemLogin: origem,
      },
      { merge: true }
    );

    const logRef = db.collection("logsLogin").doc();
    batch.set(logRef, {
      userId: uid,
      email,
      sucesso: true,
      origem,
      criadoEm: serverTimestamp(),
    });

    await batch.commit();

    return { ok: true };
  }
);
