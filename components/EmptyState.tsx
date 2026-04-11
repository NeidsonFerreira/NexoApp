import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../contexts/ThemeContext";

type Props = {
  title?: string;
  message?: string;
};

export function EmptyState({
  title = "Nada por aqui",
  message = "Nenhum resultado encontrado.",
}: Props) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      marginTop: 40,
      paddingHorizontal: 20,
    },
    title: {
      fontSize: 16,
      fontWeight: "800",
      color: theme.colors.text,
      marginBottom: 6,
      textAlign: "center",
    },
    text: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
  });
}
