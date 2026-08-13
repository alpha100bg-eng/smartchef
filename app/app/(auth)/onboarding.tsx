import { useState } from "react";
import { View, TextInput, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

/** Free-text fields reach the DB as numbers — "abc" must become null, not NaN. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function Onboarding() {
  const [budgetWeekly, setBudgetWeekly] = useState("");
  const [timePerMealMin, setTimePerMealMin] = useState("");
  const [dietType, setDietType] = useState("");
  const [goals, setGoals] = useState(""); // comma-separated, split on submit
  const [allergies, setAllergies] = useState(""); // comma-separated
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit() {
    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expirée, reconnectez-vous.");
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        budget_weekly: toNumberOrNull(budgetWeekly),
        time_per_meal_min: toNumberOrNull(timePerMealMin),
        diet_type: dietType || null,
        goals: goals
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
      })
      .eq("id", user.id);

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    const allergyLabels = allergies
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    if (allergyLabels.length > 0) {
      const { error: allergyError } = await supabase
        .from("allergies")
        .insert(allergyLabels.map((label) => ({ profile_id: user.id, label })));

      if (allergyError) {
        setError(allergyError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.replace("/(tabs)/inventory");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ton profil</Text>
      <Text style={styles.subtitle}>
        Ces infos guident les recettes et le plan de repas.
      </Text>

      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        placeholder="Budget hebdomadaire (€)"
        keyboardType="numeric"
        value={budgetWeekly}
        onChangeText={setBudgetWeekly}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        placeholder="Temps par repas (min)"
        keyboardType="numeric"
        value={timePerMealMin}
        onChangeText={setTimePerMealMin}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        placeholder="Régime (ex: omnivore, végétarien)"
        value={dietType}
        onChangeText={setDietType}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        placeholder="Objectifs (séparés par une virgule)"
        value={goals}
        onChangeText={setGoals}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        placeholder="Allergies (séparées par une virgule)"
        value={allergies}
        onChangeText={setAllergies}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={submit} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "..." : "Continuer"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: {
    fontSize: font.small,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: font.body,
    color: colors.text,
    ...shadow.card,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
    ...shadow.button,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },
  error: { color: colors.danger, fontSize: font.small },
});
