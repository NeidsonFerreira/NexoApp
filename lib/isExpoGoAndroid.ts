import Constants from "expo-constants";
import { Platform } from "react-native";

export function isExpoGoAndroid(): boolean {
  return Constants.appOwnership === "expo" && Platform.OS === "android";
}
