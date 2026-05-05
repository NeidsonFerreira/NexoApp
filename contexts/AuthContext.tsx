import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";
import { safeRequest } from "../lib/firebaseService";
import { logError, logEvent } from "../lib/logger";
import { registrarPushNotificationsAsync } from "../lib/notifications";

type UserTipo = "cliente" | "profissional" | "admin" | string;

export type UserData = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  foto?: string;
  tipo?: UserTipo;
  pushToken?: string | null;
  plano?: string;
  planoCliente?: string;
  planoAtivo?: boolean;
  beneficios?: Record<string, unknown>;
  verificacaoStatus?: string;
  bloqueado?: boolean;
  [key: string]: unknown;
};

type AuthContextType = {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  authReady: boolean;
  recarregarUserData: () => Promise<void>;
  limparAuthState: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const mountedRef = useRef(true);
  const authChangeSeqRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const lastPushTokenRef = useRef<string | null>(null);

  // 🔥 LIMPAR STATE
  const limparAuthState = useCallback(() => {
    if (!mountedRef.current) return;

    setUser(null);
    setUserData(null);
  }, []);

  // 🔥 CARREGAR USER DATA
  const carregarUserData = useCallback(async (userId: string, isAnonymous: boolean) => {
    try {
      if (!auth.currentUser || auth.currentUser.uid !== userId) {
        if (mountedRef.current) setUserData(null);
        return;
      }

      // Se for anônimo, removemos a permissão e forçamos o valor padrão ou nulo
      if (isAnonymous) {
        if (mountedRef.current) {
          setUserData(null);
        }
        return;
      }

      const snap = await safeRequest(
        () => getDoc(doc(db, "users", userId)),
        {
          timeoutMs: 12000,
          tentativas: 2,
          exigirInternet: true,
          dedupeKey: `auth:userData:${userId}`,
          priority: 10,
        }
      );

      if (!mountedRef.current) return;

      if (!snap.exists()) {
        setUserData({
          id: userId,
          tipo: "cliente", // fallback seguro
        });
        return;
      }

      setUserData({
        id: userId,
        ...snap.data(),
      } as UserData);
    } catch (error) {
      if (!mountedRef.current) return;

      logError(error, "AuthContext.carregarUserData");
      handleError("AuthContext.carregarUserData");

      setUserData({
        id: userId,
        tipo: "cliente",
      });
    }
  }, []);

  // 🔥 RECARREGAR USER DATA
  const recarregarUserData = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      if (!mountedRef.current) return;
      setUserData(null);
      return;
    }

    // Se o usuário for anônimo, não carregamos dados do banco
    if (currentUser.isAnonymous) {
      setUserData(null);
      return;
    }

    await carregarUserData(currentUser.uid, currentUser.isAnonymous);
  }, [carregarUserData]);

  // 🔥 AUTH LISTENER PRINCIPAL
  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = onAuthStateChanged(auth, async (usuario) => {
      const seq = ++authChangeSeqRef.current;

      if (!mountedRef.current) return;

      // 🔴 SE FOR ANÔNIMO, IGNORAMOS A SESSÃO E DESLOGAMOS IMEDIATAMENTE
      if (usuario?.isAnonymous) {
        await signOut(auth);
        
        setUser(null);
        setUserData(null);
        setLoading(false);
        setAuthReady(true);
        logEvent("auth_anonymous_rejected", undefined, "AuthContext");
        return;
      }

      setUser(usuario);

      if (!authReady) {
        setLoading(true);
      }

      // 🔴 LOGOUT
      if (!usuario) {
        lastUserIdRef.current = null;

        setUserData(null);
        setLoading(false);
        setAuthReady(true);

        logEvent("auth_signed_out", undefined, "AuthContext");
        return;
      }

      lastUserIdRef.current = usuario.uid;

      try {
        await carregarUserData(usuario.uid, usuario.isAnonymous);

        if (!mountedRef.current) return;
        if (authChangeSeqRef.current !== seq) return;

        // 🔥 TENTA REGISTRAR OU CRIAR TOKEN DE TESTE EM DEV
        if (!usuario.isAnonymous && typeof registrarPushNotificationsAsync === "function") {
          registrarPushNotificationsAsync()
            .then(async (token) => {
              const actualToken = token || "ExponentPushToken[TESTE_DESENVOLVIMENTO_PARA_TESTES]";

              if (actualToken !== lastPushTokenRef.current) {
                lastPushTokenRef.current = actualToken;

                await setDoc(
                  doc(db, "users", usuario.uid),
                  {
                    pushToken: actualToken,
                    pushTokenUpdatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                );
                console.log("✅ Token salvo no Firestore:", actualToken);
              }
            })
            .catch((err) => {
              logError(err, "AuthContext.pushToken");
            });
        }

        logEvent(
          "auth_signed_in",
          { uid: usuario.uid, email: usuario.email ?? null },
          "AuthContext"
        );
      } catch (error) {
        logError(error, "AuthContext.onAuthStateChanged");
      } finally {
        if (!mountedRef.current) return;
        if (authChangeSeqRef.current !== seq) return;

        setLoading(false);
        setAuthReady(true);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [carregarUserData, authReady]);

  // 🔥 MEMO FINAL
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      userData,
      loading,
      authReady,
      recarregarUserData,
      limparAuthState,
    }),
    [
      user,
      userData,
      loading,
      authReady,
      recarregarUserData,
      limparAuthState,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// 🔥 HOOK
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }

  return context;
}