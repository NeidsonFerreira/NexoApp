import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type RequestData = {
  tipo?: "cliente" | "profissional";
  nome?: string;
  telefone?: string;
  email?: string;
};

function limpar(valor: unknown, max = 200) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

function validarTelefone(telefone: string) {
  const nums = telefone.replace(/\D/g, "");
  return nums.length >= 10 && nums.length <= 11;
}

export const finalizarCadastroInicial = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const tipo = limpar(request.data?.tipo, 30).toLowerCase();
    const nome = limpar(request.data?.nome, 120);
    const telefone = limpar(request.data?.telefone, 25);
    const email = normalizarEmail(limpar(request.data?.email, 160));

    // 🔒 validações fortes
    if (tipo !== "cliente" && tipo !== "profissional") {
      throw new HttpsError("invalid-argument", "Tipo inválido.");
    }

    if (!nome || nome.length < 3) {
      throw new HttpsError("invalid-argument", "Nome inválido.");
    }

    if (!email || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "Email inválido.");
    }

    if (!validarTelefone(telefone)) {
      throw new HttpsError("invalid-argument", "Telefone inválido.");
    }

    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    const base = {
      nome,
      telefone,
      email,
      tipo,
      bloqueado: false,
      atualizadoEm: serverTimestamp(),
    };

    // 🆕 CRIAÇÃO
    if (!snap.exists) {
      const doc =
        tipo === "cliente"
          ? {
              ...base,
              planoCliente: "gratuito",
              emailVerificado: false,
              pedidoAtivoId: null,
              emAtendimento: false,
              criadoEm: serverTimestamp(),
            }
          : {
              ...base,
              plano: "gratuito",
              planoAtivo: true,
              online: false,
              perfilCompleto: false,
              verificacaoStatus: "nao_enviado",
              documentosEnviados: false,
              motivoRejeicao: "",
              emailVerificado: false,
              pedidoAtivoId: null,
              emAtendimento: false,
              criadoEm: serverTimestamp(),
            };

      await ref.set(doc, { merge: true });

      return { ok: true, criado: true };
    }

    // 🔁 UPDATE (seguro)
    const atual = snap.data() as any;
    const tipoAtual = String(atual.tipo || "").toLowerCase();

    if (tipoAtual && tipoAtual !== tipo) {
      throw new HttpsError(
        "permission-denied",
        "Conta já vinculada a outro tipo."
      );
    }

    await ref.set(base, { merge: true });

    return { ok: true, criado: false };
  }
);