import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";

export const atualizarStatusProfissionalOnline = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const online = Boolean(request.data?.online);

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const user = userSnap.data() as Record<string, any>;

    if (user.tipo !== "profissional" && user.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Usuário sem permissão.");
    }

    const perfilCompleto =
      Boolean(user.nome || user.name) &&
      Boolean(user.cidade) &&
      Boolean(user.categorias?.length || user.servicos?.length);

    if (online && !perfilCompleto) {
      throw new HttpsError(
        "failed-precondition",
        "Complete o perfil antes de ficar online."
      );
    }

    await userRef.set(
      {
        online,
        disponivel: online,
        atualizadoEm: serverTimestamp(),
        onlineAtualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, online };
  }
);
