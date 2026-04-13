import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";
import {
  optionalTrimmedString,
  validarCategorias,
} from "../utils/profileValidators";

type Coordenadas = {
  latitude: number;
  longitude: number;
};

function coordenadaValida(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function buscarCoordenadasEndereco(enderecoCompleto: string): Promise<Coordenadas | null> {
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY || "";

  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GOOGLE_MAPS_GEOCODING_API_KEY não configurada."
    );
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=` +
    `${encodeURIComponent(enderecoCompleto)}` +
    `&language=pt-BR&region=br&key=${apiKey}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const rawText = await response.text();

  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new HttpsError(
      "internal",
      `Resposta inválida do Geocoding: ${rawText.slice(0, 180)}`
    );
  }

  if (!response.ok) {
    throw new HttpsError(
      "internal",
      data?.error_message || data?.status || "Falha ao consultar geocoding."
    );
  }

  if (
    data?.status !== "OK" ||
    !Array.isArray(data.results) ||
    data.results.length === 0
  ) {
    return null;
  }

  const location = data.results[0]?.geometry?.location;

  if (!coordenadaValida(location?.lat, location?.lng)) {
    return null;
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
  };
}

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

    const tipoAtendimentoRaw =
      typeof request.data?.tipoAtendimento === "string"
        ? String(request.data.tipoAtendimento).trim().toLowerCase()
        : undefined;

    const tipoAtendimento =
      tipoAtendimentoRaw === "fixo" || tipoAtendimentoRaw === "movel"
        ? tipoAtendimentoRaw
        : undefined;

    if (nome !== undefined) payload.nome = nome;
    if (bio !== undefined) payload.bio = bio;
    if (telefone !== undefined) payload.telefone = telefone;
    if (cidade !== undefined) payload.cidade = cidade;
    if (endereco !== undefined) payload.endereco = endereco;
    if (categorias !== undefined) payload.categorias = categorias;
    if (tipoAtendimento !== undefined) payload.tipoAtendimento = tipoAtendimento;

    const tipoFinal = tipoAtendimento ?? String(user.tipoAtendimento || "").toLowerCase();
    const cidadeFinal =
      cidade !== undefined ? cidade : String(user.cidade || "").trim();
    const enderecoFinal =
      endereco !== undefined ? endereco : String(user.endereco || "").trim();

    if (tipoFinal === "fixo") {
      if (!enderecoFinal || !cidadeFinal) {
        throw new HttpsError(
          "invalid-argument",
          "Profissional fixo precisa informar endereço e cidade."
        );
      }

      const coords = await buscarCoordenadasEndereco(
        `${enderecoFinal}, ${cidadeFinal}`
      );

      if (!coords) {
        throw new HttpsError(
          "failed-precondition",
          "Não foi possível localizar o endereço informado."
        );
      }

      payload.latitude = coords.latitude;
      payload.longitude = coords.longitude;
    }

    if (tipoFinal === "movel") {
      payload.endereco = "";
      payload.latitude = null;
      payload.longitude = null;
    }

    await ref.set(payload, { merge: true });

    return { ok: true };
  }
);