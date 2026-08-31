import {
  countUrgent,
  daysLeft,
  expiryLabel,
  sortByUrgency,
  urgency,
} from "../expiry";

// Milieu d'après-midi : vérifie que l'heure ne décale pas le comptage en jours.
const NOW = new Date(2026, 2, 10, 15, 30);

describe("daysLeft", () => {
  test("compte en jours calendaires, pas en heures", () => {
    // 23 h plus tard mais le lendemain : 1 jour, pas 0.
    expect(daysLeft("2026-03-11", NOW)).toBe(1);
    expect(daysLeft("2026-03-10", NOW)).toBe(0);
    expect(daysLeft("2026-03-08", NOW)).toBe(-2);
  });

  test("null quand la date manque ou est illisible", () => {
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft("", NOW)).toBeNull();
    expect(daysLeft("pas une date", NOW)).toBeNull();
  });
});

describe("urgency", () => {
  test.each([
    ["2026-03-05", "expired"],
    ["2026-03-10", "today"],
    ["2026-03-11", "soon"],
    ["2026-03-13", "soon"],
    ["2026-03-14", "ok"],
    [null, "unknown"],
  ])("%s -> %s", (date, expected) => {
    expect(urgency(date as string | null, NOW)).toBe(expected);
  });
});

describe("expiryLabel", () => {
  test("phrase lisible pour ce qui presse", () => {
    expect(expiryLabel("2026-03-10", NOW)).toBe("à consommer aujourd'hui");
    expect(expiryLabel("2026-03-11", NOW)).toBe("demain");
    expect(expiryLabel("2026-03-12", NOW)).toBe("dans 2 jours");
    expect(expiryLabel("2026-03-09", NOW)).toBe("périmé d'hier");
    expect(expiryLabel("2026-03-07", NOW)).toBe("périmé depuis 3 j");
  });

  test("rien à dire au-delà du seuil — la liste reste lisible", () => {
    expect(expiryLabel("2026-04-30", NOW)).toBeNull();
    expect(expiryLabel(null, NOW)).toBeNull();
  });
});

describe("sortByUrgency", () => {
  test("le plus urgent d'abord, les sans-date en dernier", () => {
    const items = [
      { name: "moutarde", expiry_date: null },
      { name: "carottes", expiry_date: "2026-03-25" },
      { name: "poulet", expiry_date: "2026-03-08" },
      { name: "salade", expiry_date: "2026-03-11" },
    ];
    expect(sortByUrgency(items, NOW).map((i) => i.name)).toEqual([
      "poulet",
      "salade",
      "carottes",
      "moutarde",
    ]);
  });

  test("ne modifie pas le tableau d'origine", () => {
    const items = [
      { name: "b", expiry_date: "2026-03-20" },
      { name: "a", expiry_date: "2026-03-11" },
    ];
    sortByUrgency(items, NOW);
    expect(items.map((i) => i.name)).toEqual(["b", "a"]);
  });
});

describe("countUrgent", () => {
  test("compte le périmé, le jour même et les trois jours suivants", () => {
    const items = [
      { expiry_date: "2026-03-08" }, // périmé
      { expiry_date: "2026-03-10" }, // aujourd'hui
      { expiry_date: "2026-03-13" }, // dans 3 jours
      { expiry_date: "2026-03-14" }, // hors seuil
      { expiry_date: null }, // sans date
    ];
    expect(countUrgent(items, NOW)).toBe(3);
  });

  test("zéro sur un frigo vide", () => {
    expect(countUrgent([], NOW)).toBe(0);
  });
});
