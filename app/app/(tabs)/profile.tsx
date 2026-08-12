import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";

import { supabase } from "@/lib/supabase";
import { unregisterExpiryAlerts } from "@/lib/notifications";

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>

      {email && <Text style={styles.email}>{email}</Text>}

      {profile && (
        <View style={styles.card}>
          <Row label="Budget hebdo" value={profile.budget_weekly ? `${profile.budget_weekly} €` : "—"} />
          <Row label="Temps par repas" value={profile.time_per_meal_min ? `${profile.time_per_meal_min} min` : "—"} />
          <Row label="Régime" value={profile.diet_type || "—"} />
          <Row label="Objectifs" value={profile.goals?.length ? profile.goals.join(", ") : "—"} />
          <Row label="Allergies" value={allergies.length ? allergies.join(", ") : "aucune"} />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.spacer} />

      <Pressable style={styles.signOutBtn} onPress={signOut} disabled={signingOut}>
        {signingOut ? (
          <ActivityIndicator color="#c00" />
        ) : (
          <Text style={styles.signOutText}>Se déconnecter</Text>
        )}
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  email: { color: "#666" },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
  rowLabel: { color: "#888" },
  rowValue: { fontWeight: "500", flexShrink: 1, textAlign: "right" },
  spacer: { flex: 1 },
  error: { color: "#c00" },
  signOutBtn: {
    borderWidth: 1,
    borderColor: "#c00",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  signOutText: { color: "#c00", fontWeight: "700" },
});
