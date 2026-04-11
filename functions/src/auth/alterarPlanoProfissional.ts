import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type Plano = "gratuito" | "mensal" | "turbo";

type RequestData = {
  profissionalId?: string;
  plano?: Plano;
};

function textoPlano(plano: Plano) {
  if (plano === "mensal") return "MENSAL";
  if (plano === "turbo") return "TURBO";
  return "GRATUITO";
}

export const alterarPlanoProfissional = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const adminId = request.auth?.uid;
    if (!adminId) {
      throw new HttpsError("unauthenticated", "Admin não autenticado.");
    }

    const profissionalId = String(request.data?.profissionalId || "").trim();
    const plano = String(request.data?.plano || "").trim().toLowerCase() as Plano;

    if (!profissionalId) {
      throw new HttpsError("invalid-argument", "profissionalId é obrigatório.");
    }

    if (!["gratuito", "mensal", "turbo"].includes(plano)) {
      throw new HttpsError("invalid-argument", "Plano inválido.");
    }

    const adminRef = db.collection("users").doc(adminId);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists || adminSnap.data()?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode alterar planos.");
    }

    const profissionalRef = db.collection("users").doc(profissionalId);
    const profissionalSnap = await profissionalRef.get();

    if (!profissionalSnap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const profissional = profissionalSnap.data() as Record<string, any>;
    if (String(profissional.tipo || "").trim().toLowerCase() !== "profissional") {
      throw new HttpsError("failed-precondition", "O usuário informado não é profissional.");
    }

    const planoAnterior = String(profissional.plano || "gratuito").trim().toLowerCase();

    await profissionalRef.set(
      {
        plano,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection("logsPlanosProfissionais").add({
      profissionalId,
      profissionalNome: String(profissional.nome || ""),
      planoAnterior,
      planoNovo: plano,
      adminId,
      adminNome: String(adminSnap.data()?.nome || ""),
      criadoEm: serverTimestamp(),
    });

    return {
      ok: true,
      profissionalId,
      planoAnterior,
      planoNovo: plano,
      planoNovoTexto: textoPlano(plano),
    };
  }
);
