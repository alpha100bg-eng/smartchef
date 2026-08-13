import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockSearch = jest.fn().mockResolvedValue([
  {
    title: "Omelette aux tomates",
    teaser: "Un classique rapide, moelleux à cœur.",
    prep_time_min: 15,
    servings: 2,
    uses_inventory: ["œufs", "tomate"],
  },
]);

const mockDetail = jest.fn().mockResolvedValue({
  title: "Omelette aux tomates",
  teaser: "Un classique rapide, moelleux à cœur.",
  prep_time_min: 15,
  servings: 2,
  uses_inventory: ["œufs", "tomate"],
  ingredients: [{ name: "œufs", quantity: 3, unit: "pièce" }],
  steps: ["Battre les œufs", "Cuire à feu doux"],
});

jest.mock("@/lib/search", () => ({
  searchRecipes: (q: string) => mockSearch(q),
  fetchRecipeDetail: (t: string, s: string) => mockDetail(t, s),
}));

import Search from "../search";

test("listing is fast: search returns summaries, no detail call yet", async () => {
  const { getByPlaceholderText, getByText, findByText } = render(<Search />);

  fireEvent.changeText(
    getByPlaceholderText("ex. italien ce soir, moins de 20 min…"),
    "omelette rapide"
  );
  fireEvent.press(getByText("Chercher"));

  await findByText("Omelette aux tomates");
  await findByText("Un classique rapide, moelleux à cœur.");
  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("omelette rapide"));

  // The expensive call must not happen just from listing.
  expect(mockDetail).not.toHaveBeenCalled();
}, 20000);

test("opening a recipe fetches its full detail once", async () => {
  const { getByPlaceholderText, getByText, findByText } = render(<Search />);

  fireEvent.changeText(
    getByPlaceholderText("ex. italien ce soir, moins de 20 min…"),
    "omelette"
  );
  fireEvent.press(getByText("Chercher"));
  const card = await findByText("Omelette aux tomates");

  fireEvent.press(card);
  await findByText("Préparation");
  await findByText("Battre les œufs");
  expect(mockDetail).toHaveBeenCalledTimes(1);

  // Collapsing and reopening reuses the cached detail — no second charge.
  fireEvent.press(card);
  fireEvent.press(card);
  await findByText("Préparation");
  expect(mockDetail).toHaveBeenCalledTimes(1);
}, 20000);
