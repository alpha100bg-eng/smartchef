import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  fetchBillingStatus,
  startCheckout,
  remaining,
  type BillingStatus,
} from "@/lib/billing";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

const AVANTAGES = [
  "Le plan de la semaine, 8 par mois",
  "La liste de courses par rayon",
  "100 scans et 300 recherches par mois",
];

/**
 * Palier de l'utilisateur, et invitation à s'abonner s'il est au gratuit.
 *
 * Affiche ce qu'il RESTE plutôt que ce qui est consommé : « il te reste
 * 1 scan » se comprend d'un coup d'œil, « tu as utilisé 2 scans sur 3 »
 * demande un calcul.
 */
export function PremiumCard({ email }: { email?: string | null }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingStatus()
      .then(setStatus)
      .catch(() => {
        // Hors ligne ou API endormie : ne rien afficher plutôt qu'une erreur
        // sur un écran qui n'en a pas besoin.
      });
  }, []);

  async function subscribe() {
    setError(null);
    setOpening(true);
    try {
      const url = await startCheckout(email);
      await Linking.openURL(url);
    } catch (e: any) {
      setError(e.message ?? "Impossible d'ouvrir le paiement");
    } finally {
      setOpening(false);
    }
  }

  if (!status) return null;

  if (status.plan === "premium") {
    return (
      <View style={styles.premiumCard}>
        <Ionicons name="sparkles" size={17} color={colors.primaryDark} />
        <Text style={styles.premiumText}>Premium actif — merci !</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Passer en Premium</Text>
        <Text style={styles.price}>{status.price_eur} €<Text style={styles.perMonth}>/mois</Text></Text>
      </View>

      <View style={styles.quotas}>
        <Quota label="scans" left={remaining(status, "vision")} />
        <Quota label="recherches" left={remaining(status, "search")} />
      </View>
      <Text style={styles.quotaNote}>Ce qu'il te reste ce mois-ci.</Text>

      <View style={styles.list}>
        {AVANTAGES.map((a) => (
          <View key={a} style={styles.listRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.listText}>{a}</Text>
          </View>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {status.billing_available ? (
        <Pressable style={styles.cta} onPress={subscribe} disabled={opening}>
          {opening ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.ctaText}>S'abonner</Text>
          )}
        </Pressable>
      ) : (
        <Text style={styles.soon}>Le paiement arrive bientôt.</Text>
      )}
    </View>
  );
}

function Quota({ label, left }: { label: string; left: number }) {
  const epuise = left === 0;
  return (
    <View style={styles.quota}>
      <Text style={[styles.quotaN, epuise && styles.quotaNOut]}>{left}</Text>
      <Text style={styles.quotaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  price: { fontSize: font.heading, fontWeight: "700", color: colors.primaryDark },
  perMonth: { fontSize: font.tiny, fontWeight: "500", color: colors.textSecondary },

  quotas: { flexDirection: "row", gap: spacing.xs },
  quota: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
  },
  quotaN: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  quotaNOut: { color: colors.danger },
  quotaLabel: { fontSize: font.tiny, color: colors.textSecondary },
  quotaNote: { fontSize: font.tiny, color: colors.textMuted, marginTop: -6 },

  list: { gap: 5 },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  listText: { flex: 1, fontSize: font.small, color: colors.text },

  error: { color: colors.danger, fontSize: font.small },
  soon: { color: colors.textMuted, fontSize: font.small, textAlign: "center" },

  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow.button,
  },
  ctaText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },

  premiumCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  premiumText: { color: colors.primaryDark, fontWeight: "700", fontSize: font.body },
});
