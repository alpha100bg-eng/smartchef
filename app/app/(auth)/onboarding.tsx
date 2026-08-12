import { useState } from "react";
import { View, TextInput, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";

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

      <TextInput
        style={styles.input}
        placeholder="Budget hebdomadaire (€)"
        keyboardType="numeric"
        value={budgetWeekly}
        onChangeText={setBudgetWeekly}
      />
      <TextInput
        style={styles.input}
        placeholder="Temps par repas (min)"
        keyboardType="numeric"
        value={timePerMealMin}
        onChangeText={setTimePerMealMin}
      />
      <TextInput
        style={styles.input}
        placeholder="Régime (ex: omnivore, végétarien)"
        value={dietType}
        onChangeText={setDietType}
      />
      <TextInput
        style={styles.input}
        placeholder="Objectifs (séparés par une virgule)"
        value={goals}
        onChangeText={setGoals}
      />
      <TextInput
        style={styles.input}
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
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#c00" },
});
