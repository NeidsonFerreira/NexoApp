import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { EXPO_PUSH_URL } from "../config/constants";
import { requirePushToken } from "./validators";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: "default";
  priority?: "default" | "normal" | "high";
  data?: Record<string, unknown>;
};

export async function enviarParaExpo(message: ExpoPushMessage) {
  const token = requirePushToken(message.to);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...message,
        to: token,
        sound: message.sound ?? "default",
        priority: message.priority ?? "high",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      logger.error("Erro da Expo Push API", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        data: message.data ?? null,
      });

      throw new HttpsError("internal", "Falha ao enviar push.");
    }

    return await response.json();
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("Erro inesperado ao enviar push", {
      error,
      data: message.data ?? null,
    });

    throw new HttpsError("internal", "Erro inesperado ao enviar push.");
  } finally {
    clearTimeout(timeout);
  }
}
