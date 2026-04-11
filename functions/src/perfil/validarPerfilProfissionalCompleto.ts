import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { requireAuthUid } from "../utils/validators";

export const validarPerfilProfissionalCompleto = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const snap = await db.collection("users").doc(uid).get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const user = snap.data() as Record<string, any>;
    if (user.tipo !== "profissional" && user.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Usuário sem permissão.");
    }

    const faltando: string[] = [];

    if (!user.nome) faltando.push("nome");
    if (!user.cidade) faltando.push("cidade");
    if (!user.categorias?.length && !user.servicos?.length) faltando.push("categorias");
    if (!user.portfolio?.length) faltando.push("portfolio");
    if (!user.bio) faltando.push("bio");

    return {
      ok: true,
      perfilCompleto: faltando.length === 0,
      faltando,
    };
  }
);
