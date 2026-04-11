import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireString } from "../utils/validators";

type RegistrarFalhaLoginRequest = {
  email?: string;
  motivo?: string;
  origem?: string;
};

const LIMITE_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 10;

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export const registrarFalhaLogin = onCall<RegistrarFalhaLoginRequest>(
  { region: REGION },
  async (request) => {
    const email = normalizarEmail(requireString(request.data?.email, "email", 160));
    const motivo =
      typeof request.data?.motivo === "string"
        ? String(request.data.motivo).trim().slice(0, 200)
        : "falha_login";
    const origem =
      typeof request.data?.origem === "string"
        ? String(request.data.origem).trim().slice(0, 80)
        : "app";

    const ref = db.collection("loginRateLimit").doc(email);

    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const agora = new Date();

      let tentativas = 1;
      let bloqueadoAte = null;

      if (snap.exists) {
        const data = snap.data() as Record<string, any>;
        const bloqueadoAtual = data.bloqueadoAte?.toDate?.() ?? null;

        if (bloqueadoAtual && bloqueadoAtual.getTime() > agora.getTime()) {
          bloqueadoAte = bloqueadoAtual;
          tentativas = Number(data.tentativas || LIMITE_TENTATIVAS);
        } else {
          tentativas = Number(data.tentativas || 0) + 1;
        }
      }

      if (!bloqueadoAte && tentativas >= LIMITE_TENTATIVAS) {
        bloqueadoAte = new Date(agora.getTime() + BLOQUEIO_MINUTOS * 60 * 1000);
      }

      tx.set(
        ref,
        {
          email,
          tentativas,
          ultimaFalhaEm: serverTimestamp(),
          bloqueadoAte: bloqueadoAte ?? null,
          ultimoMotivo: motivo,
          ultimaOrigem: origem,
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      const logRef = db.collection("logsLogin").doc();
      tx.set(logRef, {
        email,
        sucesso: false,
        motivo,
        origem,
        criadoEm: serverTimestamp(),
      });

      return {
        bloqueado: Boolean(bloqueadoAte),
        tentativas,
        desbloqueiaEm: bloqueadoAte ? bloqueadoAte.toISOString() : null,
      };
    });

    return {
      ok: true,
      ...resultado,
    };
  }
);
