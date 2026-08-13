import { render, waitFor } from "@testing-library/react-native";

const mockSearch = jest.fn().mockResolvedValue([
  {
    title: "Gratin de courgettes",
    teaser: "Doré au four, fondant dessous.",
    prep_time_min: 30,
    servings: 4,
    uses_inventory: ["courgettes"],
  },
]);

jest.mock("@/lib/search", () => ({
  searchRecipes: (q: string) => mockSearch(q),
  fetchRecipeDetail: jest.fn(),
}));

// Simulates the expiry-alert deep link: smartchef://search?q=courgettes
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ q: "courgettes" }),
}));

import Search from "../search";

test("deep link prefills the query and searches automatically", async () => {
  const { findByText, getByDisplayValue } = render(<Search />);

  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("courgettes"));
  getByDisplayValue("courgettes"); // input prefilled
  await findByText("Gratin de courgettes");
}, 20000);
