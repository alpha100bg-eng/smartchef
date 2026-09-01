/**
 * Garder une recette — sans cela, une recette trouvée est perdue à la
 * fermeture de l'écran et coûte une nouvelle recherche IA pour la retrouver.
 */
const mockInsert = jest.fn();
const mockSelectSingle = jest.fn();
const mockDelete = jest.fn();
const mockSelectList = jest.fn();
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } });

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => ({
      insert: (rows: unknown) => {
        const res = mockInsert(table, rows);
        return {
          select: () => ({ single: () => mockSelectSingle() }),
          then: (r: any) => r(res ?? { error: null }),
        };
      },
      select: () => ({ order: () => mockSelectList() }),
      delete: () => ({ eq: (_c: string, v: string) => mockDelete(table, v) }),
    }),
  },
}));

import {
  deleteSavedRecipe,
  listSavedRecipes,
  saveRecipe,
} from "../saved-recipes";
import type { Recipe } from "../search";

const RECIPE: Recipe = {
  title: "Omelette aux herbes",
  teaser: "Rapide et de saison",
  prep_time_min: 10,
  servings: 2,
  uses_inventory: ["œufs", "persil"],
  ingredients: [
    { name: "œufs", quantity: 4, unit: "pièce" },
    { name: "persil", quantity: 1, unit: null },
  ],
  steps: ["Battre les œufs.", "Cuire 3 minutes."],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockReturnValue({ error: null });
  mockSelectSingle.mockResolvedValue({ data: { id: "r1" }, error: null });
  mockDelete.mockResolvedValue({ error: null });
});

describe("saveRecipe", () => {
  test("enregistre la recette et ses ingrédients", async () => {
    const id = await saveRecipe(RECIPE);

    expect(id).toBe("r1");
    const [table, row] = mockInsert.mock.calls[0];
    expect(table).toBe("recipes");
    expect(row.title).toBe("Omelette aux herbes");
    expect(row.profile_id).toBe("u1");

    const [ingTable, ingRows] = mockInsert.mock.calls[1];
    expect(ingTable).toBe("recipe_ingredients");
    expect(ingRows).toHaveLength(2);
    expect(ingRows[0].recipe_id).toBe("r1");
  });

  test("les étapes survivent à l'aller-retour", async () => {
    await saveRecipe(RECIPE);
    const stored = mockInsert.mock.calls[0][1].instructions;

    mockSelectList.mockResolvedValue({
      data: [
        {
          id: "r1",
          title: RECIPE.title,
          instructions: stored,
          prep_time_min: 10,
          servings: 2,
          created_at: "2026-03-10",
          recipe_ingredients: [],
        },
      ],
      error: null,
    });

    const [back] = await listSavedRecipes();
    expect(back.steps).toEqual(["Battre les œufs.", "Cuire 3 minutes."]);
  });

  test("une recette sans ingrédient n'écrit pas de ligne vide", async () => {
    await saveRecipe({ ...RECIPE, ingredients: [] });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  test("si les ingrédients échouent, la recette n'est pas laissée en coquille", async () => {
    mockInsert.mockImplementation((table: string) =>
      table === "recipe_ingredients" ? { error: new Error("boom") } : { error: null }
    );

    await expect(saveRecipe(RECIPE)).rejects.toThrow();
    expect(mockDelete).toHaveBeenCalledWith("recipes", "r1");
  });
});

describe("listSavedRecipes", () => {
  test("relit une préparation saisie ligne par ligne", async () => {
    // Format antérieur ou saisie manuelle : ne doit pas casser l'affichage.
    mockSelectList.mockResolvedValue({
      data: [
        {
          id: "r2",
          title: "Soupe",
          instructions: "Éplucher.\nMixer.",
          prep_time_min: null,
          servings: null,
          created_at: "2026-03-09",
          recipe_ingredients: [{ name: "poireau", quantity: 2, unit: null }],
        },
      ],
      error: null,
    });

    const [r] = await listSavedRecipes();
    expect(r.steps).toEqual(["Éplucher.", "Mixer."]);
    expect(r.ingredients).toHaveLength(1);
  });

  test("une préparation absente donne une liste vide, pas un plantage", async () => {
    mockSelectList.mockResolvedValue({
      data: [
        {
          id: "r3",
          title: "Vide",
          instructions: null,
          prep_time_min: null,
          servings: null,
          created_at: "2026-03-08",
          recipe_ingredients: null,
        },
      ],
      error: null,
    });

    const [r] = await listSavedRecipes();
    expect(r.steps).toEqual([]);
    expect(r.ingredients).toEqual([]);
  });

  test("remonte l'erreur de lecture", async () => {
    mockSelectList.mockResolvedValue({ data: null, error: new Error("RLS") });
    await expect(listSavedRecipes()).rejects.toThrow();
  });
});

test("deleteSavedRecipe supprime par identifiant", async () => {
  await deleteSavedRecipe("r9");
  expect(mockDelete).toHaveBeenCalledWith("recipes", "r9");
});
