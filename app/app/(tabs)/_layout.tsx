import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function icon(name: IconName, outline: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? name : outline} size={22} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
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
        options={{ title: "Frigo", tabBarIcon: icon("leaf", "leaf-outline") }}
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
