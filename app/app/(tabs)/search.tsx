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

import { searchRecipes, type Recipe } from "@/lib/search";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

const SUGGESTIONS = ["Rapide ce soir", "Moins de 20 min", "Végétarien", "Avec mon frigo"];

export default function Search() {
  // `q` arrives from the expiry-alert deep link (smartchef://search?q=lait)
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef<string | null>(null);

  async function run(term?: string) {
    const text = (term ?? query).trim();
    if (!text) return;
    setError(null);
    setLoading(true);
    setExpanded(null);
    try {
      setRecipes(await searchRecipes(text));
    } catch (e: any) {
      setError(e.message ?? "Échec de la recherche");
    } finally {
      setLoading(false);
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
            return (
              <Pressable
                key={i}
                style={styles.card}
                onPress={() => setExpanded(open ? null : i)}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.recipeTitle}>{r.title}</Text>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.textMuted}
                  />
                </View>

                <View style={styles.stats}>
                  {r.prep_time_min != null && (
                    <Stat icon="time-outline" value={`${r.prep_time_min}`} label="min" />
                  )}
                  {r.servings != null && (
                    <Stat icon="people-outline" value={`${r.servings}`} label="pers." />
                  )}
                  <Stat
                    icon="basket-outline"
                    value={`${r.ingredients.length}`}
                    label="ingrédients"
                  />
                </View>

                {r.uses_inventory.length > 0 && (
                  <View style={styles.fridgeRow}>
                    <Ionicons name="leaf" size={13} color={colors.primaryDark} />
                    <Text style={styles.fridgeText} numberOfLines={1}>
                      {r.uses_inventory.join(", ")}
                    </Text>
                  </View>
                )}

                {open && (
                  <View style={styles.detail}>
                    <Text style={styles.sectionTitle}>Ingrédients</Text>
                    {r.ingredients.map((ing, j) => (
                      <View key={j} style={styles.ingRow}>
                        <Text style={styles.ingName}>{ing.name}</Text>
                        <Text style={styles.ingQty}>
                          {[ing.quantity, ing.unit].filter(Boolean).join(" ")}
                        </Text>
                      </View>
                    ))}
                    <Text style={styles.sectionTitle}>Préparation</Text>
                    {r.steps.map((s, j) => (
                      <View key={j} style={styles.stepRow}>
                        <View style={styles.stepNum}>
                          <Text style={styles.stepNumText}>{j + 1}</Text>
                        </View>
                        <Text style={styles.step}>{s}</Text>
                      </View>
                    ))}
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
