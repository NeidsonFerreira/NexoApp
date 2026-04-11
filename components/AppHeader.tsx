import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../contexts/ThemeContext";

type Props = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  compact?: boolean;
  showBackButton?: boolean;
  rightComponent?: React.ReactNode;
};

export function AppHeader({
  title,
  subtitle,
  backLabel = "Voltar",
  onBack,
  compact = false,
  showBackButton = false,
  rightComponent,
}: Props) {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }

    try {
      router.back();
    } catch {}
  }

  return (
    <>
      {showBackButton && (
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            compact && styles.backButtonCompact,
            pressed && styles.backPressed,
          ]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <Text style={styles.backText}>← {backLabel}</Text>
        </Pressable>
      )}

      <View style={[styles.headerCard, compact && styles.headerCompact]}>
        {!!rightComponent && (
          <View style={styles.headerTopRow}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerRight}>{rightComponent}</View>
          </View>
        )}

        <Text style={[styles.title, compact && styles.titleCompact]}>
          {title}
        </Text>

        {!!subtitle && (
          <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
            {subtitle}
          </Text>
        )}
      </View>
    </>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    backButton: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.card,
      borderWidth: theme.borderWidth.thin,
      borderColor: isDark ? theme.colors.border : "#D9E0EA",
      borderRadius: theme.radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: theme.spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },

    backButtonCompact: {
      paddingVertical: 7,
      marginBottom: 10,
    },

    backPressed: {
      opacity: 0.9,
    },

    backText: {
      color: theme.colors.text,
      fontWeight: "700",
      fontSize: 14,
    },

    headerCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.xl,
      borderWidth: theme.borderWidth.thin,
      borderColor: isDark ? theme.colors.border : "#D9E0EA",
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.18 : 0.06,
      shadowRadius: 12,
      elevation: 3,
    },

    headerCompact: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 12,
    },

    headerTopRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },

    headerSpacer: {
      width: 36,
      height: 36,
    },

    headerRight: {
      minWidth: 36,
      minHeight: 36,
      alignItems: "flex-end",
      justifyContent: "center",
    },

    title: {
      color: theme.colors.text,
      fontSize: theme.text.title,
      fontWeight: "800",
      textAlign: "center",
    },

    titleCompact: {
      fontSize: 20,
    },

    subtitle: {
      color: theme.colors.textMuted,
      fontSize: theme.text.subtitle,
      marginTop: theme.spacing.xs,
      textAlign: "center",
      lineHeight: 20,
    },

    subtitleCompact: {
      fontSize: 13,
      marginTop: 4,
      lineHeight: 18,
    },
  });
}