import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from "react-native";
import { useAppTheme } from "../contexts/ThemeContext";

type ActionButtonProps = {
  onPress: () => void;
  title?: string;
  text?: string;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "purple"
    | "neutral";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function ActionButton({
  onPress,
  title,
  text,
  label,
  disabled = false,
  loading = false,
  variant = "primary",
  fullWidth = true,
  style,
  textStyle,
  testID,
}: ActionButtonProps) {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);
  const buttonStyles = createVariantStyles(theme, themeMode);

  const buttonLabel = label || title || text || "Continuar";
  const isDisabled = disabled || loading;
  const isNeutral = variant == "neutral";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={buttonLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={{
        color:
          themeMode === "dark"
            ? "rgba(255,255,255,0.08)"
            : "rgba(15,23,42,0.06)",
      }}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        buttonStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isNeutral ? theme.colors.text : "#fff"}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            isNeutral && styles.neutralLabel,
            textStyle,
          ]}
        >
          {buttonLabel}
        </Text>
      )}
    </Pressable>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    base: {
      minHeight: 52,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.06,
      shadowRadius: 8,
      elevation: 2,
    },

    fullWidth: {
      width: "100%",
    },

    label: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
    },

    neutralLabel: {
      color: theme.colors.text,
    },

    disabled: {
      opacity: 0.55,
    },

    pressed: {
      transform: [{ scale: 0.985 }],
    },
  });
}

function createVariantStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    primary: {
      backgroundColor: theme.colors.primary,
    },

    secondary: {
      backgroundColor: theme.colors.secondary,
    },

    success: {
      backgroundColor: theme.colors.success,
    },

    warning: {
      backgroundColor: theme.colors.warning,
    },

    danger: {
      backgroundColor: theme.colors.danger,
    },

    purple: {
      backgroundColor: theme.colors.purple,
    },

    neutral: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: isDark ? theme.colors.border : "#D9E0EA",
    },
  });
}
