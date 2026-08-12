import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { itemNameFromNotification } from "@/lib/notifications";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

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
