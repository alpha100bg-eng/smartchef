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
import { countUrgent, expiryLabel, sortByUrgency, urgency } from "@/lib/expiry";
import { t, useLang } from "@/lib/i18n";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

type Row = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  expiry_date: string | null;
};

const LOW_CONFIDENCE = 0.6;
// "pièce" se traduit ; les unités métriques sont universelles.
const UNITS = () => [t("unit.piece"), "g", "kg", "L", "ml"];

export default function Inventory() {
  // Redessine cet ecran quand la langue change.
  useLang();
  const [items, setItems] = useState<Row[]>([]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [busy, setBusy] = useState<null | "scan" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [alertsOn, setAlertsOn] = useState(false);

  async function enableAlerts() {
    try {
      const granted = await registerForExpiryAlerts();
      setAlertsOn(granted);
      if (!granted) setError(t("inventory.alertsRefused"));
    } catch (e: any) {
      setError(e.message ?? t("inventory.errAlerts"));
    }
  }

  async function loadInventory() {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, quantity, unit, expiry_date")
      .order("created_at", { ascending: false });
    // Ce qui périme d'abord : c'est la seule information qui appelle une
    // décision aujourd'hui.
    setItems(sortByUrgency(data ?? []));
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
      setError(e.message ?? t("inventory.errDelete"));
    }
  }

  async function scan() {
    setError(null);
    setBusy("scan");
    let chemin: string | null = null;
    try {
      chemin = await captureAndUpload();
      if (!chemin) return; // annulé
      const detected = await detectFromPhoto(chemin);
      setReview(detected.map(toReviewItem));
    } catch (e: any) {
      setError(e.message ?? t("inventory.errScan"));
    } finally {
      // La photo ne sert plus dès que la détection a répondu, qu'elle ait
      // abouti ou non : elle n'est jamais réaffichée, elle n'existait que
      // pour être analysée. Elle était supprimée à la validation de
      // l'inventaire, donc un scan refusé — quota mensuel atteint, service
      // indisponible — ou simplement abandonné la laissait indéfiniment dans
      // le stockage. La minimisation des photos ne peut pas dépendre du
      // chemin heureux.
      if (chemin) {
        // Un échec de suppression ne doit pas masquer l'erreur de scan, qui
        // est la seule que l'utilisateur peut traiter.
        await deletePhoto(chemin).catch(() => {});
      }
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
      setReview(null);
      await loadInventory();
    } catch (e: any) {
      setError(e.message ?? t("inventory.errSave"));
    } finally {
      setBusy(null);
    }
  }

  function cancelReview() {
    // La photo est déjà supprimée depuis `scan` : il ne reste que l'écran.
    setReview(null);
  }

  // ── Review mode ──────────────────────────────────────────────────
  if (review) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.reviewContainer}>
        <Text style={styles.title}>
          {review.length} aliment{review.length > 1 ? "s" : ""} détecté
          {review.length > 1 ? "s" : ""}
        </Text>
        <Text style={styles.subtitle}>{t("inventory.review")}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {review.map((row, i) => {
          const doubtful = row.confidence < LOW_CONFIDENCE;
          return (
            <View key={i} style={[styles.card, doubtful && styles.cardDoubtful]}>
              {doubtful && (
                <View style={styles.warnBadge}>
                  <Ionicons name="alert-circle" size={13} color={colors.warn} />
                  <Text style={styles.warnBadgeText}>{t("inventory.doubtful")}</Text>
                </View>
              )}
              <TextInput
                style={styles.input}
                placeholder={t("inventory.name")}
                placeholderTextColor={colors.textMuted}
                value={row.name}
                onChangeText={(t) => updateRow(i, { name: t })}
              />
              <View style={styles.rowInline}>
                <TextInput
                  style={[styles.input, styles.qty]}
                  placeholder={t("inventory.qty")}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={row.quantity}
                  onChangeText={(t) => updateRow(i, { quantity: t })}
                />
                <View style={styles.units}>
                  {UNITS().map((u) => (
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
                placeholder={t("inventory.expiry")}
                placeholderTextColor={colors.textMuted}
                value={row.expiry_date}
                onChangeText={(t) => updateRow(i, { expiry_date: t })}
              />
              <Text style={styles.hint}>
                Estimation de conservation — corrige si tu connais la vraie date.
              </Text>
              <TextInput
                style={styles.input}
                placeholder={t("inventory.brand")}
                placeholderTextColor={colors.textMuted}
                value={row.brand}
                onChangeText={(t) => updateRow(i, { brand: t })}
              />
              <Pressable style={styles.removeRow} onPress={() => removeRow(i)}>
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.remove}>{t("common.delete")}</Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable style={styles.addBtn} onPress={addRow}>
          <Ionicons name="add" size={18} color={colors.primaryDark} />
          <Text style={styles.addBtnText}>{t("inventory.addRow")}</Text>
        </Pressable>

        <Pressable
          style={styles.primaryBtn}
          onPress={validate}
          disabled={busy === "save"}
        >
          <Text style={styles.primaryBtnText}>
            {busy === "save" ? "..." : t("inventory.save")}
          </Text>
        </Pressable>
        <Pressable onPress={cancelReview}>
          <Text style={styles.cancel}>{t("common.cancel")}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── Idle / inventory list ────────────────────────────────────────
  const urgentCount = countUrgent(items);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t("inventory.title")}</Text>
          <Text style={styles.subtitle}>
            {items.length === 0
              ? t("inventory.empty")
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
          <Text style={styles.muted}>{t("inventory.analysing")}</Text>
        </View>
      ) : (
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          {items.length === 0 ? (
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Ionicons name="leaf-outline" size={34} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t("inventory.emptyTitle")}</Text>
              <Text style={styles.emptyBody}>
                Prends ton frigo en photo, on identifie les aliments pour toi.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {urgentCount > 0 && (
                <View style={styles.banner}>
                  <Ionicons name="time-outline" size={17} color={colors.warn} />
                  <Text style={styles.bannerText}>
                    {urgentCount} aliment{urgentCount > 1 ? "s" : ""} à consommer
                    rapidement
                  </Text>
                </View>
              )}
              {items.map((it) => {
                const level = urgency(it.expiry_date);
                const label = expiryLabel(it.expiry_date);
                const late = level === "expired" || level === "today";
                return (
                  <View
                    key={it.id}
                    style={[
                      styles.itemCard,
                      late && styles.itemCardLate,
                      level === "soon" && styles.itemCardSoon,
                    ]}
                  >
                    <View
                      style={[
                        styles.itemBadge,
                        late && styles.itemBadgeLate,
                        level === "soon" && styles.itemBadgeSoon,
                      ]}
                    >
                      <Text
                        style={[
                          styles.itemBadgeText,
                          late && styles.itemBadgeTextLate,
                          level === "soon" && styles.itemBadgeTextSoon,
                        ]}
                      >
                        {it.name.trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {it.name}
                      </Text>
                      {label && (
                        <Text style={late ? styles.expiryLate : styles.expirySoon}>
                          {label}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.itemQty}>
                      {[it.quantity, it.unit].filter(Boolean).join(" ")}
                    </Text>
                    <Pressable
                      onPress={() => removeItem(it.id)}
                      hitSlop={10}
                      accessibilityLabel={t("inventory.removeLabel", { name: it.name })}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={21}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  </View>
                );
              })}
              <View style={{ height: spacing.sm }} />
            </ScrollView>
          )}
        </>
      )}

      <Pressable style={styles.primaryBtn} onPress={scan} disabled={busy === "scan"}>
        <Ionicons name="camera" size={19} color={colors.onPrimary} />
        <Text style={styles.primaryBtnText}>{t("onboarding.finish")}</Text>
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
  itemMain: { flex: 1, gap: 1 },
  itemName: { fontSize: font.body, color: colors.text, fontWeight: "500" },
  itemQty: { fontSize: font.small, color: colors.textSecondary },

  // Péremption : la couleur porte l'urgence, le texte la précise.
  itemCardLate: { backgroundColor: "#FBEDE9" },
  itemCardSoon: { backgroundColor: colors.warnSoft },
  itemBadgeLate: { backgroundColor: "#F4D8D1" },
  itemBadgeSoon: { backgroundColor: "#F7E6BE" },
  itemBadgeTextLate: { color: colors.danger },
  itemBadgeTextSoon: { color: colors.warn },
  expiryLate: { fontSize: font.tiny, color: colors.danger, fontWeight: "600" },
  expirySoon: { fontSize: font.tiny, color: colors.warn, fontWeight: "600" },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.warnSoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  bannerText: { color: colors.warn, fontWeight: "600", fontSize: font.small },

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

  hint: { fontSize: font.tiny, color: colors.textMuted, marginTop: -4 },
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
