import { fireEvent, render, waitFor } from "@testing-library/react-native";

const calls: string[] = [];

const mockUnregister = jest.fn(async () => {
  calls.push("unregister");
});
const mockSignOut = jest.fn(async () => {
  calls.push("signOut");
});

jest.mock("@/lib/notifications", () => ({
  unregisterExpiryAlerts: () => mockUnregister(),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1", email: "a@b.co" } } }),
      signOut: () => mockSignOut(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
          then: (r: any) => r({ data: [] }),
        }),
      }),
    }),
  },
}));

import ProfileScreen from "../profile";

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
});

test("sign out revokes the push token BEFORE signOut (RLS needs the session)", async () => {
  const { getByText } = render(<ProfileScreen />);

  fireEvent.press(getByText("Se déconnecter"));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  // Order is load-bearing: after signOut, auth.uid() is null and the RLS policy
  // on push_tokens rejects the delete, leaving an orphan token.
  expect(calls).toEqual(["unregister", "signOut"]);
}, 20000);

test("sign out still happens if token revocation fails (Expo Go has no projectId)", async () => {
  mockUnregister.mockRejectedValueOnce(new Error("no projectId"));

  const { getByText } = render(<ProfileScreen />);
  fireEvent.press(getByText("Se déconnecter"));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
}, 20000);
