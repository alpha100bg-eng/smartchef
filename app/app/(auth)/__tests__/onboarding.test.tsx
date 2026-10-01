/**
 * Accueil d'un nouvel inscrit.
 *
 * L'ancienne version demandait cinq champs libres avant d'avoir rien montré :
 * sur les trois premiers comptes, deux ne sont jamais allés plus loin. Ces
 * tests verrouillent le principe inverse — montrer d'abord, et ne demander
 * que ce qui ne peut pas attendre.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockReplace = jest.fn();
const mockGetUser = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => ({
      update: (patch: unknown) => ({ eq: () => mockUpdate(table, patch) }),
      insert: (rows: unknown) => mockInsert(table, rows),
    }),
  },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

import Onboarding from "../onboarding";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mockUpdate.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
});

/** Passe l'écran de bienvenue pour atteindre la question. */
function allerAuxQuestions(getByText: (t: string) => any) {
  fireEvent.press(getByText("C'est parti"));
}

test("l'essai est annoncé avant toute demande", () => {
  const { getByText, queryByPlaceholderText } = render(<Onboarding />);

  expect(getByText("7 jours offerts")).toBeTruthy();
  expect(getByText(/sans carte bancaire/)).toBeTruthy();
  // Aucun champ à remplir sur ce premier écran.
  expect(queryByPlaceholderText(/Autre allergie/)).toBeNull();
}, 20000);

test("une seule question, et elle porte sur la sécurité", () => {
  const { getByText, queryByPlaceholderText } = render(<Onboarding />);
  allerAuxQuestions(getByText);

  expect(getByText("Une seule question")).toBeTruthy();
  expect(getByText("Des allergies ?")).toBeTruthy();
  // Les champs qui faisaient fuir ont disparu.
  expect(queryByPlaceholderText(/Budget hebdomadaire/)).toBeNull();
  expect(queryByPlaceholderText(/Temps par repas/)).toBeNull();
  expect(queryByPlaceholderText(/Objectifs/)).toBeNull();
}, 20000);

test("on peut entrer sans rien renseigner", async () => {
  const { getByText } = render(<Onboarding />);
  allerAuxQuestions(getByText);
  fireEvent.press(getByText("Scanner mon frigo"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(tabs)/inventory"));
  // Rien à enregistrer : aucune écriture inutile.
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
}, 20000);

test("le régime se choisit en un appui", async () => {
  const { getByText } = render(<Onboarding />);
  allerAuxQuestions(getByText);

  fireEvent.press(getByText("Végétarien"));
  fireEvent.press(getByText("Scanner mon frigo"));

  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith("profiles", { diet_type: "végétarien" })
  );
}, 20000);

test("les allergènes courants s'ajoutent sans faute de frappe", async () => {
  const { getByText } = render(<Onboarding />);
  allerAuxQuestions(getByText);

  fireEvent.press(getByText("Arachide"));
  fireEvent.press(getByText("Lactose"));
  fireEvent.press(getByText("Scanner mon frigo"));

  await waitFor(() => expect(mockInsert).toHaveBeenCalled());
  const [table, rows] = mockInsert.mock.calls[0];
  expect(table).toBe("allergies");
  expect(rows.map((r: any) => r.label)).toEqual(["Arachide", "Lactose"]);
}, 20000);

test("un allergène se retire d'un second appui", async () => {
  const { getByText } = render(<Onboarding />);
  allerAuxQuestions(getByText);

  fireEvent.press(getByText("Gluten"));
  fireEvent.press(getByText("Gluten"));
  fireEvent.press(getByText("Scanner mon frigo"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  expect(mockInsert).not.toHaveBeenCalled();
}, 20000);

test("les allergies libres complètent les choix", async () => {
  const { getByText, getByPlaceholderText } = render(<Onboarding />);
  allerAuxQuestions(getByText);

  fireEvent.press(getByText("Soja"));
  fireEvent.changeText(
    getByPlaceholderText("Autre allergie (séparées par une virgule)"),
    "céleri, moutarde"
  );
  fireEvent.press(getByText("Scanner mon frigo"));

  await waitFor(() => expect(mockInsert).toHaveBeenCalled());
  expect(mockInsert.mock.calls[0][1].map((r: any) => r.label)).toEqual([
    "Soja",
    "céleri",
    "moutarde",
  ]);
}, 20000);

test("une allergie non enregistrée bloque l'entrée", async () => {
  // Laisser passer silencieusement exposerait à une recette dangereuse.
  mockInsert.mockResolvedValue({ error: new Error("réseau") });

  const { getByText, findByText } = render(<Onboarding />);
  allerAuxQuestions(getByText);
  fireEvent.press(getByText("Arachide"));
  fireEvent.press(getByText("Scanner mon frigo"));

  await findByText("réseau");
  expect(mockReplace).not.toHaveBeenCalled();
}, 20000);
