import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { matchFridgeItems, removeFinished, type FridgeMatch } from "@/lib/cook";
import { colors, radius, spacing, font } from "@/lib/theme";

type Props = {
  usesInventory: string[];
  /** Lets the host screen refresh anything showing the inventory. */
  onDone?: () => void;
};

/**
 * "J'ai cuisiné ça" — asks which fridge items were finished, then removes them.
 * We ask rather than subtract quantities: see lib/cook.ts for why.
 */
export function CookedButton({ usesInventory, onDone }: Props) {
  const [matches, setMatches] = useState<FridgeMatch[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      const found = await matchFridgeItems(usesInventory);
      setMatches(found);
      // Pre-checked: finishing what you cooked with is the common case.
      setSelected(Object.fromEntries(found.map((m) => [m.id, true])));
    } catch (e: any) {
      setError(e.message ?? "Impossible de lire ton frigo");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!matches) return;
    setError(null);
    setBusy(true);
    try {
      await removeFinished(matches.filter((m) => selected[m.id]).map((m) => m.id));
      setMatches(null);
      setDone(true);
      onDone?.();
    } catch (e: any) {
      setError(e.message ?? "Suppression impossible");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={styles.doneRow}>
        <Ionicons name="checkmark-circle" size={17} color={colors.primary} />
        <Text style={styles.doneText}>Frigo mis à jour</Text>
      </View>
    );
  }

  if (matches === null) {
    return (
      <>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={styles.cookBtn}
          onPress={open}
          disabled={busy}
          accessibilityLabel="Marquer cette recette comme cuisinée"
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryDark} size="small" />
          ) : (
            <>
              <Ionicons name="restaurant" size={16} color={colors.primaryDark} />
              <Text style={styles.cookBtnText}>J'ai cuisiné ça</Text>
            </>
          )}
        </Pressable>
      </>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Rien à retirer</Text>
        <Text style={styles.panelBody}>
          Cette recette n'utilise aucun aliment identifié dans ton frigo.
        </Text>
        <Pressable onPress={() => setMatches(null)}>
          <Text style={styles.cancel}>Fermer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Qu'est-ce que tu as fini ?</Text>
      <Text style={styles.panelBody}>
        Décoche ce qu'il te reste — on ne retire que le reste.
      </Text>

      {matches.map((m) => {
        const on = !!selected[m.id];
        return (
          <Pressable
            key={m.id}
            style={styles.row}
            onPress={() => setSelected((p) => ({ ...p, [m.id]: !on }))}
            accessibilityLabel={`${on ? "Garder" : "Retirer"} ${m.name}`}
          >
            <Ionicons
              name={on ? "checkbox" : "square-outline"}
              size={20}
              color={on ? colors.primary : colors.textMuted}
            />
            <Text style={styles.rowName}>{m.name}</Text>
            <Text style={styles.rowQty}>
              {[m.quantity, m.unit].filter(Boolean).join(" ")}
            </Text>
          </Pressable>
        );
      })}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.confirmBtn} onPress={confirm} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Text style={styles.confirmBtnText}>Retirer de mon frigo</Text>
        )}
      </Pressable>
      <Pressable onPress={() => setMatches(null)}>
        <Text style={styles.cancel}>Annuler</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 11,
    marginTop: spacing.sm,
  },
  cookBtnText: { color: colors.primaryDark, fontWeight: "700", fontSize: font.small },

  panel: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: 4,
  },
  panelTitle: { fontWeight: "700", color: colors.text, fontSize: font.body },
  panelBody: {
    color: colors.textSecondary,
    fontSize: font.small,
    marginBottom: spacing.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 8 },
  rowName: { flex: 1, color: colors.text, fontSize: font.body },
  rowQty: { color: colors.textSecondary, fontSize: font.small },

  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  confirmBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.small },
  cancel: {
    textAlign: "center",
    color: colors.textSecondary,
    paddingVertical: spacing.xs,
    fontSize: font.small,
  },

  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  doneText: { color: colors.primaryDark, fontWeight: "600", fontSize: font.small },
  error: { color: colors.danger, fontSize: font.small },
});
