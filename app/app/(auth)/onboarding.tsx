import { useState } from "react";
import {
  View,
  TextInput,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { t, useLang } from "@/lib/i18n";
import { colors, radius, spacing, font, shadow } from "@/lib/theme";

/**
 * Accueil d'un nouvel inscrit.
 *
 * L'ancienne version affichait cinq champs libres — budget, temps par repas,
 * régime, objectifs, allergies — avant d'avoir rien montré. Sur les trois
 * premiers comptes, deux ne sont jamais allés plus loin.
 *
 * Ne reste ici que ce qui ne peut PAS attendre : les allergies, parce qu'une
 * recette proposée avant de les connaître peut être dangereuse. Le régime
 * tient en un appui. Le budget est demandé au moment du plan de repas, là où
 * il sert réellement.
 */

/**
 * Clé d'affichage + valeur stockée.
 *
 * La valeur enregistrée reste un mot anglais invariable : elle part dans le
 * contexte envoyé à l'IA, et un `diet_type` qui changerait de langue selon
 * l'appareil rendrait les anciens profils incohérents.
 *
 * Traduit au rendu et non ici : un `const` au niveau du module figerait la
 * langue au chargement.
 */
const REGIMES = [
  ["diet.omnivore", "omnivore"],
  ["diet.vegetarian", "vegetarian"],
  ["diet.vegan", "vegan"],
  ["diet.glutenfree", "gluten-free"],
] as const;

// Les allergènes à déclaration obligatoire les plus courants : un appui vaut
// mieux qu'un champ libre, et évite les fautes de frappe que l'IA ne
// reconnaîtrait pas.
const ALLERGENES = [
  "allergen.peanut", "allergen.nuts", "allergen.lactose", "allergen.gluten",
  "allergen.egg", "allergen.fish", "allergen.shellfish", "allergen.soy",
] as const;

export default function Onboarding() {
  // Redessine cet ecran quand la langue change.
  useLang();
  const [etape, setEtape] = useState<"bienvenue" | "questions">("bienvenue");
  const [regime, setRegime] = useState<string | null>(null);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [autres, setAutres] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function basculer(a: string) {
    setChoisies((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }

  async function terminer() {
    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t("onboarding.expired"));
      setSaving(false);
      return;
    }

    if (regime) {
      const { error: e } = await supabase
        .from("profiles")
        .update({ diet_type: regime })
        .eq("id", user.id);
      if (e) {
        setError(e.message);
        setSaving(false);
        return;
      }
    }

    const labels = [
      ...choisies,
      ...autres.split(",").map((a) => a.trim()).filter(Boolean),
    ];
    if (labels.length > 0) {
      const { error: e } = await supabase
        .from("allergies")
        .insert(labels.map((label) => ({ profile_id: user.id, label })));
      if (e) {
        // Une allergie non enregistrée est un risque réel : on ne laisse pas
        // passer silencieusement.
        setError(e.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.replace("/(tabs)/inventory");
  }

  // ── Bienvenue : annoncer l'essai avant toute demande ──────────────
  if (etape === "bienvenue") {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={28} color={colors.onPrimary} />
          </View>
          <Text style={styles.title}>{t("onboarding.trialTitle")}</Text>
          <Text style={styles.subtitle}>
            Tout est ouvert, sans carte bancaire.
          </Text>

          <View style={styles.list}>
            {[
              t("onboarding.perk1"),
              t("onboarding.perk2"),
              t("onboarding.perk3"),
            ].map((t) => (
              <View key={t} style={styles.listRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.listText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable style={styles.button} onPress={() => setEtape("questions")}>
          <Text style={styles.buttonText}>{t("onboarding.go")}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Une seule question, celle qui ne peut pas attendre ────────────
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.form}>
      <Text style={styles.title}>{t("onboarding.title")}</Text>
      <Text style={styles.subtitle}>{t("onboarding.sub")}</Text>

      <Text style={styles.label}>{t("onboarding.diet")}</Text>
      <View style={styles.chips}>
        {REGIMES.map(([cle, valeur]) => (
          <Pressable
            key={valeur}
            onPress={() => setRegime(regime === valeur ? null : valeur)}
            style={[styles.chip, regime === valeur && styles.chipOn]}
          >
            <Text style={regime === valeur ? styles.chipTextOn : styles.chipText}>
              {t(cle)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t("onboarding.allergies")}</Text>
      <View style={styles.chips}>
        {ALLERGENES.map((cle) => (
          <Pressable
            key={cle}
            onPress={() => basculer(t(cle))}
            style={[styles.chip, choisies.includes(t(cle)) && styles.chipDanger]}
            accessibilityLabel={t(
              choisies.includes(t(cle)) ? "allergen.rm" : "allergen.add",
              { name: t(cle) }
            )}
          >
            <Text
              style={choisies.includes(t(cle)) ? styles.chipTextOn : styles.chipText}
            >
              {t(cle)}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder={t("onboarding.otherAllergy")}
        placeholderTextColor={colors.textMuted}
        value={autres}
        onChangeText={setAutres}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={terminer} disabled={saving}>
        <Text style={styles.buttonText}>
          {saving ? "..." : t("onboarding.finish")}
        </Text>
      </Pressable>
      <Text style={styles.note}>
        Modifiable à tout moment dans ton profil.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", padding: spacing.lg },
  form: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },

  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.md,
    ...shadow.button,
  },
  title: {
    fontSize: font.title,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: font.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
    marginBottom: spacing.lg,
  },

  list: { gap: spacing.sm },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  listText: { flex: 1, fontSize: font.body, color: colors.text, lineHeight: 21 },

  label: {
    fontSize: font.small,
    fontWeight: "700",
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...shadow.card,
  },
  chipOn: { backgroundColor: colors.primary },
  chipDanger: { backgroundColor: colors.danger },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "500" },
  chipTextOn: { color: colors.onPrimary, fontSize: font.small, fontWeight: "700" },

  input: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: font.body,
    color: colors.text,
    marginTop: spacing.xs,
    ...shadow.card,
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: spacing.md,
    ...shadow.button,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.body },
  note: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: font.tiny,
    marginTop: spacing.xs,
  },
  error: { color: colors.danger, fontSize: font.small },
});
