import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";

type Avaliacao = {
  alvoId?: string;
  alvoTipo?: "cliente" | "profissional";
  nota?: number;
};

export const sincronizarResumoAvaliacoes = onDocumentWritten(
  {
    document: "avaliacoes/{avaliacaoId}",
    region: REGION,
  },
  async (event) => {
    const before = event.data?.before.exists
      ? (event.data.before.data() as Avaliacao)
      : null;
    const after = event.data?.after.exists
      ? (event.data.after.data() as Avaliacao)
      : null;

    const profissionais = new Set<string>();

    if (before?.alvoTipo === "profissional" && before.alvoId) {
      profissionais.add(before.alvoId);
    }

    if (after?.alvoTipo === "profissional" && after.alvoId) {
      profissionais.add(after.alvoId);
    }

    if (profissionais.size === 0) {
      return;
    }

    for (const profissionalId of profissionais) {
      const snap = await db
        .collection("avaliacoes")
        .where("alvoTipo", "==", "profissional")
        .where("alvoId", "==", profissionalId)
        .get();

      let total = 0;
      let soma = 0;

      snap.forEach((doc) => {
        const nota = Number(doc.data().nota || 0);
        if (nota >= 1 && nota <= 5) {
          total += 1;
          soma += nota;
        }
      });

      const media = total > 0 ? Number((soma / total).toFixed(2)) : 0;

      await db.collection("users").doc(profissionalId).set(
        {
          mediaAvaliacoes: media,
          totalAvaliacoes: total,
          resumoAvaliacoesAtualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
);
