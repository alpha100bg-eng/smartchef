import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockMatch = jest.fn();
const mockRemove = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/cook", () => ({
  matchFridgeItems: (names: string[]) => mockMatch(names),
  removeFinished: (ids: string[]) => mockRemove(ids),
}));

import { CookedButton } from "../CookedButton";

beforeEach(() => {
  jest.clearAllMocks();
  mockMatch.mockResolvedValue([
    { id: "a", name: "tomates", quantity: 5, unit: "pièce" },
    { id: "b", name: "riz", quantity: 1, unit: "kg" },
  ]);
});

test("removes only what the user says is finished", async () => {
  const { getByText, findByText } = render(
    <CookedButton usesInventory={["tomates", "riz"]} />
  );

  fireEvent.press(getByText("J'ai cuisiné ça"));
  await findByText("Qu'est-ce que tu as fini ?");

  // Both start checked; unticking "riz" must keep it in the fridge.
  fireEvent.press(getByText("riz"));
  fireEvent.press(getByText("Retirer de mon frigo"));

  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(["a"]));
  await findByText("Frigo mis à jour");
}, 20000);

test("removes everything when nothing is unticked", async () => {
  const { getByText, findByText } = render(
    <CookedButton usesInventory={["tomates", "riz"]} />
  );

  fireEvent.press(getByText("J'ai cuisiné ça"));
  await findByText("Qu'est-ce que tu as fini ?");
  fireEvent.press(getByText("Retirer de mon frigo"));

  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(["a", "b"]));
}, 20000);

test("says so when the recipe touches nothing in the fridge", async () => {
  mockMatch.mockResolvedValueOnce([]);

  const { getByText, findByText } = render(<CookedButton usesInventory={["safran"]} />);
  fireEvent.press(getByText("J'ai cuisiné ça"));

  await findByText("Rien à retirer");
  expect(mockRemove).not.toHaveBeenCalled();
}, 20000);
