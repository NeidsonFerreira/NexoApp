import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requirePushToken } from "../utils/validators";

export const registrarPushToken = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const token = requirePushToken(request.data?.pushToken);

    await db.collection("users").doc(uid).set(
      {
        pushToken: token,
        pushTokenUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true };
  }
);
