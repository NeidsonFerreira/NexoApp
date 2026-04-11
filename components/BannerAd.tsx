import { memo } from "react";
import { Platform, View } from "react-native";
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from "react-native-google-mobile-ads";

// IDs reais
const ANDROID_AD_ID = "ca-app-pub-3929212574112376/6340692030";
const IOS_AD_ID = "ca-app-pub-3929212574112376/2696960496";

type Props = {
  isPremium?: boolean;
};

function BannerAdComponent({ isPremium = false }: Props) {
  if (isPremium) return null;

  const adUnitId = __DEV__
    ? TestIds.BANNER
    : Platform.OS === "ios"
    ? IOS_AD_ID
    : ANDROID_AD_ID;

  return (
    <View style={{ alignItems: "center", marginVertical: 10 }}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
      />
    </View>
  );
}

export const AdBanner = memo(BannerAdComponent);
