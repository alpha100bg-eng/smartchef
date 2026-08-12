import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockLatest = jest.fn().mockResolvedValue("plan-1");
const mockBuild = jest.fn().mockResolvedValue({
  id: "list-1",
  meal_plan_id: "plan-1",
  status: "active",
  estimated_total: 8.5,
  already_in_fridge: ["Tomates"],
  items: [
    {
      name: "poulet",
      quantity: 500,
      unit: "g",
      aisle: "Viande et poisson",
      estimated_price: 6,
      checked: false,
    },
  ],
});

jest.mock("@/lib/shopping", () => ({
  latestMealPlanId: () => mockLatest(),
  buildFromPlan: (id: string) => mockBuild(id),
}));

import ShoppingList from "../shopping-list";

test("generate shows aisles, estimate, and the already-in-fridge section", async () => {
  const { getByText, findByText, queryByText } = render(<ShoppingList />);

  fireEvent.press(getByText("Générer la liste"));

  await findByText("Viande et poisson");
  await findByText(/Estimation : ~8.5/);
  await findByText("Déjà dans ton frigo (à vérifier)");
  await waitFor(() => expect(mockBuild).toHaveBeenCalledWith("plan-1"));

  // re-add moves Tomates into the buy list
  fireEvent.press(getByText("+ ajouter"));
  await findByText(/Tomates/);
}, 20000);
