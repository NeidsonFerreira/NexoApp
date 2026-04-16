import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";
import {
  optionalTrimmedString,
  validarServicos, // vamos usar pra validar SERVIÇOS
} from "../utils/profileValidators";
import { GeoPoint } from "firebase-admin/firestore";

const GOOGLE_MAPS_KEY = defineSecret("GOOGLE_MAPS_KEY");

type Coordenadas = {
  latitude: number;
  longitude: number;
};

function coordenadaValida(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function buscarCoordenadasEndereco(
  enderecoCompleto: string,
  apiKey: string
): Promise<Coordenadas | null> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=` +
    `${encodeURIComponent(enderecoCompleto)}` +
    `&language=pt-BR&region=br&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new HttpsError(
      "internal",
      data?.error_message || "Erro no geocoding."
    );
  }

  if (data.status !== "OK" || !data.results?.length) {
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
  {
    region: REGION,
    secrets: [GOOGLE_MAPS_KEY],
  },
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

    // 🔹 CAMPOS
    const nome = optionalTrimmedString(request.data?.nome, 120, "nome");
    const bio = optionalTrimmedString(request.data?.bio, 600, "bio");
    const telefone = optionalTrimmedString(request.data?.telefone, 40, "telefone");
    const cidade = optionalTrimmedString(request.data?.cidade, 120, "cidade");
    const endereco = optionalTrimmedString(request.data?.endereco, 200, "endereco");

    // 🔥 AQUI AGORA É SERVIÇOS (CORRIGIDO)
    const servicos = validarServicos(request.data?.servicos);

    const tipoAtendimentoRaw =
      typeof request.data?.tipoAtendimento === "string"
        ? request.data.tipoAtendimento.toLowerCase().trim()
        : undefined;

    const tipoAtendimento =
      tipoAtendimentoRaw === "fixo" || tipoAtendimentoRaw === "movel"
        ? tipoAtendimentoRaw
        : undefined;

    // 🔹 SET PAYLOAD
    if (nome !== undefined) payload.nome = nome;
    if (bio !== undefined) payload.bio = bio;
    if (telefone !== undefined) payload.telefone = telefone;
    if (cidade !== undefined) payload.cidade = cidade;
    if (endereco !== undefined) payload.endereco = endereco;

    if (servicos && servicos.length > 0) {
      payload.servicos = servicos;
    }

    if (tipoAtendimento !== undefined) {
      payload.tipoAtendimento = tipoAtendimento;
    }

    // 🔹 VALORES FINAIS
    const tipoFinal =
      tipoAtendimento ?? String(user.tipoAtendimento || "").toLowerCase();

    const cidadeFinal =
      cidade !== undefined ? cidade : String(user.cidade || "").trim();

    const enderecoFinal =
      endereco !== undefined ? endereco : String(user.endereco || "").trim();

    const enderecoMudou =
      endereco !== undefined || cidade !== undefined;

    // 🔥 GEOCODING INTELIGENTE
    if (tipoFinal === "fixo" && enderecoMudou) {
      if (!enderecoFinal || !cidadeFinal) {
        throw new HttpsError(
          "invalid-argument",
          "Profissional fixo precisa informar endereço e cidade."
        );
      }

      const apiKey = GOOGLE_MAPS_KEY.value();

      const coords = await buscarCoordenadasEndereco(
        `${enderecoFinal}, ${cidadeFinal}`,
        apiKey
      );

      if (!coords) {
        throw new HttpsError(
          "failed-precondition",
          "Não foi possível localizar o endereço informado."
        );
      }

      payload.latitude = coords.latitude;
      payload.longitude = coords.longitude;

      // 🔥 PARA MAPA
      payload.localizacao = new GeoPoint(
        coords.latitude,
        coords.longitude
      );
    }

    // 🔹 SE FOR MÓVEL LIMPA
    if (tipoFinal === "movel") {
      payload.endereco = "";
      payload.latitude = null;
      payload.longitude = null;
      payload.localizacao = null;
    }

    await ref.set(payload, { merge: true });

    return { ok: true };
  }
);