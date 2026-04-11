export function deveSeguirCamera(params: {
  mapaPronto: boolean;
  seguindoCamera: boolean;
  usuarioMoveuMapa: boolean;
}) {
  return (
    params.mapaPronto &&
    params.seguindoCamera &&
    !params.usuarioMoveuMapa
  );
}

export function getDuracaoCameraSuave(distanciaKm?: number | null) {
  if (!distanciaKm || !Number.isFinite(distanciaKm)) return 1100;
  if (distanciaKm < 0.5) return 900;
  if (distanciaKm < 2) return 1100;
  return 1300;
}
