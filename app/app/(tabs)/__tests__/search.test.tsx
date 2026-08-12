import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockSearch = jest.fn().mockResolvedValue([
  {
    title: "Omelette aux tomates",
    prep_time_min: 15,
    servings: 2,
    ingredients: [{ name: "œufs", quantity: 3, unit: "pièce" }],
    steps: ["Battre les œufs", "Cuire"],
    uses_inventory: ["œufs", "tomate"],
  },
]);

jest.mock("@/lib/search", () => ({
  searchRecipes: (q: string) => mockSearch(q),
}));

import Search from "../search";

test("submitting a query shows recipe results", async () => {
  const { getByPlaceholderText, getByText, findByText } = render(<Search />);

  fireEvent.changeText(
    getByPlaceholderText("ex. italien ce soir, moins de 20 min…"),
    "omelette rapide"
  );
  fireEvent.press(getByText("Chercher"));

  await findByText("Omelette aux tomates");
  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("omelette rapide"));

  // expand to reveal steps
  fireEvent.press(getByText("Omelette aux tomates"));
  await findByText("Préparation");
}, 20000);
