import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAppTheme } from "../contexts/ThemeContext";

type ServiceCardProps = {
  nome: string;
  emoji: string;
  descricao?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ServiceCard({
  nome,
  emoji,
  descricao = "Ver profissionais disponíveis",
  loading = false,
  disabled = false,
  onPress,
}: ServiceCardProps) {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const isDisabled = disabled || loading;
  const isDark = themeMode === "dark";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isDisabled && styles.cardDisabled,
        pressed && !isDisabled && styles.cardPressed,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={nome}
      accessibilityHint={descricao}
      android_ripple={{
        color: isDark
          ? "rgba(255,255,255,0.08)"
          : "rgba(15,23,42,0.05)",
      }}
    >
      <View style={styles.iconeBox}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>

      <View style={styles.textos}>
        <Text style={styles.nome}>{nome}</Text>
        <Text style={styles.descricao}>{descricao}</Text>
      </View>

      <View style={styles.ladoDireito}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.text} />
        ) : (
          <Text style={styles.seta}>›</Text>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: isDark ? theme.colors.border : "#D9E0EA",
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.18 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    cardDisabled: {
      opacity: 0.7,
    },

    cardPressed: {
      transform: [{ scale: 0.988 }],
    },

    iconeBox: {
      width: 52,
      height: 52,
      borderRadius: 14,
      backgroundColor: isDark ? theme.colors.background : "#F4F7FB",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },

    emoji: {
      fontSize: 24,
    },

    textos: {
      flex: 1,
    },

    nome: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      marginBottom: 4,
    },

    descricao: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },

    ladoDireito: {
      marginLeft: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    seta: {
      color: theme.colors.textMuted,
      fontSize: 28,
      fontWeight: "bold",
      lineHeight: 28,
    },
  });
}
