import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { unregisterExpiryAlerts } from "@/lib/notifications";
import { FeedbackForm } from "@/components/FeedbackForm";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

type Profile = {
  display_name: string | null;
  budget_weekly: number | null;
  time_per_meal_min: number | null;
  diet_type: string | null;
  goals: string[];
};

export default function ProfileScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);

      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, budget_weekly, time_per_meal_min, diet_type, goals")
        .eq("id", user.id)
        .single();
      setProfile(p as Profile | null);

      const { data: a } = await supabase
        .from("allergies")
        .select("label")
        .eq("profile_id", user.id);
      setAllergies((a ?? []).map((row) => row.label));
    })();
  }, []);

  async function signOut() {
    setError(null);
    setSigningOut(true);
    try {
      // Order matters: push_tokens is protected by RLS (auth.uid() = profile_id),
      // so the token must be removed while the session is still valid. After
      // signOut() the delete would be silently rejected and the device would
      // keep receiving expiry alerts.
      try {
        await unregisterExpiryAlerts();
      } catch {
        // No token registered, or Expo Go without a projectId — never block
        // sign-out over this.
      }
      await supabase.auth.signOut();
      // The root layout's auth listener redirects to the login screen.
    } catch (e: any) {
      setError(e.message ?? "Échec de la déconnexion");
      setSigningOut(false);
    }
  }

  const initial = (email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Profil</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.email} numberOfLines={1}>
          {email ?? "—"}
        </Text>
      </View>

      {profile && (
        <View style={styles.card}>
          <Row icon="wallet-outline" label="Budget hebdo"
            value={profile.budget_weekly ? `${profile.budget_weekly} €` : "—"} />
          <Row icon="time-outline" label="Temps par repas"
            value={profile.time_per_meal_min ? `${profile.time_per_meal_min} min` : "—"} />
          <Row icon="leaf-outline" label="Régime" value={profile.diet_type || "—"} />
          <Row icon="flag-outline" label="Objectifs"
            value={profile.goals?.length ? profile.goals.join(", ") : "—"} />
          <Row icon="alert-circle-outline" label="Allergies"
            value={allergies.length ? allergies.join(", ") : "aucune"} last />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.spacer} />

      <FeedbackForm />

      <Pressable
        style={styles.signOutBtn}
        onPress={signOut}
        disabled={signingOut}
        accessibilityLabel="Se déconnecter de l'application"
      >
        {signingOut ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.signOutText}>Se déconnecter</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Ionicons name={icon} size={17} color={colors.textMuted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },

  identity: { alignItems: "center", gap: spacing.xs, marginVertical: spacing.sm },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.button,
  },
  avatarText: { color: colors.onPrimary, fontSize: 26, fontWeight: "700" },
  email: { color: colors.textSecondary, fontSize: font.body },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.textSecondary, fontSize: font.small },
  rowValue: {
    flex: 1,
    fontWeight: "500",
    textAlign: "right",
    color: colors.text,
    fontSize: font.small,
  },

  spacer: { flex: 1 },
  error: { color: colors.danger },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingVertical: 16,
    ...shadow.card,
  },
  signOutText: { color: colors.danger, fontWeight: "700", fontSize: font.body },
});
