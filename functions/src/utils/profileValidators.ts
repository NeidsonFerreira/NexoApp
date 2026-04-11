import { HttpsError } from "firebase-functions/v2/https";

export function optionalTrimmedString(
  value: unknown,
  maxLen: number,
  field: string
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} deve ser string.`);
  }

  const clean = value.trim();
  if (!clean) return undefined;

  if (clean.length > maxLen) {
    throw new HttpsError("invalid-argument", `${field} ultrapassa ${maxLen} caracteres.`);
  }

  return clean;
}

export function validarCategorias(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "categorias deve ser um array.");
  }

  const categorias = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);

  return categorias.length ? categorias : undefined;
}

export function validarPortfolioUrls(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "portfolio deve ser um array.");
  }

  const urls = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"))
    .slice(0, 20);

  return urls.length ? urls : [];
}
