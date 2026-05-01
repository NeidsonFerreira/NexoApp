import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useAuth } from "../contexts/AuthContext";

let splashPlayedThisSession = false;

const SPLASH_TIMEOUT_MS = 9000;

type DestinoFinal =
  | "/entrada"
  | "/cliente-home"
  | "/painel-profissional"
  | "/admin/dashboard";

export default function IndexRoute() {
  const { user, userData, authReady, loading } = useAuth();

  const [videoTerminou, setVideoTerminou] = useState(false);

  const navegadoRef = useRef(false);
  const splashOcultaRef = useRef(false);

  const destinoFinal = useMemo<DestinoFinal>(() => {
    if (!user) return "/entrada";

    const tipo = String(userData?.tipo || "").toLowerCase();

    if (tipo === "admin") return "/admin/dashboard";
    if (tipo === "profissional") return "/painel-profissional";

    return "/cliente-home";
  }, [user, userData?.tipo]);

  function ocultarSplashNativa() {
    if (splashOcultaRef.current) return;

    splashOcultaRef.current = true;

    requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
  }

  function finalizarVideo() {
    setVideoTerminou(true);
  }

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;

    if (status.didJustFinish) {
      finalizarVideo();
    }
  }

  // fallback caso vídeo trave
  useEffect(() => {
    const timeout = setTimeout(() => {
      finalizarVideo();
    }, SPLASH_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, []);

  // navegação única (REGRA PRINCIPAL)
  useEffect(() => {
    if (!videoTerminou) return;
    if (!authReady || loading) return;
    if (navegadoRef.current) return;

    navegadoRef.current = true;
    splashPlayedThisSession = true;

    requestAnimationFrame(() => {
      router.replace(destinoFinal);
    });
  }, [videoTerminou, authReady, loading, destinoFinal]);

  return (
    <View style={styles.container} onLayout={ocultarSplashNativa}>
      <StatusBar hidden />

      {!videoTerminou && (
        <Video
          source={require("../assets/videos/splash.mp4")}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping={false}
          isMuted
          onLoad={ocultarSplashNativa}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      )}

      {(!authReady || loading) && (
        <View style={styles.overlayLoading}>
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  overlayLoading: {
    position: "absolute",
    bottom: 36,
    alignSelf: "center",
  },
});