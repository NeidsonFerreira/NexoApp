import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";
import {
  optionalTrimmedString,
  validarCategorias,
} from "../utils/profileValidators";

export const atualizarPerfilProfissionalSeguro = onCall(
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

    const payload: Record<string, any> = {
      atualizadoEm: serverTimestamp(),
    };

    const nome = optionalTrimmedString(request.data?.nome, 120, "nome");
    const bio = optionalTrimmedString(request.data?.bio, 600, "bio");
    const telefone = optionalTrimmedString(request.data?.telefone, 40, "telefone");
    const cidade = optionalTrimmedString(request.data?.cidade, 120, "cidade");
    const endereco = optionalTrimmedString(request.data?.endereco, 200, "endereco");
    const categorias = validarCategorias(request.data?.categorias);

    if (nome !== undefined) payload.nome = nome;
    if (bio !== undefined) payload.bio = bio;
    if (telefone !== undefined) payload.telefone = telefone;
    if (cidade !== undefined) payload.cidade = cidade;
    if (endereco !== undefined) payload.endereco = endereco;
    if (categorias !== undefined) payload.categorias = categorias;

    await ref.set(payload, { merge: true });

    return { ok: true };
  }
);
