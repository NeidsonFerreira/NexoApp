export type Coordenadas = {
  latitude: number;
  longitude: number;
};

export function coordenadaValida(
  latitude?: number | null,
  longitude?: number | null
) {
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

export function calcularDistanciaKm(origem: Coordenadas, destino: Coordenadas) {
  const toRad = (value: number) => (value * Math.PI) / 180;

  const R = 6371;
  const dLat = toRad(destino.latitude - origem.latitude);
  const dLon = toRad(destino.longitude - origem.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origem.latitude)) *
      Math.cos(toRad(destino.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function deveRecalcularRota(params: {
  ultimaRecalculoEm: number;
  cooldownMs?: number;
  distanciaDaRotaMetros?: number;
  distanciaMinimaMetros?: number;
}) {
  const cooldownMs = params.cooldownMs ?? 12000;
  const distanciaMinimaMetros = params.distanciaMinimaMetros ?? 40;

  const passouCooldown = Date.now() - params.ultimaRecalculoEm >= cooldownMs;
  const saiuDaRota =
    (params.distanciaDaRotaMetros || 0) >= distanciaMinimaMetros;

  return passouCooldown && saiuDaRota;
}
