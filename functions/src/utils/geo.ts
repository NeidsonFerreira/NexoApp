import { HttpsError } from "firebase-functions/v2/https";

export function validarLatitudeLongitude(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpsError("invalid-argument", "Latitude/longitude inválidas.");
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpsError("invalid-argument", "Latitude/longitude fora do intervalo.");
  }

  return { latitude: lat, longitude: lng };
}
