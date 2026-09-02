import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { sendFeedback, hasGivenFeedback } from "@/lib/feedback";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

/**
 * Recueil d'avis, replié par défaut.
 *
 * Les deux questions sont volontairement opposées : demander seulement « ça
 * t'a plu ? » ne récolte que des compliments polis. C'est la seconde qui
 * produit une liste de travaux exploitable.
 */
export function FeedbackForm() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [liked, setLiked] = useState("");
  const [missing, setMissing] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [already, setAlready] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hasGivenFeedback().then(setAlready).catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    setSending(true);
    try {
      await sendFeedback({ rating, liked, missing });
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? "Envoi impossible");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.thanks}>
        <Ionicons name="heart" size={17} color={colors.primaryDark} />
        <Text style={styles.thanksText}>Merci — c'est noté.</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityLabel="Donner mon avis sur l'application"
      >
        <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.primaryDark} />
        <Text style={styles.triggerText}>
          {already ? "Donner un nouvel avis" : "Donner mon avis"}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Ton avis</Text>
      <Text style={styles.hint}>Sois franc, c'est plus utile que d'être gentil.</Text>

      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            hitSlop={6}
            accessibilityLabel={`Mettre la note de ${n} sur 5`}
          >
            <Ionicons
              name={n <= rating ? "star" : "star-outline"}
              size={28}
              color={n <= rating ? colors.primary : colors.textMuted}
            />
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Qu'est-ce qui t'a plu ?"
        placeholderTextColor={colors.textMuted}
        value={liked}
        onChangeText={setLiked}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder="Qu'est-ce qui t'a manqué ou agacé ?"
        placeholderTextColor={colors.textMuted}
        value={missing}
        onChangeText={setMissing}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.sendBtn, rating === 0 && styles.sendBtnOff]}
        onPress={submit}
        disabled={sending || rating === 0}
      >
        {sending ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.sendBtnText}>
            {rating === 0 ? "Choisis une note" : "Envoyer"}
          </Text>
        )}
      </Pressable>
      <Pressable onPress={() => setOpen(false)}>
        <Text style={styles.cancel}>Plus tard</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 14,
  },
  triggerText: { color: colors.primaryDark, fontWeight: "700", fontSize: font.body },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  heading: { fontSize: font.heading, fontWeight: "600", color: colors.text },
  hint: { fontSize: font.small, color: colors.textSecondary, marginTop: -6 },

  stars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },

  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: font.body,
    color: colors.text,
    minHeight: 62,
    textAlignVertical: "top",
  },

  error: { color: colors.danger, fontSize: font.small },

  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow.button,
  },
  sendBtnOff: { backgroundColor: colors.textMuted, shadowOpacity: 0 },
  sendBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },
  cancel: {
    textAlign: "center",
    color: colors.textSecondary,
    paddingTop: spacing.xs,
    fontSize: font.small,
  },

  thanks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 14,
  },
  thanksText: { color: colors.primaryDark, fontWeight: "600", fontSize: font.body },
});
