import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, spacing, font, shadow } from "@/lib/theme";

/**
 * Écran affiché à la place d'une fonctionnalité réservée au Premium.
 *
 * Le serveur refuse déjà ces appels (402) — ceci n'est pas une sécurité, c'est
 * une question d'égards : montrer l'offre vaut mieux que laisser quelqu'un
 * appuyer sur un bouton pour récolter un message d'erreur.
 */
export function PremiumGate({
  title,
  pitch,
  icon = "sparkles-outline",
  price = "4,99",
}: {
  title: string;
  pitch: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  price?: string;
}) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.pitch}>{pitch}</Text>

      <Pressable
        style={styles.cta}
        onPress={() => router.push("/profile")}
        accessibilityLabel="Voir l'abonnement Premium"
      >
        <Ionicons name="sparkles" size={17} color={colors.onPrimary} />
        <Text style={styles.ctaText}>Découvrir Premium — {price} €/mois</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: { fontSize: font.heading, fontWeight: "600", color: colors.text },
  pitch: {
    fontSize: font.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    ...shadow.button,
  },
  ctaText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.small },
});
