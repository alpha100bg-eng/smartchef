import { useState } from "react";
import { View, TextInput, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit() {
    setError(null);
    setLoading(true);
    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    if (mode === "signup") {
      router.replace("/(auth)/onboarding");
    }
    // signin success is handled by the auth-state listener in _layout.tsx
  }

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="leaf" size={32} color={colors.onPrimary} />
        </View>
        <Text style={styles.title}>SmartChef</Text>
        <Text style={styles.tagline}>
          Photographie ton frigo, on s'occupe du reste.
        </Text>
      </View>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.button} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>
            {loading ? "..." : mode === "signin" ? "Se connecter" : "Créer un compte"}
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
        <Text style={styles.switch}>
          {mode === "signin"
            ? "Pas de compte ? Créer un compte"
            : "Déjà un compte ? Se connecter"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.button,
  },
  title: { fontSize: 30, fontWeight: "700", color: colors.text },
  tagline: {
    fontSize: font.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: font.body,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.xs,
    ...shadow.button,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },
  switch: {
    textAlign: "center",
    marginTop: spacing.lg,
    color: colors.primaryDark,
    fontSize: font.small,
    fontWeight: "600",
  },
  error: { color: colors.danger, fontSize: font.small },
});
