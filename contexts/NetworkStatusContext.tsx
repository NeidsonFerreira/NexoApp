import NetInfo from "@react-native-community/netinfo";
import type { ReactNode } from "react";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type NetworkStatusContextType = {
  isConnected: boolean;
  isInternetReachable: boolean;
  offline: boolean;
};

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(null);

type NetworkStatusProviderProps = {
  children: ReactNode;
};

export function NetworkStatusProvider({
  children,
}: NetworkStatusProviderProps) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(state.isInternetReachable !== false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<NetworkStatusContextType>(
    () => ({
      isConnected,
      isInternetReachable,
      offline: !isConnected || !isInternetReachable,
    }),
    [isConnected, isInternetReachable]
  );

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusContextType {
  const context = useContext(NetworkStatusContext);

  if (!context) {
    throw new Error(
      "useNetworkStatus deve ser usado dentro de NetworkStatusProvider"
    );
  }

  return context;
}
