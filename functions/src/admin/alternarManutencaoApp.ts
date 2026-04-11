import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";

export const alternarManutencaoApp = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const adminSnap = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnap.data() as Record<string, any> | undefined;

    if (!adminSnap.exists || adminData?.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Apenas admin pode alterar manutenção.");
    }

    const ativo = Boolean(request.data?.ativo);
    const aviso =
      typeof request.data?.aviso === "string"
        ? String(request.data.aviso).trim().slice(0, 300)
        : "";

    await db.collection("config").doc("app").set(
      {
        appEmManutencao: ativo,
        avisoGlobal: aviso,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: request.auth.uid,
      },
      { merge: true }
    );

    return { ok: true, ativo };
  }
);
