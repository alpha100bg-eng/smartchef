import { normalize, sameFood } from "../normalize";

// Mirrors api/tests/test_text_match.py — the two must agree.

test("normalises case, accents and plain plurals", () => {
  expect(normalize("Tomates")).toBe("tomate");
  expect(normalize("OIGNONS")).toBe("oignon");
  expect(normalize("  Poivron   Rouge ")).toBe("poivron rouge");
});

test("leaves French invariables alone", () => {
  expect(normalize("riz")).toBe("riz");
  expect(normalize("ananas")).toBe("ananas");
  expect(normalize("jus")).toBe("jus");
});

test("handles -eaux before -aux", () => {
  expect(normalize("gâteaux")).toBe("gateau");
  expect(normalize("chevaux")).toBe("cheval");
});

test("matches only obvious pairs", () => {
  expect(sameFood("Tomates", "tomate")).toBe(true);
  expect(sameFood("RIZ", "riz")).toBe(true);
  // Variants must NOT match — removing the wrong food is worse than missing one.
  expect(sameFood("lait", "lait d'amande")).toBe(false);
  expect(sameFood("oignon", "oignon nouveau")).toBe(false);
});
