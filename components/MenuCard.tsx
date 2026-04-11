import { ReactNode, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Animated,
  Pressable,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAppTheme } from "../contexts/ThemeContext";

type BorderVariant =
  | "default"
  | "primary"
  | "warning"
  | "danger"
  | "success";

type Props = {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badgeText?: string;
  borderVariant?: BorderVariant;
  onPress?: () => void;
  disabled?: boolean;
};

export function MenuCard({
  title,
  subtitle,
  icon,
  badgeText,
  borderVariant = "default",
  onPress,
  disabled = false,
}: Props) {
  const { theme, themeMode } = useAppTheme();
  const styles = createStyles(theme, themeMode);

  const scale = useRef(new Animated.Value(1)).current;
  const isDark = themeMode === "dark";

  const onPressIn = () => {
    if (disabled) return;

    Animated.spring(scale, {
      toValue: 0.985,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();

    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.selectionAsync();
    }
  };

  const onPressOut = () => {
    if (disabled) return;

    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const borderColor =
    borderVariant === "primary"
      ? isDark
        ? theme.colors.primary
        : "#BFD4FF"
      : borderVariant === "warning"
      ? isDark
        ? theme.colors.warning
        : "#F3D08B"
      : borderVariant === "danger"
      ? isDark
        ? theme.colors.danger
        : "#F1B7B7"
      : borderVariant === "success"
      ? isDark
        ? theme.colors.success
        : "#BFE8CF"
      : isDark
      ? theme.colors.border
      : "#D9E0EA";

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        android_ripple={{
          color: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.05)",
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.card,
          { borderColor },
          disabled && styles.cardDisabled,
          pressed && Platform.OS === "ios" && styles.cardPressed,
        ]}
      >
        <View style={styles.icon}>{icon}</View>

        <Text style={styles.title}>{title}</Text>

        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        {!!badgeText && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function createStyles(theme: any, themeMode: "dark" | "light") {
  const isDark = themeMode === "dark";

  return StyleSheet.create({
    wrapper: {
      marginBottom: 14,
    },

    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: isDark ? theme.borderWidth.strong : 1.5,
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: "center",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.18 : 0.06,
      shadowRadius: 10,
      elevation: 3,
    },

    cardDisabled: {
      opacity: 0.65,
    },

    cardPressed: {
      opacity: 0.94,
    },

    icon: {
      marginBottom: 8,
      opacity: isDark ? 1 : 0.9,
    },

    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },

    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 5,
      textAlign: "center",
      lineHeight: 18,
    },

    badge: {
      position: "absolute",
      top: 10,
      right: 10,
      backgroundColor: isDark ? theme.colors.primary : "#2F6BFF",
      borderRadius: theme.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(47,107,255,0.18)",
    },

    badgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "800",
    },
  });
}
