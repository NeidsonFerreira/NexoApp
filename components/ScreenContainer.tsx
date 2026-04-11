import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../contexts/ThemeContext";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  withKeyboardAvoiding?: boolean;
};

export function ScreenContainer({
  children,
  scroll = true,
  withKeyboardAvoiding = true,
}: Props) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.noScrollContent}>{children}</View>
  );

  const wrappedContent = withKeyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {wrappedContent}
    </SafeAreaView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    keyboard: {
      flex: 1,
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.md,
      paddingTop: 12,
      paddingBottom: 40,
      backgroundColor: theme.colors.background,
    },

    noScrollContent: {
      flex: 1,
      paddingHorizontal: theme.spacing.md,
      paddingTop: 12,
      backgroundColor: theme.colors.background,
    },
  });
}
