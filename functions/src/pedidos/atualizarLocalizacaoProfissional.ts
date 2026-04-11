import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";
import { validarLatitudeLongitude } from "../utils/geo";

export const atualizarLocalizacaoProfissional = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const { latitude, longitude } = validarLatitudeLongitude(
      request.data?.latitude,
      request.data?.longitude
    );

    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const user = snap.data() as Record<string, any>;
    if (user.tipo !== "profissional" && user.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Usuário sem permissão.");
    }

    await ref.set(
      {
        latitude,
        longitude,
        localizacaoAtualizadaEm: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true };
  }
);
