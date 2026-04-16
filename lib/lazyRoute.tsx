import { ComponentType, lazy, Suspense } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

type ScreenProps = Record<string, unknown>;

/**
 * Carrega a tela só quando a rota é aberta (code-splitting no Metro).
 * Use nas rotas que não fazem parte do primeiro paint (ajuda, configurações, mapa, etc.).
 */
export function lazyRoute(
  factory: () => Promise<{ default: ComponentType<ScreenProps> }>
) {
  const Lazy = lazy(factory);

  return function LazyScreenRoute(props: ScreenProps) {
    return (
      <Suspense
        fallback={
          <View style={styles.fallback}>
            <ActivityIndicator size="large" />
          </View>
        }
      >
        <Lazy {...props} />
      </Suspense>
    );
  };
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
