// Default Supabase stub for every test file.
//
// lib/supabase.ts builds a real client at import time, which throws without
// EXPO_PUBLIC_* credentials. Any screen that reaches it — even indirectly, e.g.
// meal-plan -> CookedButton -> lib/cook -> lib/supabase — would fail to load.
// Suites that care about Supabase behaviour still declare their own
// jest.mock("@/lib/supabase", ...), which takes precedence over this one.

// AsyncStorage n'a pas de module natif sous jsdom. Le simulacre fourni par la
// bibliothèque suffit : i18n l'utilise pour mémoriser la langue, et il est
// désormais importé indirectement par presque tous les écrans.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const noop = () => Promise.resolve({ data: null, error: null });

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: noop,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: noop, then: (r) => r({ data: [] }) }),
        order: noop,
        limit: noop,
        then: (r) => r({ data: [] }),
      }),
      insert: noop,
      update: () => ({ eq: noop }),
      delete: () => ({ eq: noop, in: noop }),
    }),
    storage: { from: () => ({ upload: noop, remove: noop }) },
  },
}));
