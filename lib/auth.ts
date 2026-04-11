import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  UserCredential,
} from "firebase/auth";
import { auth } from "./firebase";
import { safeRequest } from "./firebaseService";
import { checkRateLimit } from "./rateLimit";
import { withLock } from "./lock";
import { logError, logEvent } from "./logger";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarEmail(email: string) {
  return emailRegex.test(email);
}

function validarSenha(senha: string) {
  return Boolean(senha) && senha.length >= 6;
}

let lastLoginAttempt = 0;

export async function loginComEmail(
  email: string,
  senha: string
): Promise<UserCredential> {
  await checkRateLimit("login", 5, 60000);

  const now = Date.now();
  if (now - lastLoginAttempt < 2000) {
    throw new Error("Aguarde antes de tentar novamente.");
  }
  lastLoginAttempt = now;

  const normalizedEmail = email.trim().toLowerCase();

  if (!validarEmail(normalizedEmail)) {
    throw new Error("Email inválido");
  }

  if (!senha) {
    throw new Error("Senha obrigatória");
  }

  try {
    const result = await withLock("login", () =>
      safeRequest(
        () => signInWithEmailAndPassword(auth, normalizedEmail, senha),
        {
          dedupeKey: `login:${normalizedEmail}`,
          timeoutMs: 15000,
          tentativas: 2,
          exigirInternet: true,
          priority: 10,
        }
      )
    );

    logEvent("login_success", { email: normalizedEmail }, "auth");
    return result;
  } catch (error) {
    logError(error, "auth:loginComEmail");
    throw error;
  }
}

export async function cadastrarComEmail(
  email: string,
  senha: string
): Promise<UserCredential> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!validarEmail(normalizedEmail)) {
    throw new Error("Email inválido");
  }

  if (!validarSenha(senha)) {
    throw new Error("Senha fraca");
  }

  try {
    return await safeRequest(async () => {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        senha
      );

      if (userCredential.user) {
        await sendEmailVerification(userCredential.user);
      }

      logEvent("signup_success", { email: normalizedEmail }, "auth");
      return userCredential;
    });
  } catch (error) {
    logError(error, "auth:cadastrarComEmail");
    throw error;
  }
}

export async function sairDaConta(): Promise<void> {
  if (!auth.currentUser) return;

  try {
    await signOut(auth);
    logEvent("logout_success", undefined, "auth");
  } catch (error) {
    logError(error, "auth:sairDaConta");
    throw error;
  }
}