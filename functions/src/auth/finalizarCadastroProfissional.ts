import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { db, serverTimestamp } from "../config/admin";

type TipoAtendimento = "fixo" | "movel";

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

// 🔐 NOVO PADRÃO (SEM functions.config)
const GOOGLE_MAPS_KEY = defineString("GOOGLE_MAPS_KEY");

// 🔧 HELPERS
function limpar(valor: unknown, max = 500) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function validarListaServicos(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((i) => typeof i === "string")
    .map((i) => i.trim())
    .filter(Boolean);
}

function validarListaUrls(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((i) => typeof i === "string")
    .map((i) => i.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function validarLatLng(lat?: number | null, lng?: number | null) {
  return (
    (lat == null || (lat >= -90 && lat <= 90)) &&
    (lng == null || (lng >= -180 && lng <= 180))
  );
}

// 🌍 GOOGLE GEOCODING
async function geocodeEndereco(endereco: string) {
  const API_KEY = GOOGLE_MAPS_KEY.value();

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    endereco
  )}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.length) {
    throw new HttpsError("invalid-argument", "Endereço inválido.");
  }

  const loc = data.results[0].geometry.location;

  return {
    lat: loc.lat,
    lng: loc.lng,
  };
}

// 🚀 FUNCTION
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
      throw new HttpsError("failed-precondition", "Usuário não encontrado.");
    }

    const atual = snap.data() as any;

    if (atual.tipo !== "profissional") {
      throw new HttpsError("permission-denied", "Conta não é profissional.");
    }

    if (atual.bloqueado === true) {
      throw new HttpsError("permission-denied", "Conta bloqueada.");
    }

    // 📦 DADOS
    const nome = limpar(request.data?.nome, 120);
    const descricao = limpar(request.data?.descricao, 1000);
    const servicos = validarListaServicos(request.data?.servicos);
    const tipoAtendimento = limpar(
      request.data?.tipoAtendimento,
      20
    ).toLowerCase() as TipoAtendimento;

    const endereco = limpar(request.data?.endereco, 200);
    const cidade = limpar(request.data?.cidade, 120);

    let latitude =
      typeof request.data?.latitude === "number"
        ? request.data.latitude
        : null;

    let longitude =
      typeof request.data?.longitude === "number"
        ? request.data.longitude
        : null;

    const fotoPerfil = limpar(request.data?.fotoPerfil, 2000);
    const portfolio = validarListaUrls(request.data?.portfolio);

    // 🔒 VALIDAÇÕES
    if (!nome || nome.length < 3) {
      throw new HttpsError("invalid-argument", "Nome inválido.");
    }

    if (!descricao || descricao.length < 10) {
      throw new HttpsError("invalid-argument", "Descrição inválida.");
    }

    if (servicos.length === 0) {
      throw new HttpsError("invalid-argument", "Selecione serviços.");
    }

    if (tipoAtendimento !== "fixo" && tipoAtendimento !== "movel") {
      throw new HttpsError("invalid-argument", "Tipo inválido.");
    }

    if (tipoAtendimento === "fixo" && !endereco) {
      throw new HttpsError("invalid-argument", "Endereço obrigatório.");
    }

    if (!cidade) {
      throw new HttpsError("invalid-argument", "Cidade obrigatória.");
    }

    if (!validarLatLng(latitude, longitude)) {
      throw new HttpsError("invalid-argument", "Lat/Lng inválido.");
    }

    // 🌍 GEOCODING AUTOMÁTICO
    if (tipoAtendimento === "fixo") {
      try {
        const coords = await geocodeEndereco(`${endereco}, ${cidade}`);
        latitude = coords.lat;
        longitude = coords.lng;
      } catch (error) {
        throw new HttpsError(
          "invalid-argument",
          "Não foi possível localizar o endereço."
        );
      }
    }

    // 🚀 SALVAR
    const payload: any = {
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

    if (fotoPerfil) payload.fotoPerfil = fotoPerfil;
    if (portfolio.length) payload.portfolio = portfolio;

    await userRef.set(payload, { merge: true });

    return {
      ok: true,
      perfilCompleto: true,
    };
  }
);