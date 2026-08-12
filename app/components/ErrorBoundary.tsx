import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, font, shadow } from "@/lib/theme";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time crashes. Without it a single thrown error blanks the
 * whole app with no message and no way back.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen}>
        <View style={styles.icon}>
          <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
        </View>
        <Text style={styles.title}>Quelque chose s'est mal passé</Text>
        <Text style={styles.body}>
          L'écran n'a pas pu s'afficher. Tu peux réessayer — tes données sont
          intactes.
        </Text>
        <Text style={styles.detail} numberOfLines={3}>
          {error.message}
        </Text>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: "#FBE9E5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: { fontSize: font.heading, fontWeight: "600", color: colors.text },
  body: {
    fontSize: font.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  detail: {
    fontSize: font.tiny,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    ...shadow.button,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },
});
