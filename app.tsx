import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Constants from "expo-constants";
import mobileAds from "react-native-google-mobile-ads";

export default function App() {
  useEffect(() => {
    // Pega as chaves do app.json
    const adsConfig = Constants.expoConfig?.extra?.googleMobileAds;
    const mapsApiKey = Constants.expoConfig?.extra?.googleMapsApiKey;

    // Inicializa Google Ads
    if (adsConfig) {
      mobileAds()
        .initialize()
        .then(() => {
          console.log("Google Mobile Ads inicializado");
        });
    }

    // Só para testar se a chave do Maps está vindo
    console.log("Google Maps API Key:", mapsApiKey);
  }, []);

  return (
    <View>
      <Text>App Nexo rodando!</Text>
    </View>
  );
}
