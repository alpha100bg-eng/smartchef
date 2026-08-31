import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useUrgentCount } from "@/lib/urgent-count";
import { colors } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function icon(name: IconName, outline: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? name : outline} size={22} color={color} />
  );
}

export default function TabsLayout() {
  const urgent = useUrgentCount();

  return (
    <Tabs
      screenOptions={{
        tabBarBadgeStyle: {
          backgroundColor: colors.danger,
          color: colors.onPrimary,
          fontSize: 10,
          fontWeight: "700",
        },
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Frigo",
          tabBarIcon: icon("leaf", "leaf-outline"),
          // undefined masque la pastille ; 0 afficherait un rond vide.
          tabBarBadge: urgent > 0 ? urgent : undefined,
          tabBarAccessibilityLabel:
            urgent > 0
              ? `Frigo, ${urgent} aliment${urgent > 1 ? "s" : ""} à consommer rapidement`
              : "Frigo",
        }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: "Recherche", tabBarIcon: icon("search", "search-outline") }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{ title: "Semaine", tabBarIcon: icon("calendar", "calendar-outline") }}
      />
      <Tabs.Screen
        name="shopping-list"
        options={{ title: "Courses", tabBarIcon: icon("cart", "cart-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profil", tabBarIcon: icon("person", "person-outline") }}
      />
    </Tabs>
  );
}
