import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../config/admin";

type RequestData = {
  email?: string;
  telefone?: string;
};

function limpar(valor: unknown, max = 200) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizarTelefone(telefone: string) {
  return telefone.replace(/\D/g, "");
}

export const verificarDisponibilidadeCadastro = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const emailRaw = limpar(request.data?.email, 160);
    const telefoneRaw = limpar(request.data?.telefone, 25);

    if (!emailRaw && !telefoneRaw) {
      throw new HttpsError(
        "invalid-argument",
        "Informe email ou telefone."
      );
    }

    const email = emailRaw ? normalizarEmail(emailRaw) : "";
    const telefone = telefoneRaw
      ? normalizarTelefone(telefoneRaw)
      : "";

    let emailDisponivel = true;
    let telefoneDisponivel = true;

    // 🔍 Verifica EMAIL
    if (email) {
      const snapEmail = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (!snapEmail.empty) {
        emailDisponivel = false;
      }
    }

    // 🔍 Verifica TELEFONE
    if (telefone) {
      const snapTel = await db
        .collection("users")
        .where("telefone", "==", telefone)
        .limit(1)
        .get();

      if (!snapTel.empty) {
        telefoneDisponivel = false;
      }
    }

    return {
      ok: true,
      emailDisponivel,
      telefoneDisponivel,
    };
  }
);