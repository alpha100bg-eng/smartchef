/**
 * Écran d'entrée.
 *
 * Un visiteur qui arrive d'un lien ne sait pas ce qu'est SmartChef. Lui
 * présenter « Email / Mot de passe » d'emblée le fait repartir : la page
 * d'accueil doit montrer le produit avant de demander un compte.
 */
import { fireEvent, render } from "@testing-library/react-native";

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockReplace = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (c: unknown) => mockSignIn(c),
      signUp: (c: unknown) => mockSignUp(c),
    },
  },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

import Login from "../login";

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockSignUp.mockResolvedValue({ error: null });
});

test("un visiteur voit ce que fait l'app, pas un formulaire", () => {
  const { getByText, queryByPlaceholderText } = render(<Login />);

  expect(getByText("Photographie ton frigo")).toBeTruthy();
  expect(getByText("Reçois des recettes")).toBeTruthy();
  expect(getByText("Ne rachète rien en double")).toBeTruthy();
  expect(queryByPlaceholderText("Mot de passe")).toBeNull();
}, 20000);

test("« Commencer gratuitement » ouvre la création de compte", () => {
  const { getByText, getByPlaceholderText } = render(<Login />);

  fireEvent.press(getByText("Commencer gratuitement"));

  expect(getByPlaceholderText("Mot de passe")).toBeTruthy();
  expect(getByText("Créer un compte")).toBeTruthy();
}, 20000);

test("un utilisateur qui revient atteint la connexion en un geste", () => {
  const { getByText, getByPlaceholderText } = render(<Login />);

  fireEvent.press(getByText("J'ai déjà un compte"));

  expect(getByPlaceholderText("Email")).toBeTruthy();
  expect(getByText("Se connecter")).toBeTruthy();
}, 20000);

test("on peut revenir à l'explication depuis le formulaire", () => {
  const { getByText, queryByPlaceholderText } = render(<Login />);

  fireEvent.press(getByText("J'ai déjà un compte"));
  fireEvent.press(getByText("← C'est quoi SmartChef ?"));

  expect(queryByPlaceholderText("Mot de passe")).toBeNull();
  expect(getByText("Commencer gratuitement")).toBeTruthy();
}, 20000);

test("la connexion appelle bien Supabase", async () => {
  const { getByText, getByPlaceholderText } = render(<Login />);

  fireEvent.press(getByText("J'ai déjà un compte"));
  fireEvent.changeText(getByPlaceholderText("Email"), "a@b.c");
  fireEvent.changeText(getByPlaceholderText("Mot de passe"), "secret");
  fireEvent.press(getByText("Se connecter"));

  expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "secret" });
}, 20000);
