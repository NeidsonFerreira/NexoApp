import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { Redirect, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../contexts/AuthContext";

let splashPlayedThisSession = false;

const SPLASH_TIMEOUT_MS = 9000;

type DestinoFinal = "/entrada" | "/cliente-home" | "/painel-profissional" | "/admin/dashboard";

export default function IndexRoute() {
  const { user, userData, authReady, loading } = useAuth();
  const [videoTerminou, setVideoTerminou] = useState(false);
  const splashOcultaRef = useRef(false);
  const navegadoRef = useRef(false);

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
      void SplashScreen.hideAsync().catch(() => {
        // noop
      });
    });
  }

  function finalizarVideo() {
    if (videoTerminou) return;
    setVideoTerminou(true);
  }

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      finalizarVideo();
    }
  }

  useEffect(() => {
    if (splashPlayedThisSession) {
      ocultarSplashNativa();
      setVideoTerminou(true);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      finalizarVideo();
    }, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!videoTerminou) return;
    splashPlayedThisSession = true;
    if (!authReady || loading || navegadoRef.current) return;
    navegadoRef.current = true;
    router.replace(destinoFinal);
  }, [videoTerminou, authReady, loading, destinoFinal]);

  if (splashPlayedThisSession && authReady && !loading) {
    return <Redirect href={destinoFinal} />;
  }

  if (videoTerminou) {
    return null;
  }

  return (
    <View style={styles.container} onLayout={ocultarSplashNativa}>
      <StatusBar hidden />
      <Video
        source={require("../assets/videos/splash.mp4")}
        style={styles.video}
        useNativeControls={false}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        isMuted
        onLoad={ocultarSplashNativa}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />
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
    backgroundColor: "#000000",
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
