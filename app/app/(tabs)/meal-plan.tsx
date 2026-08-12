import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

import {
  generateMealPlan,
  currentWeekStart,
  type MealPlanView,
  type MealPlanEntry,
} from "@/lib/mealPlan";

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  dinner: "Dîner",
  snack: "Collation",
};
const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"];

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

export default function MealPlan() {
  const [plan, setPlan] = useState<MealPlanView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    setOpenKey(null);
    try {
      setPlan(await generateMealPlan(currentWeekStart()));
    } catch (e: any) {
      setError(e.message ?? "Échec de la génération");
    } finally {
      setLoading(false);
    }
  }

  // group entries by day
  const byDay: Record<string, MealPlanEntry[]> = {};
  for (const e of plan?.entries ?? []) {
    (byDay[e.day] ??= []).push(e);
  }
  const days = Object.keys(byDay).sort();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plan de la semaine</Text>

      {plan && (
        <Text style={styles.cost}>
          Coût estimé : {plan.estimated_cost ?? "?"} €
          {plan.budget_target ? ` / budget ${plan.budget_target} €` : ""}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Génération du plan… (~1 min)</Text>
        </View>
      ) : !plan ? (
        <Text style={styles.muted}>
          Génère une semaine de repas à partir de ton frigo, ton budget et ton régime.
        </Text>
      ) : (
        <ScrollView style={styles.list}>
          {days.map((day) => (
            <View key={day} style={styles.dayBlock}>
              <Text style={styles.dayTitle}>{dayLabel(day)}</Text>
              {byDay[day]
                .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
                .map((e, i) => {
                  const key = `${day}-${e.slot}-${i}`;
                  const open = openKey === key;
                  return (
                    <Pressable
                      key={key}
                      style={styles.entry}
                      onPress={() => setOpenKey(open ? null : key)}
                    >
                      <Text style={styles.slot}>{SLOT_LABELS[e.slot] ?? e.slot}</Text>
                      <Text style={styles.recipe}>{e.recipe.title}</Text>
                      {e.recipe.prep_time_min ? (
                        <Text style={styles.meta}>{e.recipe.prep_time_min} min</Text>
                      ) : null}
                      {open && (
                        <View style={styles.detail}>
                          {e.recipe.ingredients?.length ? (
                            <>
                              <Text style={styles.sectionTitle}>Ingrédients</Text>
                              {e.recipe.ingredients.map((ing, j) => (
                                <Text key={j} style={styles.ingredient}>
                                  • {[ing.quantity, ing.unit, ing.name].filter(Boolean).join(" ")}
                                </Text>
                              ))}
                            </>
                          ) : null}
                          {e.recipe.instructions ? (
                            <>
                              <Text style={styles.sectionTitle}>Préparation</Text>
                              <Text style={styles.step}>{e.recipe.instructions}</Text>
                            </>
                          ) : null}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable style={styles.primaryBtn} onPress={generate} disabled={loading}>
        <Text style={styles.primaryBtnText}>
          {plan ? "Regénérer la semaine" : "Générer ma semaine"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  cost: { fontSize: 14, color: "#1a7f37", fontWeight: "600" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  list: { flex: 1 },
  dayBlock: { marginBottom: 16 },
  dayTitle: { fontSize: 16, fontWeight: "700", textTransform: "capitalize", marginBottom: 6 },
  entry: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  slot: { fontSize: 12, color: "#888", textTransform: "uppercase" },
  recipe: { fontSize: 15, fontWeight: "500" },
  meta: { color: "#666", fontSize: 12 },
  detail: { marginTop: 6, gap: 2 },
  sectionTitle: { fontWeight: "700", marginTop: 6 },
  ingredient: { color: "#333" },
  step: { color: "#333" },
  primaryBtn: {
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
});
