import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockGenerate = jest.fn().mockResolvedValue({
  id: "plan-1",
  week_start: "2026-08-03",
  budget_target: 60,
  estimated_cost: 55,
  entries: [
    {
      day: "2026-08-03",
      slot: "dinner",
      recipe: {
        title: "Poulet rôti riz brocoli",
        prep_time_min: 25,
        servings: 2,
        ingredients: [{ name: "poulet", quantity: 500, unit: "g" }],
        steps: [],
        uses_inventory: [],
        instructions: "Cuire le poulet, servir avec riz et brocoli.",
      },
    },
  ],
});

jest.mock("@/lib/mealPlan", () => ({
  generateMealPlan: (w: string, b?: number) => mockGenerate(w, b),
  currentWeekStart: () => "2026-08-03",
}));

import MealPlan from "../meal-plan";

test("generate shows the weekly plan with cost and recipes", async () => {
  const { getByText, findByText } = render(<MealPlan />);

  fireEvent.press(getByText("Générer ma semaine"));

  await findByText("Poulet rôti riz brocoli");
  await findByText(/Coût estimé : 55/);
  await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith("2026-08-03", undefined));

  // expand for details
  fireEvent.press(getByText("Poulet rôti riz brocoli"));
  await findByText("Préparation");
}, 20000);
