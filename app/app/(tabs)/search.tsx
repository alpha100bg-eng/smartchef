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

import { searchRecipes, type Recipe } from "@/lib/search";

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
    <View style={styles.container}>
      <Text style={styles.title}>Qu'est-ce que je cuisine ?</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="ex. italien ce soir, moins de 20 min…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => run()}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={() => run()} disabled={loading}>
          <Text style={styles.searchBtnText}>Chercher</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Recherche de recettes…</Text>
        </View>
      ) : recipes === null ? (
        <Text style={styles.muted}>
          Décris ton envie — je propose des recettes avec ce que tu as.
        </Text>
      ) : recipes.length === 0 ? (
        <Text style={styles.muted}>Aucune recette trouvée. Reformule ta demande.</Text>
      ) : (
        <ScrollView style={styles.list}>
          {recipes.map((r, i) => {
            const open = expanded === i;
            return (
              <Pressable
                key={i}
                style={styles.card}
                onPress={() => setExpanded(open ? null : i)}
              >
                <Text style={styles.recipeTitle}>{r.title}</Text>
                <Text style={styles.meta}>
                  {r.prep_time_min ? `${r.prep_time_min} min` : ""}
                  {r.servings ? ` · ${r.servings} pers.` : ""}
                </Text>
                {r.uses_inventory.length > 0 && (
                  <Text style={styles.fromFridge}>
                    🧊 utilise : {r.uses_inventory.join(", ")}
                  </Text>
                )}

                {open && (
                  <View style={styles.detail}>
                    <Text style={styles.sectionTitle}>Ingrédients</Text>
                    {r.ingredients.map((ing, j) => (
                      <Text key={j} style={styles.ingredient}>
                        • {[ing.quantity, ing.unit, ing.name].filter(Boolean).join(" ")}
                      </Text>
                    ))}
                    <Text style={styles.sectionTitle}>Préparation</Text>
                    {r.steps.map((s, j) => (
                      <Text key={j} style={styles.step}>
                        {j + 1}. {s}
                      </Text>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  searchRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
  searchBtn: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "600" },
  list: { flex: 1 },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  recipeTitle: { fontSize: 16, fontWeight: "600" },
  meta: { color: "#666", fontSize: 13 },
  fromFridge: { color: "#1a7f37", fontSize: 13 },
  detail: { marginTop: 8, gap: 2 },
  sectionTitle: { fontWeight: "700", marginTop: 8 },
  ingredient: { color: "#333" },
  step: { color: "#333", marginTop: 2 },
});
