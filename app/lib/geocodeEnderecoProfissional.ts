import * as Location from "expo-location";

export type CoordenadasEndereco = {
  latitude: number;
  longitude: number;
};

function coordenadaValida(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export async function geocodeEnderecoProfissional(
  endereco?: string,
  cidade?: string
): Promise<CoordenadasEndereco | null> {
  const enderecoCompleto = `${String(endereco || "").trim()}, ${String(
    cidade || ""
  ).trim()}`.trim();

  if (!enderecoCompleto || enderecoCompleto === ",") {
    return null;
  }

  const resultado = await Location.geocodeAsync(enderecoCompleto);

  if (!resultado.length) {
    return null;
  }

  const latitude = resultado[0].latitude;
  const longitude = resultado[0].longitude;

  if (!coordenadaValida(latitude, longitude)) {
    return null;
  }

  return { latitude, longitude };
}
