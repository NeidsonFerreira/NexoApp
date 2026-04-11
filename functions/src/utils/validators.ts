import { HttpsError } from "firebase-functions/v2/https";

export type PedidoStatus =
  | "pendente"
  | "aceito"
  | "a_caminho"
  | "chegou"
  | "concluido"
  | "recusado"
  | "cliente_a_caminho"
  | "cliente_chegou";

export function requireAuthUid(uid?: string): string {
  const value = String(uid || "").trim();
  if (!value) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  return value;
}

export function requireString(
  value: unknown,
  field: string,
  maxLen = 200
): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} deve ser string.`);
  }

  const clean = value.trim();

  if (!clean) {
    throw new HttpsError("invalid-argument", `${field} é obrigatório.`);
  }

  if (clean.length > maxLen) {
    throw new HttpsError(
      "invalid-argument",
      `${field} ultrapassa ${maxLen} caracteres.`
    );
  }

  return clean;
}

export function requirePedidoId(value: unknown): string {
  return requireString(value, "pedidoId", 120);
}

export function requireUserId(value: unknown, field = "userId"): string {
  return requireString(value, field, 120);
}

export function requireStatus(value: unknown): PedidoStatus {
  const clean = requireString(value, "status", 40) as PedidoStatus;

  const allowed: PedidoStatus[] = [
    "pendente",
    "aceito",
    "a_caminho",
    "chegou",
    "concluido",
    "recusado",
    "cliente_a_caminho",
    "cliente_chegou",
  ];

  if (!allowed.includes(clean)) {
    throw new HttpsError("invalid-argument", "status inválido.");
  }

  return clean;
}

export function requirePushToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "failed-precondition",
      "Usuário sem pushToken cadastrado."
    );
  }

  const clean = value.trim();

  if (
    !clean.startsWith("ExponentPushToken[") &&
    !clean.startsWith("ExpoPushToken[")
  ) {
    throw new HttpsError("invalid-argument", "pushToken inválido.");
  }

  return clean;
}
