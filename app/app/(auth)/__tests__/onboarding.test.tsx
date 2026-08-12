import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUpdate = jest.fn(() => ({
  eq: jest.fn().mockResolvedValue({ error: null }),
}));
const mockInsert = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: jest.fn((table: string) => {
      if (table === "profiles") return { update: mockUpdate };
      if (table === "allergies") return { insert: mockInsert };
      throw new Error(`unexpected table ${table}`);
    }),
  },
}));

import Onboarding from "../onboarding";

test("saves profile and allergies then navigates to inventory", async () => {
  const { getByPlaceholderText, getByText } = render(<Onboarding />);

  fireEvent.changeText(getByPlaceholderText("Budget hebdomadaire (€)"), "50");
  fireEvent.changeText(
    getByPlaceholderText("Allergies (séparées par une virgule)"),
    "arachides, gluten"
  );
  fireEvent.press(getByText("Continuer"));

  await waitFor(
    () => expect(mockReplace).toHaveBeenCalledWith("/(tabs)/inventory"),
    { timeout: 10000 }
  );

  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ budget_weekly: 50 })
  );
  expect(mockInsert).toHaveBeenCalledWith([
    { profile_id: "user-1", label: "arachides" },
    { profile_id: "user-1", label: "gluten" },
  ]);
}, 20000);
