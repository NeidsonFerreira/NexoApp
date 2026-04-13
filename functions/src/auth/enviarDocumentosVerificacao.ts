import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../config/admin";

type RequestData = {
  documentoFrenteUrl?: string;
  documentoVersoUrl?: string;
  selfieUrl?: string;
  observacao?: string;
};

function limpar(valor: unknown, max = 1500) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function validarUrlArquivo(url: string) {
  return /^https?:\/\//i.test(url);
}

export const enviarDocumentosVerificacao = onCall<RequestData>(
  { region: "southamerica-east1" },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const userRef = db.collection("users").doc(uid);
    const logRef = db.collection("logsVerificacaoProfissional").doc();
    const snap = await userRef.get();

    if (!snap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Conta profissional não encontrada."
      );
    }

    const atual = snap.data() as Record<string, any>;
    const tipoAtual = String(atual.tipo || "").trim().toLowerCase();

    if (tipoAtual !== "profissional") {
      throw new HttpsError(
        "permission-denied",
        "Esta conta não é profissional."
      );
    }

    if (atual.bloqueado === true) {
      throw new HttpsError(
        "permission-denied",
        "Conta bloqueada. Não é possível enviar documentos."
      );
    }

    if (atual.perfilCompleto !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Conclua o cadastro profissional antes de enviar documentos."
      );
    }

    const documentoFrenteUrl = limpar(request.data?.documentoFrenteUrl, 1500);
    const documentoVersoUrl = limpar(request.data?.documentoVersoUrl, 1500);
    const selfieUrl = limpar(request.data?.selfieUrl, 1500);
    const observacao = limpar(request.data?.observacao, 400);

    if (!documentoFrenteUrl || !validarUrlArquivo(documentoFrenteUrl)) {
      throw new HttpsError("invalid-argument", "Documento frente inválido.");
    }

    if (!selfieUrl || !validarUrlArquivo(selfieUrl)) {
      throw new HttpsError("invalid-argument", "Selfie inválida.");
    }

    if (documentoVersoUrl && !validarUrlArquivo(documentoVersoUrl)) {
      throw new HttpsError("invalid-argument", "Documento verso inválido.");
    }

    const atualDocs = atual.documentosVerificacao || {};

    const documentosMudaram =
      atualDocs.documentoFrenteUrl !== documentoFrenteUrl ||
      (atualDocs.documentoVersoUrl || "") !== (documentoVersoUrl || "") ||
      atualDocs.selfieUrl !== selfieUrl;

    const payload: Record<string, any> = {
      documentosVerificacao: {
        documentoFrenteUrl,
        documentoVersoUrl: documentoVersoUrl || "",
        selfieUrl,
        observacao,
        enviadoEm: serverTimestamp(),
      },
      documentosEnviados: true,
      atualizadoEm: serverTimestamp(),

      // compatibilidade com telas antigas/admin antigo
      documentoFrenteUrl,
      documentoVersoUrl: documentoVersoUrl || "",
      selfieUrl,
    };

    if (documentosMudaram) {
      payload.verificacaoStatus = "pendente";
      payload.onboardingStatus = "em_analise";
      payload.podeAparecerNoApp = false;
    }

    await userRef.set(payload, { merge: true });

    await logRef.set({
      userId: uid,
      etapa: "enviarDocumentosVerificacao",
      sucesso: true,
      possuiVerso: !!documentoVersoUrl,
      documentosMudaram,
      criadoEm: serverTimestamp(),
    });

    return {
      ok: true,
      verificacaoStatus: documentosMudaram
        ? "pendente"
        : atual.verificacaoStatus || "pendente",
      onboardingStatus: documentosMudaram
        ? "em_analise"
        : atual.onboardingStatus || null,
    };
  }
);