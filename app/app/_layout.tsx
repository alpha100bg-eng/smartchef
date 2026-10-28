import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { itemNameFromNotification } from "@/lib/notifications";
import { initLang } from "@/lib/i18n";
import { identifier, oublier } from "@/lib/analytics";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  // Applique la langue mémorisée. Sans ça, l'app démarrerait toujours dans
  // la langue de l'appareil et ignorerait le choix de l'utilisateur.
  useEffect(() => {
    void initLang();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession)
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  // La mesure suit la session, pas l'inverse : personne n'est identifié tant
  // qu'il n'est pas connecté, et l'identité est effacée à la déconnexion pour
  // ne pas attribuer la suite au compte précédent sur un appareil partagé.
  useEffect(() => {
    if (session?.user?.id) void identifier(session.user.id);
    else void oublier();
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)/inventory");
    }
  }, [session, loading, segments]);

  // Expiry alert tapped → open the search screen on that food (reuses F5).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const itemName = itemNameFromNotification(response);
      if (itemName) {
        router.push(`/(tabs)/search?q=${encodeURIComponent(itemName)}`);
      }
    });
    return () => sub.remove();
  }, [router]);

  return (
    <ErrorBoundary>
      <Slot />
    </ErrorBoundary>
  );
}
