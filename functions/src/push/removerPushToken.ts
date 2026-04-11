import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid } from "../utils/validators";

export const removerPushToken = onCall({ region: REGION }, async (request) => {
  const uid = requireAuthUid(request.auth?.uid);

  await db.collection("users").doc(uid).set(
    {
      pushToken: null,
      pushTokenUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});
