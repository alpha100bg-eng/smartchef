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
