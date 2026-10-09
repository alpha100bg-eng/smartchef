import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockCapture = jest.fn().mockResolvedValue("profileA/x.jpg");
const mockDetect = jest.fn().mockResolvedValue([
  { name: "lait", quantity: 1, unit: "L", brand: null, expiry_date: null, confidence: 0.9 },
]);
const mockSave = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/inventory", () => ({
  captureAndUpload: () => mockCapture(),
  detectFromPhoto: (p: string) => mockDetect(p),
  saveItems: (items: unknown) => mockSave(items),
  deletePhoto: (p: string) => mockDelete(p),
  toReviewItem: (d: any) => ({
    name: d.name ?? "",
    quantity: d.quantity != null ? String(d.quantity) : "",
    unit: d.unit ?? "",
    brand: d.brand ?? "",
    expiry_date: d.expiry_date ?? "",
    confidence: d.confidence,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [] }) }),
    }),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  },
}));

import Inventory from "../inventory";

test("scan → review → validate saves items and deletes the photo", async () => {
  const { getByText, findByText } = render(<Inventory />);

  fireEvent.press(getByText("Scanner mon frigo"));

  // review screen appears with the detected item
  await findByText("1 aliment détecté");

  fireEvent.press(getByText("Valider et ajouter à l'inventaire"));

  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockDelete).toHaveBeenCalledWith("profileA/x.jpg");
}, 20000);

test("la photo est supprimee meme quand la detection echoue", async () => {
  // Le cas qui fuyait : la photo n'était effacée qu'à la validation de
  // l'inventaire. Un scan refusé — quota mensuel atteint, service
  // indisponible — la laissait indéfiniment dans le stockage. C'est la
  // panne la plus banale du parcours : le 4e scan du mois en gratuit.
  mockDelete.mockClear();
  mockDetect.mockRejectedValueOnce(
    new Error("Tu as utilisé tes 3 scans du mois.")
  );

  const { getByText, findByText } = render(<Inventory />);
  fireEvent.press(getByText("Scanner mon frigo"));

  // Le refus est montré à l'utilisateur…
  await findByText("Tu as utilisé tes 3 scans du mois.");
  // …et la photo n'est pas restée derrière.
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("profileA/x.jpg"));
}, 20000);

test("un echec de suppression ne masque pas l'erreur de scan", async () => {
  // La suppression est du ménage : si elle échoue aussi, l'utilisateur doit
  // quand même lire ce qu'il peut traiter, pas une erreur de stockage.
  mockDetect.mockRejectedValueOnce(new Error("Le service n'a pas répondu."));
  mockDelete.mockRejectedValueOnce(new Error("storage unreachable"));

  const { getByText, findByText } = render(<Inventory />);
  fireEvent.press(getByText("Scanner mon frigo"));

  await findByText("Le service n'a pas répondu.");
}, 20000);
