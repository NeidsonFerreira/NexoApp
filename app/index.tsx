import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";

const SPLASH_TIMEOUT_MS = 7000;

export default function SplashIndex() {
  const { user, authReady, loading } = useAuth();

  const [erroVideo, setErroVideo] = useState(false);
  const navegouRef = useRef(false);

  const player = useVideoPlayer(
    require("../assets/videos/splash.mp4"),
    (videoPlayer) => {
      videoPlayer.loop = false;

      const endSubscription = videoPlayer.addListener("playToEnd", () => {
        if (navegouRef.current) return;
        navegouRef.current = true;
        router.replace("/entrada");
      });

      const statusSubscription = videoPlayer.addListener(
        "statusChange",
        ({ status, error }) => {
          if (status === "error" || error) {
            setErroVideo(true);

            if (navegouRef.current) return;
            navegouRef.current = true;
            router.replace("/entrada");
          }
        }
      );

      videoPlayer.play();

      return () => {
        endSubscription.remove();
        statusSubscription.remove();
      };
    }
  );

  useEffect(() => {
    // Se já existe sessão pronta, não mostra splash de vídeo de novo.
    if (authReady && !loading && user && !navegouRef.current) {
      navegouRef.current = true;
      router.replace("/entrada");
      return;
    }

    const fallback = setTimeout(() => {
      if (navegouRef.current) return;
      navegouRef.current = true;
      router.replace("/entrada");
    }, SPLASH_TIMEOUT_MS);

    return () => {
      clearTimeout(fallback);
    };
  }, [authReady, loading, user]);

  if (authReady && !loading && user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.text}>Entrando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {erroVideo ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.text}>Carregando...</Text>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          surfaceType="textureView"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#081a2f",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#081a2f",
  },
  text: {
    marginTop: 10,
    color: "#fff",
  },
});
