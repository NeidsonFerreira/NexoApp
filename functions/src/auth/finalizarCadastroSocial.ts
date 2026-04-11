import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requireString } from "../utils/validators";

export const finalizarCadastroSocial = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const tipo = requireString(request.data?.tipo, "tipo", 40);
    const nome = requireString(request.data?.nome, "nome", 120);

    if (tipo !== "cliente" && tipo !== "profissional") {
      throw new HttpsError("invalid-argument", "tipo inválido.");
    }

    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    const atual = snap.exists ? (snap.data() as Record<string, any>) : {};

    await ref.set(
      {
        nome,
        tipo,
        email: request.auth?.token?.email ?? atual.email ?? null,
        fotoURL: request.auth?.token?.picture ?? atual.fotoURL ?? null,
        providerId: request.auth?.token?.firebase?.sign_in_provider ?? null,
        criadoEm: atual.criadoEm ?? serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, tipo };
  }
);
