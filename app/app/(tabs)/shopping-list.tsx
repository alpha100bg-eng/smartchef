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
  latestMealPlanId,
  buildFromPlan,
  setItemChecked,
  type ShoppingItem,
  type ShoppingListView,
} from "@/lib/shopping";

export default function ShoppingList() {
  const [list, setList] = useState<ShoppingListView | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [inFridge, setInFridge] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const planId = await latestMealPlanId();
      if (!planId) {
        setError("Génère d'abord un plan de repas.");
        return;
      }
      const result = await buildFromPlan(planId);
      setList(result);
      setItems(result.items);
      setInFridge(result.already_in_fridge);
    } catch (e: any) {
      setError(e.message ?? "Échec de la génération");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(i: number) {
    const target = items[i];
    const next = !target.checked;
    // Optimistic tick, reverted if the write fails — the list must feel instant
    // while you're standing in a shop aisle.
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, checked: next } : it))
    );
    if (!target.id) return; // re-added locally, never persisted
    try {
      await setItemChecked(target.id, next);
    } catch {
      setItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, checked: !next } : it))
      );
      setError("La coche n'a pas pu être enregistrée.");
    }
  }

  function readd(name: string) {
    setItems((prev) => [
      ...prev,
      {
        id: null,
        name,
        quantity: null,
        unit: null,
        aisle: "À ranger",
        estimated_price: null,
        checked: false,
      },
    ]);
    setInFridge((prev) => prev.filter((n) => n !== name));
  }

  // group buy items by aisle
  const byAisle: Record<string, { item: ShoppingItem; index: number }[]> = {};
  items.forEach((item, index) => {
    const aisle = item.aisle || "Autres";
    (byAisle[aisle] ??= []).push({ item, index });
  });
  const aisles = Object.keys(byAisle).sort();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Liste de courses</Text>

      {list && list.estimated_total != null && (
        <Text style={styles.total}>Estimation : ~{list.estimated_total} €</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Construction de la liste…</Text>
        </View>
      ) : !list ? (
        <Text style={styles.muted}>
          Génère ta liste à partir de ton dernier plan de repas — on retire ce que
          tu as déjà.
        </Text>
      ) : (
        <ScrollView style={styles.list}>
          {aisles.map((aisle) => (
            <View key={aisle} style={styles.aisleBlock}>
              <Text style={styles.aisleTitle}>{aisle}</Text>
              {byAisle[aisle].map(({ item, index }) => (
                <Pressable
                  key={index}
                  style={styles.row}
                  onPress={() => toggle(index)}
                >
                  <Text style={styles.check}>{item.checked ? "☑" : "☐"}</Text>
                  <Text style={[styles.itemName, item.checked && styles.itemDone]}>
                    {[item.quantity, item.unit, item.name].filter(Boolean).join(" ")}
                  </Text>
                  {item.estimated_price != null && (
                    <Text style={styles.price}>~{item.estimated_price} €</Text>
                  )}
                </Pressable>
              ))}
            </View>
          ))}

          {inFridge.length > 0 && (
            <View style={styles.fridgeBlock}>
              <Text style={styles.fridgeTitle}>Déjà dans ton frigo (à vérifier)</Text>
              {inFridge.map((name) => (
                <View key={name} style={styles.row}>
                  <Text style={styles.itemName}>{name}</Text>
                  <Pressable onPress={() => readd(name)}>
                    <Text style={styles.readd}>+ ajouter</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Pressable style={styles.primaryBtn} onPress={generate} disabled={loading}>
        <Text style={styles.primaryBtnText}>
          {list ? "Regénérer la liste" : "Générer la liste"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  total: { fontSize: 15, color: "#1a7f37", fontWeight: "600" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  list: { flex: 1 },
  aisleBlock: { marginBottom: 14 },
  aisleTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4, color: "#444" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  check: { fontSize: 18 },
  itemName: { flex: 1, fontSize: 15 },
  itemDone: { textDecorationLine: "line-through", color: "#aaa" },
  price: { color: "#888", fontSize: 13 },
  fridgeBlock: {
    marginTop: 10,
    padding: 12,
    backgroundColor: "#f7f7f7",
    borderRadius: 8,
  },
  fridgeTitle: { fontWeight: "700", color: "#666", marginBottom: 6 },
  readd: { color: "#1a7f37", fontWeight: "600" },
  primaryBtn: {
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
});
