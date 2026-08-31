import { useState } from "react";
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
  latestMealPlanId,
  buildFromPlan,
  setItemChecked,
  addBoughtToFridge,
  type ShoppingItem,
  type ShoppingListView,
} from "@/lib/shopping";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

const AISLE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  "Fruits et légumes": "nutrition-outline",
  "Produits laitiers": "water-outline",
  "Viande et poisson": "fish-outline",
  Épicerie: "basket-outline",
  Surgelés: "snow-outline",
  Boulangerie: "pizza-outline",
};

export default function ShoppingList() {
  const [list, setList] = useState<ShoppingListView | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [inFridge, setInFridge] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [storing, setStoring] = useState(false);
  const [stored, setStored] = useState<number | null>(null);
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

  async function storeBought() {
    setError(null);
    setStoring(true);
    try {
      const n = await addBoughtToFridge(items);
      setStored(n);
      // Les articles rangés quittent la liste : la garder telle quelle
      // inviterait à les ranger deux fois.
      setItems((prev) => prev.filter((i) => !i.checked));
    } catch (e: any) {
      setError(e.message ?? "Impossible de ranger les courses");
    } finally {
      setStoring(false);
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

  const byAisle: Record<string, { item: ShoppingItem; index: number }[]> = {};
  items.forEach((item, index) => {
    const aisle = item.aisle || "Autres";
    (byAisle[aisle] ??= []).push({ item, index });
  });
  const aisles = Object.keys(byAisle).sort();
  const done = items.filter((i) => i.checked).length;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Mes courses</Text>

      {list && (
        <View style={styles.summary}>
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>~{list.estimated_total ?? 0} €</Text>
            <Text style={styles.summaryLabel}>Estimation</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>
              {done}/{items.length}
            </Text>
            <Text style={styles.summaryLabel}>Cochés</Text>
          </View>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Construction de la liste…</Text>
        </View>
      ) : !list ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cart-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Rien à racheter en double</Text>
          <Text style={styles.emptyBody}>
            Je pars de ton plan de repas et je retire ce que tu as déjà.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {aisles.map((aisle) => (
            <View key={aisle} style={styles.aisleBlock}>
              <View style={styles.aisleHead}>
                <Ionicons
                  name={AISLE_ICONS[aisle] ?? "pricetag-outline"}
                  size={15}
                  color={colors.textSecondary}
                />
                <Text style={styles.aisleTitle}>{aisle}</Text>
              </View>
              <View style={styles.aisleCard}>
                {byAisle[aisle].map(({ item, index }, k) => (
                  <Pressable
                    key={index}
                    style={[styles.row, k > 0 && styles.rowBorder]}
                    onPress={() => toggle(index)}
                    accessibilityLabel={`${item.checked ? "Décocher" : "Cocher"} ${item.name}`}
                  >
                    <Ionicons
                      name={item.checked ? "checkbox" : "square-outline"}
                      size={21}
                      color={item.checked ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={[styles.itemName, item.checked && styles.itemDone]}
                      numberOfLines={1}
                    >
                      {[item.quantity, item.unit, item.name].filter(Boolean).join(" ")}
                    </Text>
                    {item.estimated_price != null && (
                      <Text style={styles.price}>~{item.estimated_price} €</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          {inFridge.length > 0 && (
            <View style={styles.fridgeBlock}>
              <Text style={styles.fridgeTitle}>Déjà dans ton frigo (à vérifier)</Text>
              {inFridge.map((name) => (
                <View key={name} style={styles.fridgeRow}>
                  <Text style={styles.fridgeName}>{name}</Text>
                  <Pressable onPress={() => readd(name)} hitSlop={8}>
                    <Text style={styles.readd}>+ ajouter</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: spacing.md }} />
        </ScrollView>
      )}

      {stored !== null && (
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={17} color={colors.primaryDark} />
          <Text style={styles.doneBannerText}>
            {stored} article{stored > 1 ? "s" : ""} ajouté{stored > 1 ? "s" : ""} à ton
            frigo
          </Text>
        </View>
      )}

      {done > 0 && (
        <Pressable
          style={styles.secondaryBtn}
          onPress={storeBought}
          disabled={storing}
          accessibilityLabel={`Ranger ${done} article${done > 1 ? "s" : ""} dans le frigo`}
        >
          <Ionicons name="file-tray-full-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.secondaryBtnText}>
            {storing
              ? "Rangement…"
              : `J'ai fait mes courses (${done} article${done > 1 ? "s" : ""})`}
          </Text>
        </Pressable>
      )}

      <Pressable style={styles.primaryBtn} onPress={generate} disabled={loading}>
        <Ionicons name="cart" size={18} color={colors.onPrimary} />
        <Text style={styles.primaryBtnText}>
          {list ? "Regénérer la liste" : "Générer la liste"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  summaryBlock: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.border },
  summaryValue: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  summaryLabel: { fontSize: font.tiny, color: colors.textSecondary },

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
  error: { color: colors.danger },

  list: { flex: 1 },
  aisleBlock: { marginBottom: spacing.md },
  aisleHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: spacing.xs,
  },
  aisleTitle: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary },
  aisleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  itemName: { flex: 1, fontSize: font.body, color: colors.text },
  itemDone: { textDecorationLine: "line-through", color: colors.textMuted },
  price: { color: colors.textSecondary, fontSize: font.small },

  fridgeBlock: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fridgeTitle: {
    fontWeight: "700",
    color: colors.primaryDark,
    marginBottom: spacing.xs,
    fontSize: font.small,
  },
  fridgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  fridgeName: { color: colors.text, fontSize: font.body, flex: 1 },
  readd: { color: colors.primaryDark, fontWeight: "700", fontSize: font.small },

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

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 15,
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: font.body,
  },

  doneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  doneBannerText: {
    color: colors.primaryDark,
    fontWeight: "600",
    fontSize: font.small,
  },
});
