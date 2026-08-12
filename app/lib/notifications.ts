import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { supabase } from "./supabase";

/**
 * Expiry alerts (F4). Opt-in only: a push token is stored ONLY if the user
 * explicitly grants notification permission. Revoking removes the token, which
 * is what the cron job checks — no token means no notification.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Ask for consent and register the device. Returns true if notifications are on. */
export async function registerForExpiryAlerts(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return false; // no consent → nothing stored

  const { data: tokenData } = await Notifications.getExpoPushTokenAsync();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { profile_id: user.id, token: tokenData, platform: Platform.OS },
      { onConflict: "token" }
    );
  if (error) throw error;
  return true;
}

/** Turn alerts off: drop this device's token. */
export async function unregisterExpiryAlerts(): Promise<void> {
  const { data: tokenData } = await Notifications.getExpoPushTokenAsync();
  await supabase.from("push_tokens").delete().eq("token", tokenData);
}

/** Extract the deep-link target from a tapped notification, if any. */
export function itemNameFromNotification(
  response: Notifications.NotificationResponse
): string | null {
  const data = response.notification.request.content.data as
    | { item_name?: string }
    | undefined;
  return data?.item_name ?? null;
}
