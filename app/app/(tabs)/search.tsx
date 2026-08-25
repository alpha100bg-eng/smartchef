import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  searchRecipes,
  fetchRecipeDetail,
  type Recipe,
  type RecipeSummary,
} from "@/lib/search";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";
import { CookedButton } from "@/components/CookedButton";

const SUGGESTIONS = ["Rapide ce soir", "Moins de 20 min", "Végétarien", "Avec mon frigo"];

export default function Search() {
  // `q` arrives from the expiry-alert deep link (smartchef://search?q=lait)
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Full recipes are fetched lazily, keyed by their index in the list.
  const [details, setDetails] = useState<Record<number, Recipe>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef<string | null>(null);

  async function run(term?: string) {
    const text = (term ?? query).trim();
    if (!text) return;
    setError(null);
    setLoading(true);
    setExpanded(null);
    setDetails({});
    try {
      setRecipes(await searchRecipes(text));
    } catch (e: any) {
      setError(e.message ?? "Échec de la recherche");
    } finally {
      setLoading(false);
    }
  }

  /** Opening a card fetches its full recipe once, then reuses it. */
  async function openRecipe(index: number, r: RecipeSummary) {
    if (expanded === index) {
      setExpanded(null);
      return;
    }
    setExpanded(index);
    if (details[index]) return;
    setDetailLoading(index);
    try {
      const full = await fetchRecipeDetail(r.title, r.teaser);
      setDetails((prev) => ({ ...prev, [index]: full }));
    } catch (e: any) {
      setError(e.message ?? "Impossible de charger la recette");
      setExpanded(null);
    } finally {
      setDetailLoading(null);
    }
  }

  // Deep link: prefill and search straight away, once per incoming term.
  useEffect(() => {
    if (q && autoRan.current !== q) {
      autoRan.current = q;
      setQuery(q);
      run(q);
    }
  }, [q]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Qu'est-ce que je cuisine ?</Text>

      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="ex. italien ce soir, moins de 20 min…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => run()}
            returnKeyType="search"
          />
        </View>
        <Pressable
          style={styles.searchBtn}
          onPress={() => run()}
          disabled={loading}
          accessibilityLabel="Lancer la recherche"
        >
          <Text style={styles.searchBtnText}>Chercher</Text>
        </Pressable>
      </View>

      {recipes === null && !loading && (
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              style={styles.chip}
              onPress={() => {
                setQuery(s);
                run(s);
              }}
            >
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Recherche de recettes…</Text>
        </View>
      ) : recipes === null ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="restaurant-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Dis-moi ton envie</Text>
          <Text style={styles.emptyBody}>
            Je propose des recettes avec ce que tu as déjà.
          </Text>
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Aucune recette trouvée</Text>
          <Text style={styles.emptyBody}>Essaie de reformuler ta demande.</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {recipes.map((r, i) => {
            const open = expanded === i;
            const full = details[i];
            return (
              <Pressable key={i} style={styles.card} onPress={() => openRecipe(i, r)}>
                <View style={styles.cardHead}>
                  <Text style={styles.recipeTitle}>{r.title}</Text>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.textMuted}
                  />
                </View>

                {r.teaser ? <Text style={styles.teaser}>{r.teaser}</Text> : null}

                <View style={styles.stats}>
                  {r.prep_time_min != null && (
                    <Stat icon="time-outline" value={`${r.prep_time_min}`} label="min" />
                  )}
                  {r.servings != null && (
                    <Stat icon="people-outline" value={`${r.servings}`} label="pers." />
                  )}
                  {full && (
                    <Stat
                      icon="basket-outline"
                      value={`${full.ingredients.length}`}
                      label="ingrédients"
                    />
                  )}
                </View>

                {r.uses_inventory.length > 0 && (
                  <View style={styles.fridgeRow}>
                    <Ionicons name="leaf" size={13} color={colors.primaryDark} />
                    <Text style={styles.fridgeText} numberOfLines={1}>
                      {r.uses_inventory.join(", ")}
                    </Text>
                  </View>
                )}

                {open && detailLoading === i && (
                  <View style={styles.detailLoading}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.muted}>Écriture de la recette…</Text>
                  </View>
                )}

                {open && full && (
                  <View style={styles.detail}>
                    <Text style={styles.sectionTitle}>Ingrédients</Text>
                    {full.ingredients.map((ing, j) => (
                      <View key={j} style={styles.ingRow}>
                        <Text style={styles.ingName}>{ing.name}</Text>
                        <Text style={styles.ingQty}>
                          {[ing.quantity, ing.unit].filter(Boolean).join(" ")}
                        </Text>
                      </View>
                    ))}
                    <Text style={styles.sectionTitle}>Préparation</Text>
                    {full.steps.map((s, j) => (
                      <View key={j} style={styles.stepRow}>
                        <View style={styles.stepNum}>
                          <Text style={styles.stepNumText}>{j + 1}</Text>
                        </View>
                        <Text style={styles.step}>{s}</Text>
                      </View>
                    ))}
                    <CookedButton usesInventory={r.uses_inventory} />
                  </View>
                )}
              </Pressable>
            );
          })}
          <View style={{ height: spacing.md }} />
        </ScrollView>
      )}
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={15} color={colors.primaryDark} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },

  searchRow: { flexDirection: "row", gap: spacing.xs },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: font.body, color: colors.text },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    ...shadow.button,
  },
  searchBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.small },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipText: { color: colors.primaryDark, fontSize: font.small, fontWeight: "600" },

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
  },
  muted: { color: colors.textSecondary, fontSize: font.body },
  error: { color: colors.danger },

  list: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  recipeTitle: { flex: 1, fontSize: font.heading, fontWeight: "600", color: colors.text },
  teaser: { color: colors.textSecondary, fontSize: font.small, lineHeight: 19 },
  detailLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },

  stats: { flexDirection: "row", gap: spacing.xs },
  stat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    gap: 1,
  },
  statValue: { fontSize: font.body, fontWeight: "700", color: colors.text },
  statLabel: { fontSize: font.tiny, color: colors.textSecondary },

  fridgeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  fridgeText: { flex: 1, color: colors.primaryDark, fontSize: font.small },

  detail: { gap: 3, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  sectionTitle: {
    fontWeight: "700",
    marginTop: spacing.xs,
    marginBottom: 3,
    color: colors.text,
    fontSize: font.small,
  },
  ingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ingName: { color: colors.text, fontSize: font.small, flex: 1 },
  ingQty: { color: colors.textSecondary, fontSize: font.small },
  stepRow: { flexDirection: "row", gap: spacing.xs, marginTop: 6 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.primaryDark, fontSize: font.tiny, fontWeight: "700" },
  step: { flex: 1, color: colors.text, fontSize: font.small, lineHeight: 19 },
});
