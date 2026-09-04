import { useState } from "react";
import { View, TextInput, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

/** Les trois gestes de l'app, dans l'ordre où on les fait. */
const ETAPES: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  titre: string;
  texte: string;
}[] = [
  {
    icon: "camera-outline",
    titre: "Photographie ton frigo",
    texte: "L'app reconnaît les aliments et estime combien de temps ils tiennent.",
  },
  {
    icon: "restaurant-outline",
    titre: "Reçois des recettes",
    texte: "Des idées avec ce que tu as déjà, en priorisant ce qui périme bientôt.",
  },
  {
    icon: "cart-outline",
    titre: "Ne rachète rien en double",
    texte: "La liste de courses retire ce qui est encore dans ton frigo.",
  },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Un visiteur qui arrive d'un lien ne sait pas ce qu'est SmartChef :
  // lui présenter « Email / Mot de passe » d'emblée le fait repartir.
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  function openForm(next: "signin" | "signup") {
    setMode(next);
    setError(null);
    setShowForm(true);
  }

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

  const brand = (
    <View style={styles.brand}>
      <View style={styles.logo}>
        <Ionicons name="leaf" size={32} color={colors.onPrimary} />
      </View>
      <Text style={styles.title}>SmartChef</Text>
      <Text style={styles.tagline}>
        Photographie ton frigo, on s'occupe du reste.
      </Text>
    </View>
  );

  // ── Page d'accueil : montrer le produit avant de demander un compte ──
  if (!showForm) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.landing}
        showsVerticalScrollIndicator={false}
      >
        {brand}

        <View style={styles.steps}>
          {ETAPES.map((e) => (
            <View key={e.titre} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={e.icon} size={20} color={colors.primaryDark} />
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{e.titre}</Text>
                <Text style={styles.stepText}>{e.texte}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.button} onPress={() => openForm("signup")}>
          <Text style={styles.buttonText}>Commencer gratuitement</Text>
        </Pressable>
        <Text style={styles.reassure}>
          Sans installation, sans carte bancaire.
        </Text>

        <Pressable onPress={() => openForm("signin")}>
          <Text style={styles.switch}>J'ai déjà un compte</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.centered}>
      {brand}

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

      <Pressable onPress={() => setShowForm(false)}>
        <Text style={styles.back}>← C'est quoi SmartChef ?</Text>
      </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: "center", padding: spacing.lg },
  landing: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    justifyContent: "center",
    flexGrow: 1,
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

  // ── Page d'accueil ────────────────────────────────────────────────
  steps: { gap: spacing.sm, marginBottom: spacing.lg },
  step: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBody: { flex: 1, gap: 2 },
  stepTitle: { fontSize: font.body, fontWeight: "600", color: colors.text },
  stepText: { fontSize: font.small, color: colors.textSecondary, lineHeight: 19 },
  reassure: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: font.tiny,
    marginTop: spacing.xs,
  },
  back: {
    textAlign: "center",
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: font.small,
  },
});
