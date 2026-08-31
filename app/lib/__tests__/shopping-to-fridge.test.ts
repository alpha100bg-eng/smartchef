/**
 * « J'ai fait mes courses » — les articles cochés rejoignent l'inventaire.
 *
 * Symétrique de « J'ai cuisiné ça ». Sans ce chemin, le frigo ne se remplit
 * que par photo et dérive de la réalité dès la première semaine.
 */
// Préfixe `mock` obligatoire : jest.mock est hissé au-dessus des déclarations,
// et seules ces variables-là sont autorisées dans la fabrique.
const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
const mockApiFetch = jest.fn();
const mockNotify = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({ insert: (rows: unknown) => mockInsert(rows) }),
  },
}));
jest.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock("@/lib/urgent-count", () => ({
  notifyInventoryChanged: () => mockNotify(),
}));

import { addBoughtToFridge, type ShoppingItem } from "../shopping";

function item(over: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: "x",
    name: "lait",
    quantity: 1,
    unit: "L",
    aisle: "Produits laitiers",
    estimated_price: 1.2,
    checked: false,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({ expiry_dates: { lait: "2026-03-17", sel: null } });
});

test("n'ajoute que les articles cochés", async () => {
  const n = await addBoughtToFridge([
    item({ name: "lait", checked: true }),
    item({ name: "pain", checked: false }),
  ]);

  expect(n).toBe(1);
  const rows = mockInsert.mock.calls[0][0];
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("lait");
});

test("attache la date de péremption estimée", async () => {
  await addBoughtToFridge([item({ name: "lait", checked: true })]);
  expect(mockInsert.mock.calls[0][0][0].expiry_date).toBe("2026-03-17");
});

test("un aliment non périssable entre sans date", async () => {
  await addBoughtToFridge([item({ name: "sel", checked: true })]);
  expect(mockInsert.mock.calls[0][0][0].expiry_date).toBeNull();
});

test("un nom absent de la réponse entre sans date inventée", async () => {
  mockApiFetch.mockResolvedValue({ expiry_dates: {} });
  await addBoughtToFridge([item({ name: "safran", checked: true })]);
  expect(mockInsert.mock.calls[0][0][0].expiry_date).toBeNull();
});

test("si l'estimation échoue, les courses sont quand même rangées", async () => {
  // Quota atteint, réseau coupé : perdre les courses serait bien pire que
  // les ranger sans date.
  mockApiFetch.mockRejectedValue(new Error("429"));

  const n = await addBoughtToFridge([item({ name: "lait", checked: true })]);

  expect(n).toBe(1);
  expect(mockInsert.mock.calls[0][0][0].expiry_date).toBeNull();
});

test("ne demande chaque nom qu'une fois", async () => {
  await addBoughtToFridge([
    item({ id: "a", name: "lait", checked: true }),
    item({ id: "b", name: "lait", checked: true }),
  ]);
  const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
  expect(body.names).toEqual(["lait"]);
  // Les deux lignes sont bien ajoutées, elles partagent juste l'estimation.
  expect(mockInsert.mock.calls[0][0]).toHaveLength(2);
});

test("rien de coché : aucun appel réseau", async () => {
  const n = await addBoughtToFridge([item({ checked: false })]);
  expect(n).toBe(0);
  expect(mockApiFetch).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
});

test("prévient la pastille d'onglet", async () => {
  await addBoughtToFridge([item({ name: "lait", checked: true })]);
  expect(mockNotify).toHaveBeenCalled();
});

test("une écriture en échec remonte l'erreur", async () => {
  mockInsert.mockResolvedValueOnce({ error: new Error("RLS") });
  await expect(
    addBoughtToFridge([item({ name: "lait", checked: true })])
  ).rejects.toThrow();
});
