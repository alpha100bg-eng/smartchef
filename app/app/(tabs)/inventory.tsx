import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import {
  captureAndUpload,
  detectFromPhoto,
  saveItems,
  deletePhoto,
  deleteItem,
  toReviewItem,
  type ReviewItem,
} from "@/lib/inventory";
import { registerForExpiryAlerts } from "@/lib/notifications";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

type Row = { id: string; name: string; quantity: number | null; unit: string | null };

const LOW_CONFIDENCE = 0.6;
const UNITS = ["pièce", "g", "kg", "L", "ml"];

export default function Inventory() {
  const [items, setItems] = useState<Row[]>([]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "scan" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [alertsOn, setAlertsOn] = useState(false);

  async function enableAlerts() {
    try {
      const granted = await registerForExpiryAlerts();
      setAlertsOn(granted);
      if (!granted) setError("Notifications refusées — active-les dans les réglages.");
    } catch (e: any) {
      setError(e.message ?? "Échec de l'activation des alertes");
    }
  }

  async function loadInventory() {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, quantity, unit")
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => {
    loadInventory();
  }, []);

  async function removeItem(id: string) {
    // Optimistic: the row disappears immediately, restored if the delete fails.
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await deleteItem(id);
    } catch (e: any) {
      setItems(previous);
      setError(e.message ?? "Suppression impossible");
    }
  }

  async function scan() {
    setError(null);
    setBusy("scan");
    try {
      const path = await captureAndUpload();
      if (!path) return; // cancelled
      setPhotoPath(path);
      const detected = await detectFromPhoto(path);
      setReview(detected.map(toReviewItem));
    } catch (e: any) {
      setError(e.message ?? "Échec de l'analyse");
    } finally {
      setBusy(null);
    }
  }

  function updateRow(i: number, patch: Partial<ReviewItem>) {
    setReview((prev) =>
      prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev
    );
  }

  function removeRow(i: number) {
    setReview((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function addRow() {
    setReview((prev) => [
      ...(prev ?? []),
      { name: "", quantity: "", unit: "", brand: "", expiry_date: "", confidence: 1 },
    ]);
  }

  async function validate() {
    if (!review) return;
    setError(null);
    setBusy("save");
    try {
      await saveItems(review);
      if (photoPath) await deletePhoto(photoPath); // RGPD: minimisation
      setReview(null);
      setPhotoPath(null);
      await loadInventory();
    } catch (e: any) {
      setError(e.message ?? "Échec de l'enregistrement");
    } finally {
      setBusy(null);
    }
  }

  async function cancelReview() {
    if (photoPath) await deletePhoto(photoPath);
    setReview(null);
    setPhotoPath(null);
  }

  // ── Review mode ──────────────────────────────────────────────────
  if (review) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.reviewContainer}>
        <Text style={styles.title}>
          {review.length} aliment{review.length > 1 ? "s" : ""} détecté
          {review.length > 1 ? "s" : ""}
        </Text>
        <Text style={styles.subtitle}>Vérifie et corrige avant d'ajouter.</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {review.map((row, i) => {
          const doubtful = row.confidence < LOW_CONFIDENCE;
          return (
            <View key={i} style={[styles.card, doubtful && styles.cardDoubtful]}>
              {doubtful && (
                <View style={styles.warnBadge}>
                  <Ionicons name="alert-circle" size={13} color={colors.warn} />
                  <Text style={styles.warnBadgeText}>à vérifier</Text>
                </View>
              )}
              <TextInput
                style={styles.input}
                placeholder="Nom"
                placeholderTextColor={colors.textMuted}
                value={row.name}
                onChangeText={(t) => updateRow(i, { name: t })}
              />
              <View style={styles.rowInline}>
                <TextInput
                  style={[styles.input, styles.qty]}
                  placeholder="Qté"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={row.quantity}
                  onChangeText={(t) => updateRow(i, { quantity: t })}
                />
                <View style={styles.units}>
                  {UNITS.map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => updateRow(i, { unit: u })}
                      style={[styles.unitChip, row.unit === u && styles.unitChipOn]}
                    >
                      <Text
                        style={row.unit === u ? styles.unitTextOn : styles.unitText}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Date de péremption (AAAA-MM-JJ)"
                placeholderTextColor={colors.textMuted}
                value={row.expiry_date}
                onChangeText={(t) => updateRow(i, { expiry_date: t })}
              />
              <TextInput
                style={styles.input}
                placeholder="Marque (optionnel)"
                placeholderTextColor={colors.textMuted}
                value={row.brand}
                onChangeText={(t) => updateRow(i, { brand: t })}
              />
              <Pressable style={styles.removeRow} onPress={() => removeRow(i)}>
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.remove}>Supprimer</Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable style={styles.addBtn} onPress={addRow}>
          <Ionicons name="add" size={18} color={colors.primaryDark} />
          <Text style={styles.addBtnText}>Ajouter un article</Text>
        </Pressable>

        <Pressable
          style={styles.primaryBtn}
          onPress={validate}
          disabled={busy === "save"}
        >
          <Text style={styles.primaryBtnText}>
            {busy === "save" ? "..." : "Valider et ajouter à l'inventaire"}
          </Text>
        </Pressable>
        <Pressable onPress={cancelReview}>
          <Text style={styles.cancel}>Annuler</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── Idle / inventory list ────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mon frigo</Text>
          <Text style={styles.subtitle}>
            {items.length === 0
              ? "Rien pour l'instant"
              : `${items.length} aliment${items.length > 1 ? "s" : ""}`}
          </Text>
        </View>
        <Pressable
          style={[styles.bell, alertsOn && styles.bellOn]}
          onPress={enableAlerts}
          disabled={alertsOn}
        >
          <Ionicons
            name={alertsOn ? "notifications" : "notifications-outline"}
            size={19}
            color={alertsOn ? colors.onPrimary : colors.primaryDark}
          />
        </Pressable>
      </View>

      {busy === "scan" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Analyse de la photo…</Text>
        </View>
      ) : (
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          {items.length === 0 ? (
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Ionicons name="leaf-outline" size={34} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Commence par une photo</Text>
              <Text style={styles.emptyBody}>
                Prends ton frigo en photo, on identifie les aliments pour toi.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {items.map((it) => (
                <View key={it.id} style={styles.itemCard}>
                  <View style={styles.itemBadge}>
                    <Text style={styles.itemBadgeText}>
                      {it.name.trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={styles.itemQty}>
                    {[it.quantity, it.unit].filter(Boolean).join(" ")}
                  </Text>
                  <Pressable
                    onPress={() => removeItem(it.id)}
                    hitSlop={10}
                    accessibilityLabel={`Retirer ${it.name} de l'inventaire`}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={21}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
              ))}
              <View style={{ height: spacing.sm }} />
            </ScrollView>
          )}
        </>
      )}

      <Pressable style={styles.primaryBtn} onPress={scan} disabled={busy === "scan"}>
        <Ionicons name="camera" size={19} color={colors.onPrimary} />
        <Text style={styles.primaryBtnText}>Scanner mon frigo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  reviewContainer: { gap: spacing.sm, paddingBottom: spacing.xl },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: font.small, color: colors.textSecondary, marginTop: 2 },

  bell: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bellOn: { backgroundColor: colors.primary },

  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.sm },
  emptyIcon: {
    width: 76,
    height: 76,
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
  error: { color: colors.danger, marginBottom: spacing.xs },

  list: { flex: 1 },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  itemBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  itemBadgeText: { color: colors.primaryDark, fontWeight: "700", fontSize: font.body },
  itemName: { flex: 1, fontSize: font.body, color: colors.text, fontWeight: "500" },
  itemQty: { fontSize: font.small, color: colors.textSecondary },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardDoubtful: { backgroundColor: colors.warnSoft },
  warnBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  warnBadgeText: { color: colors.warn, fontWeight: "600", fontSize: font.tiny },

  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: font.body,
    color: colors.text,
  },
  rowInline: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  qty: { width: 74 },
  units: { flexDirection: "row", flexWrap: "wrap", gap: 5, flex: 1 },
  unitChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: colors.cardMuted,
  },
  unitChipOn: { backgroundColor: colors.primary },
  unitText: { color: colors.textSecondary, fontSize: font.tiny },
  unitTextOn: { color: colors.onPrimary, fontSize: font.tiny, fontWeight: "600" },

  removeRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 2 },
  remove: { color: colors.danger, fontSize: font.small },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: 13,
    backgroundColor: colors.primarySoft,
    marginTop: spacing.xs,
  },
  addBtnText: { fontWeight: "600", color: colors.primaryDark, fontSize: font.body },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 17,
    marginTop: spacing.sm,
    ...shadow.button,
  },
  primaryBtnText: {
    color: colors.onPrimary,
    fontWeight: "700",
    fontSize: font.body,
  },
  cancel: {
    textAlign: "center",
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
    fontSize: font.small,
  },
});
