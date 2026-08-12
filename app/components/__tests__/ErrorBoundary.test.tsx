import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { ErrorBoundary } from "../ErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("rendu impossible");
}

test("shows a recovery screen instead of a blank app when a child throws", () => {
  // React logs the caught error; silence it so the run stays readable.
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});

  const { getByText } = render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );

  getByText("Quelque chose s'est mal passé");
  getByText("Réessayer");

  spy.mockRestore();
});

test("renders children normally when nothing throws", () => {
  const { getByText } = render(
    <ErrorBoundary>
      <Text>contenu normal</Text>
    </ErrorBoundary>
  );
  getByText("contenu normal");
});
