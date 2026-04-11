import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type RequestData = {
  profissionalId?: string;
};

function dataHojeUTC() {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(agora.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export const liberarWhatsappDiario = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const profissionalId = String(request.data?.profissionalId || "").trim();
    if (!profissionalId) {
      throw new HttpsError("invalid-argument", "profissionalId é obrigatório.");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "Usuário não encontrado.");
    }

    const userData = userSnap.data() as Record<string, any>;
    const tipo = String(userData.tipo || "").trim().toLowerCase();
    const planoCliente = String(userData.planoCliente || "gratuito").trim().toLowerCase();

    if (tipo !== "cliente") {
      throw new HttpsError("permission-denied", "Apenas clientes podem usar essa liberação.");
    }

    if (userData.bloqueado === true) {
      throw new HttpsError("permission-denied", "Conta bloqueada.");
    }

    // Cliente premium não precisa da liberação
    if (planoCliente === "premium") {
      return {
        ok: true,
        liberado: true,
        premium: true,
        data: dataHojeUTC(),
      };
    }

    const hoje = dataHojeUTC();
    const liberacaoId = `${uid}_${hoje}`;
    const liberacaoRef = db.collection("whatsappLiberacoesDiarias").doc(liberacaoId);
    const liberacaoSnap = await liberacaoRef.get();

    if (liberacaoSnap.exists) {
      const data = liberacaoSnap.data() as Record<string, any>;
      return {
        ok: true,
        liberado: false,
        premium: false,
        motivo: "limite_diario_atingido",
        data: hoje,
        profissionalIdJaUsado: String(data.profissionalId || ""),
      };
    }

    await liberacaoRef.set({
      userId: uid,
      profissionalId,
      data: hoje,
      criadoEm: serverTimestamp(),
    });

    await db.collection("logsWhatsappLiberacao").add({
      userId: uid,
      profissionalId,
      data: hoje,
      acao: "liberacao_diaria_consumida",
      criadoEm: serverTimestamp(),
    });

    return {
      ok: true,
      liberado: true,
      premium: false,
      data: hoje,
    };
  }
);
