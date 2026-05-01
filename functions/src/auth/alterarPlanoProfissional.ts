import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type Plano = "gratuito" | "mensal" | "turbo";

type RequestData = {
  profissionalId?: string;
  plano?: Plano;
};

function textoPlano(plano: Plano) {
  switch (plano) {
    case "mensal":
      return "MENSAL";
    case "turbo":
      return "TURBO";
    default:
      return "GRATUITO";
  }
}

export const alterarPlanoProfissional = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const { profissionalId, plano } = request.data || {};

    // 🔥 valida plano
    if (!plano || !["gratuito", "mensal", "turbo"].includes(plano)) {
      throw new HttpsError("invalid-argument", "Plano inválido.");
    }

    // 🔥 busca usuário logado
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Usuário não encontrado.");
    }

    const user = userSnap.data() as any;
    const isAdmin = user.tipo === "admin";

    // 🔥 regra principal (admin ou próprio usuário)
    const targetId = isAdmin ? profissionalId : uid;

    if (!targetId) {
      throw new HttpsError(
        "invalid-argument",
        "profissionalId é obrigatório para admin."
      );
    }

    // 🔥 busca profissional alvo
    const profRef = db.collection("users").doc(targetId);
    const profSnap = await profRef.get();

    if (!profSnap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const profissional = profSnap.data() as any;

    if (profissional.tipo !== "profissional") {
      throw new HttpsError(
        "failed-precondition",
        "Usuário não é profissional."
      );
    }

    const planoAnterior = profissional.plano || "gratuito";

    // 🔥 atualização principal
    await profRef.set(
      {
        plano,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    // 🔥 log completo (igual padrão que você já usa)
    await db.collection("logsPlanosProfissionais").add({
      profissionalId: targetId,
      profissionalNome: profissional.nome || "",
      planoAnterior,
      planoNovo: plano,
      planoNovoTexto: textoPlano(plano),
      alteradoPor: uid,
      alteradoPorTipo: user.tipo || "desconhecido",
      criadoEm: serverTimestamp(),
    });

    return {
      ok: true,
      profissionalId: targetId,
      planoAnterior,
      planoNovo: plano,
      planoNovoTexto: textoPlano(plano),
      mensagem: "Plano atualizado com sucesso.",
    };
  }
);