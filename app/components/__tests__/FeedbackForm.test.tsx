import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockSend = jest.fn();
const mockHasGiven = jest.fn();

jest.mock("@/lib/feedback", () => ({
  sendFeedback: (f: unknown) => mockSend(f),
  hasGivenFeedback: () => mockHasGiven(),
}));

import { FeedbackForm } from "../FeedbackForm";

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue(undefined);
  mockHasGiven.mockResolvedValue(false);
});

async function openForm(getByText: (t: string) => any, findByText: (t: string) => Promise<any>) {
  fireEvent.press(getByText("Donner mon avis"));
  await findByText("Ton avis");
}

test("le formulaire est replié au départ", async () => {
  const { getByText, queryByText } = render(<FeedbackForm />);
  expect(getByText("Donner mon avis")).toBeTruthy();
  expect(queryByText("Ton avis")).toBeNull();
}, 20000);

test("envoie la note et les deux réponses", async () => {
  const { getByText, getByPlaceholderText, findByText, getByLabelText } = render(
    <FeedbackForm />
  );
  await openForm(getByText, findByText);

  fireEvent.press(getByLabelText("Mettre la note de 4 sur 5"));
  fireEvent.changeText(getByPlaceholderText("Qu'est-ce qui t'a plu ?"), "Le scan photo");
  fireEvent.changeText(
    getByPlaceholderText("Qu'est-ce qui t'a manqué ou agacé ?"),
    "Trop lent"
  );
  fireEvent.press(getByText("Envoyer"));

  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledWith({
      rating: 4,
      liked: "Le scan photo",
      missing: "Trop lent",
    })
  );
  await findByText("Merci — c'est noté.");
}, 20000);

test("sans note, l'envoi est bloqué", async () => {
  const { getByText, findByText } = render(<FeedbackForm />);
  await openForm(getByText, findByText);

  // Le bouton annonce ce qui manque plutôt que d'échouer après coup.
  fireEvent.press(getByText("Choisis une note"));
  expect(mockSend).not.toHaveBeenCalled();
}, 20000);

test("un avis sans commentaire reste valable", async () => {
  const { getByText, findByText, getByLabelText } = render(<FeedbackForm />);
  await openForm(getByText, findByText);

  fireEvent.press(getByLabelText("Mettre la note de 5 sur 5"));
  fireEvent.press(getByText("Envoyer"));

  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledWith({ rating: 5, liked: "", missing: "" })
  );
}, 20000);

test("un échec d'envoi ne fait pas perdre ce qui a été écrit", async () => {
  mockSend.mockRejectedValue(new Error("Hors ligne"));

  const { getByText, getByPlaceholderText, findByText, getByLabelText, queryByText } =
    render(<FeedbackForm />);
  await openForm(getByText, findByText);

  fireEvent.press(getByLabelText("Mettre la note de 2 sur 5"));
  fireEvent.changeText(getByPlaceholderText("Qu'est-ce qui t'a plu ?"), "Les couleurs");
  fireEvent.press(getByText("Envoyer"));

  await findByText("Hors ligne");
  // Le formulaire reste ouvert avec la saisie intacte : réécrire son avis
  // après un échec réseau, personne ne le fait deux fois.
  expect(getByPlaceholderText("Qu'est-ce qui t'a plu ?").props.value).toBe("Les couleurs");
  expect(queryByText("Merci — c'est noté.")).toBeNull();
}, 20000);

test("propose un nouvel avis à qui en a déjà laissé un", async () => {
  mockHasGiven.mockResolvedValue(true);
  const { findByText } = render(<FeedbackForm />);
  await findByText("Donner un nouvel avis");
}, 20000);
