import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  generateMealPlan,
  fetchInstructions,
  currentWeekStart,
  type MealPlanView,
  type MealPlanEntry,
} from "@/lib/mealPlan";
import { fetchBillingStatus } from "@/lib/billing";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";
import { CookedButton } from "@/components/CookedButton";
import { PremiumGate } from "@/components/PremiumGate";

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  dinner: "Dîner",
  snack: "Collation",
};
const SLOT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  breakfast: "sunny-outline",
  lunch: "restaurant-outline",
  dinner: "moon-outline",
  snack: "cafe-outline",
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
  // Préparations rédigées à la demande, indexées par recipe_id. Une recette
  // revient plusieurs fois dans la semaine : la mémoriser ici évite de la
  // redemander pour chaque créneau.
  const [steps, setSteps] = useState<Record<string, string>>({});
  const [stepsLoading, setStepsLoading] = useState<string | null>(null);
  // null tant qu'on ne sait pas : évite de montrer l'offre une fraction de
  // seconde à quelqu'un qui est déjà abonné.
  const [premium, setPremium] = useState<boolean | null>(null);

  useEffect(() => {
    fetchBillingStatus()
      .then((s) => setPremium(s.plan === "premium"))
      // API injoignable : laisser l'écran normal. Le serveur refusera de
      // toute façon si le palier ne le permet pas.
      .catch(() => setPremium(true));
  }, []);

  async function generate() {
    setError(null);
    setLoading(true);
    setOpenKey(null);
    setSteps({});
    try {
      setPlan(await generateMealPlan(currentWeekStart()));
    } catch (e: any) {
      setError(e.message ?? "Échec de la génération");
    } finally {
      setLoading(false);
    }
  }

  /** Ouvre un créneau et charge sa préparation si on ne l'a pas déjà. */
  async function toggleEntry(key: string, entry: MealPlanEntry) {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);

    const known = entry.recipe.instructions || steps[entry.recipe_id];
    if (known || !entry.recipe_id) return;

    setStepsLoading(entry.recipe_id);
    try {
      const text = await fetchInstructions(entry.recipe_id);
      setSteps((prev) => ({ ...prev, [entry.recipe_id]: text }));
    } catch (e: any) {
      setError(e.message ?? "Impossible de charger la préparation");
    } finally {
      setStepsLoading(null);
    }
  }

  const byDay: Record<string, MealPlanEntry[]> = {};
  for (const e of plan?.entries ?? []) {
    (byDay[e.day] ??= []).push(e);
  }
  const days = Object.keys(byDay).sort();
  const overBudget =
    plan?.budget_target != null &&
    plan?.estimated_cost != null &&
    plan.estimated_cost > plan.budget_target;

  if (premium === false) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Ma semaine</Text>
        <PremiumGate
          icon="calendar-outline"
          title="Sept jours, zéro question"
          pitch="Le plan de la semaine compose tes repas à partir de ton frigo, ton budget et ton régime. C'est la fonctionnalité la plus gourmande de l'app — elle fait partie de Premium."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Ma semaine</Text>

      {plan && (
        <View style={[styles.costCard, overBudget && styles.costCardOver]}>
          <Ionicons
            name={overBudget ? "alert-circle" : "wallet-outline"}
            size={18}
            color={overBudget ? colors.warn : colors.primaryDark}
          />
          <Text style={[styles.costText, overBudget && styles.costTextOver]}>
            Coût estimé : {plan.estimated_cost ?? "?"} €
            {plan.budget_target ? ` / budget ${plan.budget_target} €` : ""}
          </Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Génération du plan…</Text>
          <Text style={styles.mutedSmall}>Une trentaine de secondes.</Text>
        </View>
      ) : !plan ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Sept jours, zéro question</Text>
          <Text style={styles.emptyBody}>
            Je compose ta semaine à partir de ton frigo, ton budget et ton régime.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
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
                      onPress={() => toggleEntry(key, e)}
                    >
                      <View style={styles.slotIcon}>
                        <Ionicons
                          name={SLOT_ICONS[e.slot] ?? "restaurant-outline"}
                          size={16}
                          color={colors.primaryDark}
                        />
                      </View>
                      <View style={styles.entryBody}>
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
                                  <View key={j} style={styles.ingRow}>
                                    <Text style={styles.ingName}>{ing.name}</Text>
                                    <Text style={styles.ingQty}>
                                      {[ing.quantity, ing.unit].filter(Boolean).join(" ")}
                                    </Text>
                                  </View>
                                ))}
                              </>
                            ) : null}
                            <Text style={styles.sectionTitle}>Préparation</Text>
                            {stepsLoading === e.recipe_id ? (
                              <View style={styles.stepsLoading}>
                                <ActivityIndicator
                                  color={colors.primary}
                                  size="small"
                                />
                                <Text style={styles.mutedSmall}>
                                  Écriture de la recette…
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.step}>
                                {e.recipe.instructions ||
                                  steps[e.recipe_id] ||
                                  "Préparation indisponible."}
                              </Text>
                            )}
                            <CookedButton
                              usesInventory={(e.recipe.ingredients ?? []).map(
                                (i) => i.name
                              )}
                            />
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
            </View>
          ))}
          <View style={{ height: spacing.md }} />
        </ScrollView>
      )}

      <Pressable style={styles.primaryBtn} onPress={generate} disabled={loading}>
        <Ionicons name="sparkles-outline" size={18} color={colors.onPrimary} />
        <Text style={styles.primaryBtnText}>
          {plan ? "Regénérer la semaine" : "Générer ma semaine"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },

  costCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  costCardOver: { backgroundColor: colors.warnSoft },
  costText: { color: colors.primaryDark, fontWeight: "600", fontSize: font.small },
  costTextOver: { color: colors.warn },

  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.xs },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontSize: font.heading, fontWeight: "600", color: colors.text },
  emptyBody: {
    fontSize: font.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
    lineHeight: 21,
  },
  muted: { color: colors.textSecondary, fontSize: font.body },
  mutedSmall: { color: colors.textMuted, fontSize: font.small },
  error: { color: colors.danger },

  list: { flex: 1 },
  dayBlock: { marginBottom: spacing.md },
  dayTitle: {
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "capitalize",
    marginBottom: spacing.xs,
    color: colors.textSecondary,
  },
  entry: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    ...shadow.card,
  },
  slotIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  entryBody: { flex: 1 },
  slot: { fontSize: font.tiny, color: colors.textMuted, textTransform: "uppercase" },
  recipe: { fontSize: font.body, fontWeight: "500", color: colors.text },
  meta: { color: colors.textSecondary, fontSize: font.tiny },

  detail: { marginTop: spacing.xs, gap: 2 },
  sectionTitle: {
    fontWeight: "700",
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: font.small,
  },
  ingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ingName: { color: colors.text, fontSize: font.small, flex: 1 },
  ingQty: { color: colors.textSecondary, fontSize: font.small },
  step: { color: colors.text, fontSize: font.small, lineHeight: 19 },
  stepsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 17,
    ...shadow.button,
  },
  primaryBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },
});
