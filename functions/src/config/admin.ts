import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export { admin };
export const db = admin.firestore();
export const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
