import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type TipoAtendimento = "fixo" | "domicilio" | "ambos";

type RequestData = {
  nome?: string;
  descricao?: string;
  servicos?: string[];
  tipoAtendimento?: TipoAtendimento;
  endereco?: string;
  cidade?: string;
  latitude?: number | null;
  longitude?: number | null;
  fotoPerfil?: string;
  portfolio?: string[];
};

function limpar(valor: unknown, max = 500) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function validarListaServicos(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function validarListaUrls(valor: unknown, maxItems = 3) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function validarLatLng(lat?: number | null, lng?: number | null) {
  const latOk =
    lat == null || (typeof lat === "number" && lat >= -90 && lat <= 90);
  const lngOk =
    lng == null || (typeof lng === "number" && lng >= -180 && lng <= 180);

  return latOk && lngOk;
}

export const finalizarCadastroProfissional = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Conta base do profissional não encontrada."
      );
    }

    const atual = snap.data() as Record<string, any>;
    const tipoAtual = String(atual.tipo || "").trim().toLowerCase();

    if (tipoAtual !== "profissional") {
      throw new HttpsError(
        "permission-denied",
        "Esta conta não é profissional."
      );
    }

    if (atual.bloqueado === true) {
      throw new HttpsError(
        "permission-denied",
        "Conta bloqueada. Não é possível concluir o cadastro."
      );
    }

    const nome = limpar(request.data?.nome, 120);
    const descricao = limpar(request.data?.descricao, 1000);
    const servicos = validarListaServicos(request.data?.servicos);
    const tipoAtendimento = limpar(
      request.data?.tipoAtendimento,
      30
    ).toLowerCase() as TipoAtendimento;
    const endereco = limpar(request.data?.endereco, 200);
    const cidade = limpar(request.data?.cidade, 120);
    const latitude =
      typeof request.data?.latitude === "number" ? request.data.latitude : null;
    const longitude =
      typeof request.data?.longitude === "number"
        ? request.data.longitude
        : null;

    const fotoPerfil = limpar(request.data?.fotoPerfil, 2000);
    const portfolio = validarListaUrls(request.data?.portfolio, 3);

    if (!nome || nome.length < 3) {
      throw new HttpsError("invalid-argument", "Nome inválido.");
    }

    if (!descricao || descricao.length < 10) {
      throw new HttpsError("invalid-argument", "Descrição muito curta.");
    }

    if (servicos.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Informe pelo menos um serviço."
      );
    }

    if (
      tipoAtendimento !== "fixo" &&
      tipoAtendimento !== "domicilio" &&
      tipoAtendimento !== "ambos"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Tipo de atendimento inválido."
      );
    }

    if ((tipoAtendimento === "fixo" || tipoAtendimento === "ambos") && !endereco) {
      throw new HttpsError(
        "invalid-argument",
        "Endereço é obrigatório para atendimento fixo."
      );
    }

    if (!cidade) {
      throw new HttpsError("invalid-argument", "Cidade é obrigatória.");
    }

    if (!validarLatLng(latitude, longitude)) {
      throw new HttpsError(
        "invalid-argument",
        "Latitude ou longitude inválida."
      );
    }

    const payload: Record<string, any> = {
      nome,
      descricao,
      servicos,
      tipoAtendimento,
      endereco,
      cidade,
      latitude,
      longitude,
      perfilCompleto: true,
      atualizadoEm: serverTimestamp(),
    };

    if (fotoPerfil) {
      payload.fotoPerfil = fotoPerfil;
    }

    if (portfolio.length > 0) {
      payload.portfolio = portfolio;
    }

    await userRef.set(payload, { merge: true });

    return {
      ok: true,
      perfilCompleto: true,
    };
  }
);