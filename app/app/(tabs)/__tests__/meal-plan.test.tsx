import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockGenerate = jest.fn();
const mockFetchInstructions = jest.fn();
const mockBillingStatus = jest.fn();

jest.mock("@/lib/mealPlan", () => ({
  generateMealPlan: (w: string, b?: number) => mockGenerate(w, b),
  fetchInstructions: (id: string) => mockFetchInstructions(id),
  currentWeekStart: () => "2026-08-03",
}));
jest.mock("@/lib/billing", () => ({
  fetchBillingStatus: () => mockBillingStatus(),
}));

import MealPlan from "../meal-plan";

/** Une entrée de plan. `instructions` est vide à la génération : la
 * préparation est désormais rédigée à la première ouverture. */
function entry(over: Record<string, unknown> = {}) {
  return {
    day: "2026-08-03",
    slot: "dinner",
    recipe_id: "rec-1",
    recipe: {
      title: "Poulet rôti riz brocoli",
      prep_time_min: 25,
      servings: 2,
      ingredients: [{ name: "poulet", quantity: 500, unit: "g" }],
      steps: [],
      uses_inventory: [],
      instructions: "",
    },
    ...over,
  };
}

function plan(entries: unknown[]) {
  return {
    id: "plan-1",
    week_start: "2026-08-03",
    budget_target: 60,
    estimated_cost: 55,
    entries,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerate.mockResolvedValue(plan([entry()]));
  mockFetchInstructions.mockResolvedValue("1. Rôtir le poulet 25 min à 200 °C.");
  mockBillingStatus.mockResolvedValue({ plan: "premium" });
});

// ── Le plan de repas est réservé au Premium ───────────────────────
test("un compte gratuit voit l'offre, pas le bouton", async () => {
  mockBillingStatus.mockResolvedValue({ plan: "free" });

  const { findByText, queryByText } = render(<MealPlan />);

  await findByText(/Découvrir Premium/);
  expect(queryByText("Générer ma semaine")).toBeNull();
  expect(mockGenerate).not.toHaveBeenCalled();
}, 20000);

test("si le palier est inconnu, l'écran reste utilisable", async () => {
  // API endormie ou hors ligne : mieux vaut laisser essayer — le serveur
  // refusera de toute façon (402) si le palier ne le permet pas.
  mockBillingStatus.mockRejectedValue(new Error("hors ligne"));

  const { findByText } = render(<MealPlan />);
  await findByText("Générer ma semaine");
}, 20000);

test("génère la semaine avec le coût et les recettes", async () => {
  const { getByText, findByText } = render(<MealPlan />);

  fireEvent.press(getByText("Générer ma semaine"));

  await findByText("Poulet rôti riz brocoli");
  await findByText(/Coût estimé : 55/);
  await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith("2026-08-03", undefined));
}, 20000);

test("la préparation n'est demandée qu'à l'ouverture de la recette", async () => {
  const { getByText, findByText } = render(<MealPlan />);
  fireEvent.press(getByText("Générer ma semaine"));
  await findByText("Poulet rôti riz brocoli");

  // Rien n'a été demandé tant que le créneau est replié.
  expect(mockFetchInstructions).not.toHaveBeenCalled();

  fireEvent.press(getByText("Poulet rôti riz brocoli"));

  await findByText("1. Rôtir le poulet 25 min à 200 °C.");
  expect(mockFetchInstructions).toHaveBeenCalledWith("rec-1");
}, 20000);

test("une recette rouverte ne relance pas d'appel", async () => {
  const { getByText, findByText } = render(<MealPlan />);
  fireEvent.press(getByText("Générer ma semaine"));
  await findByText("Poulet rôti riz brocoli");

  fireEvent.press(getByText("Poulet rôti riz brocoli")); // ouvre
  await findByText("1. Rôtir le poulet 25 min à 200 °C.");
  fireEvent.press(getByText("Poulet rôti riz brocoli")); // referme
  fireEvent.press(getByText("Poulet rôti riz brocoli")); // rouvre

  await findByText("1. Rôtir le poulet 25 min à 200 °C.");
  expect(mockFetchInstructions).toHaveBeenCalledTimes(1);
}, 20000);

test("une recette déjà rédigée côté serveur n'est pas redemandée", async () => {
  mockGenerate.mockResolvedValue(
    plan([entry({ recipe: { ...entry().recipe, instructions: "1. Déjà écrite." } })])
  );

  const { getByText, findByText } = render(<MealPlan />);
  fireEvent.press(getByText("Générer ma semaine"));
  await findByText("Poulet rôti riz brocoli");
  fireEvent.press(getByText("Poulet rôti riz brocoli"));

  await findByText("1. Déjà écrite.");
  expect(mockFetchInstructions).not.toHaveBeenCalled();
}, 20000);

test("un échec de rédaction est signalé sans casser le plan", async () => {
  mockFetchInstructions.mockRejectedValue(new Error("Limite atteinte : 15 recettes par jour."));

  const { getByText, findByText } = render(<MealPlan />);
  fireEvent.press(getByText("Générer ma semaine"));
  await findByText("Poulet rôti riz brocoli");
  fireEvent.press(getByText("Poulet rôti riz brocoli"));

  await findByText("Limite atteinte : 15 recettes par jour.");
  // Le reste du plan reste consultable.
  expect(getByText("Poulet rôti riz brocoli")).toBeTruthy();
}, 20000);
