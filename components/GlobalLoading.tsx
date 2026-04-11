import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAppTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
};

export function GlobalLoading({ visible }: Props) {
  const { theme } = useAppTheme();

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    zIndex: 999,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
