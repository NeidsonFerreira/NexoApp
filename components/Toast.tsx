import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../contexts/ThemeContext";

type Props = {
  message: string;
};

export function Toast({ message }: Props) {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  if (!message) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    container: {
      position: "absolute",
      zIndex: 999,
      bottom: 40,
      left: 20,
      right: 20,
      backgroundColor: isDark ? "#000" : theme.colors.text,
      padding: 14,
      borderRadius: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
    text: {
      color: "#fff",
      textAlign: "center",
      fontWeight: "700",
    },
  });
}
