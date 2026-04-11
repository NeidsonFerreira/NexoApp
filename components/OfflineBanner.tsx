import { StyleSheet, Text, View } from "react-native";
import { useNetworkStatus } from "../contexts/NetworkStatusContext";
import { useAppTheme } from "../contexts/ThemeContext";

export function OfflineBanner() {
  const { offline } = useNetworkStatus();
  const { theme } = useAppTheme();

  if (!offline) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.warning }]}>
      <Text style={styles.text}>Sem internet. Algumas ações podem falhar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  text: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
  },
});
