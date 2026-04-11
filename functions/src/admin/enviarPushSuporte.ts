import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { REGION } from "../config/constants";
import { db } from "../config/admin";
import { enviarParaExpo } from "../utils/expoPush";
import { requireString, requireUserId } from "../utils/validators";

type EnviarPushSuporteData = {
  userId?: string;
  titulo?: string;
  corpo?: string;
};

export const enviarPushSuporte = onCall<EnviarPushSuporteData>(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const userId = requireUserId(request.data?.userId);
    const titulo = requireString(request.data?.titulo, "titulo", 120);
    const corpo = requireString(request.data?.corpo, "corpo", 500);

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();

    if (!adminSnap.exists) {
      logger.warn("Admin não encontrado para envio de push", {
        requestUid: request.auth.uid,
        userId,
      });
      throw new HttpsError("permission-denied", "Admin não encontrado.");
    }

    const adminData = adminSnap.data() as Record<string, any>;

    if (adminData?.tipo !== "admin") {
      logger.warn("Usuário sem permissão tentou enviar push", {
        requestUid: request.auth.uid,
        userId,
        tipo: adminData?.tipo ?? null,
      });
      throw new HttpsError("permission-denied", "Apenas admin pode enviar push.");
    }

    const userSnap = await db.collection("users").doc(userId).get();

    if (!userSnap.exists) {
      logger.warn("Usuário destinatário não encontrado", {
        requestUid: request.auth.uid,
        userId,
      });
      throw new HttpsError("not-found", "Usuário destinatário não encontrado.");
    }

    const pushToken = String(userSnap.data()?.pushToken || "").trim();

    const resultado = await enviarParaExpo({
      to: pushToken,
      title: titulo,
      body: corpo,
      data: {
        tipo: "suporte",
        userId,
      },
    });

    logger.info("Push de suporte enviado com sucesso", {
      requestUid: request.auth.uid,
      userId,
      resultado,
    });

    return { ok: true, resultado };
  }
);
