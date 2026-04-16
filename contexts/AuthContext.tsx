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
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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

  const limparAuthState = useCallback(() => {
    if (!mountedRef.current) return;
    setUser(null);
    setUserData(null);
  }, []);

  const carregarUserData = useCallback(async (userId: string) => {
    try {
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
        setUserData(null);
        return;
      }

      setUserData({
        id: userId,
        ...snap.data(),
      } as UserData);
    } catch (error) {
      if (!mountedRef.current) return;
      logError(error, "AuthContext.carregarUserData");
      handleError(error, "AuthContext.carregarUserData");
      setUserData(null);
    }
  }, []);

  const recarregarUserData = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      if (!mountedRef.current) return;
      setUserData(null);
      return;
    }

    await carregarUserData(currentUser.uid);
  }, [carregarUserData]);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = onAuthStateChanged(auth, async (usuario) => {
      const seq = ++authChangeSeqRef.current;

      if (!mountedRef.current) return;

      setLoading(true);
      setUser(usuario);

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
        await carregarUserData(usuario.uid);

        if (!mountedRef.current) return;
        if (authChangeSeqRef.current !== seq) return;
        if (lastUserIdRef.current !== usuario.uid) return;

        /**
         * 🔥 PUSH NOTIFICATION GLOBAL (AQUI ESTÁ O CORAÇÃO)
         */
        try {
          const token = await registrarPushNotificationsAsync();

          if (token && token !== lastPushTokenRef.current) {
            lastPushTokenRef.current = token;
          }
        } catch (pushError) {
          logError(pushError, "AuthContext.pushToken");
        }

        logEvent(
          "auth_signed_in",
          { uid: usuario.uid, email: usuario.email ?? null },
          "AuthContext"
        );
      } catch (error) {
        if (!mountedRef.current) return;
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
  }, [carregarUserData]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      userData,
      loading,
      authReady,
      recarregarUserData,
      limparAuthState,
    }),
    [user, userData, loading, authReady, recarregarUserData, limparAuthState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }

  return context;
}