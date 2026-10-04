import { normalize, sameFood } from "../normalize";

// Jumeau de api/tests/test_text_match.py et test_text_match_en.py — les trois
// doivent s'accorder.
//
// La langue est passée explicitement : sans cela ces tests dépendraient de
// `navigator.language` de l'environnement de test, et basculeraient en
// silence le jour où il change.

describe("français", () => {
  test("casse, accents et pluriels simples", () => {
    expect(normalize("Tomates", "fr")).toBe("tomate");
    expect(normalize("OIGNONS", "fr")).toBe("oignon");
    expect(normalize("  Poivron   Rouge ", "fr")).toBe("poivron rouge");
  });

  test("les invariables sont laissés tels quels", () => {
    expect(normalize("riz", "fr")).toBe("riz");
    expect(normalize("ananas", "fr")).toBe("ananas");
    expect(normalize("jus", "fr")).toBe("jus");
  });

  test("-eaux avant -aux", () => {
    expect(normalize("gâteaux", "fr")).toBe("gateau");
    expect(normalize("chevaux", "fr")).toBe("cheval");
  });

  test("ne rapproche que les paires évidentes", () => {
    expect(sameFood("Tomates", "tomate", "fr")).toBe(true);
    expect(sameFood("lait", "lait d'amande", "fr")).toBe(false);
    expect(sameFood("", "tomate", "fr")).toBe(false);
  });
});

describe("anglais", () => {
  test.each([
    ["tomatoes", "tomato"],
    ["potatoes", "potato"],
    ["berries", "berry"],
    ["boxes", "box"],
    ["dishes", "dish"],
    ["carrots", "carrot"],
    ["leaves", "leaf"],
    ["knives", "knife"],
  ])("%s → %s", (pluriel, singulier) => {
    expect(normalize(pluriel, "en")).toBe(normalize(singulier, "en"));
  });

  test("les invariables sont laissés tels quels", () => {
    for (const mot of ["rice", "fish", "bread", "pasta", "lettuce"]) {
      expect(normalize(mot, "en")).toBe(mot);
    }
  });

  test("un double s n'est pas une marque de pluriel", () => {
    // Retirer le « s » de « glass » casserait toute correspondance.
    expect(normalize("glass", "en")).toBe("glass");
    expect(normalize("grass", "en")).toBe("grass");
  });

  test("ne rapproche que les paires évidentes", () => {
    expect(sameFood("Tomatoes", "tomato", "en")).toBe(true);
    expect(sameFood("almond milk", "milk", "en")).toBe(false);
  });
});

describe("espagnol", () => {
  test.each([
    ["tomates", "tomate"],
    ["patatas", "patata"],
    ["naranjas", "naranja"],
    ["huevos", "huevo"],
    ["carnes", "carne"],
    ["limones", "limon"],
    ["panes", "pan"],
    ["nueces", "nuez"],
  ])("%s → %s", (pluriel, singulier) => {
    expect(normalize(pluriel, "es")).toBe(normalize(singulier, "es"));
  });

  test("la paire ambigue panes / carnes", () => {
    // Memes lettres finales, singuliers differents : aucune regle ne tranche.
    expect(normalize("panes", "es")).toBe("pan");
    expect(normalize("carnes", "es")).toBe("carne");
  });

  test("les invariables sont laisses tels quels", () => {
    for (const mot of ["arroz", "cuscus", "anis", "maiz"]) {
      expect(normalize(mot, "es")).toBe(mot);
    }
  });

  test("les accents convergent", () => {
    expect(normalize("limón", "es")).toBe(normalize("limones", "es"));
  });
});

describe("portugais", () => {
  test.each([
    ["tomates", "tomate"], ["bananas", "banana"], ["ovos", "ovo"],
    ["limoes", "limao"], ["paes", "pao"], ["flores", "flor"],
  ])("%s → %s", (p, s) => {
    expect(normalize(p, "pt")).toBe(normalize(s, "pt"));
  });
});

describe("italien", () => {
  test.each([
    ["pomodori", "pomodoro"], ["patate", "patata"], ["carote", "carota"],
    ["funghi", "fungo"], ["pani", "pane"], ["pesci", "pesce"],
  ])("%s → %s", (p, s) => {
    expect(normalize(p, "it")).toBe(normalize(s, "it"));
  });

  test("les singuliers en -e sont proteges", () => {
    // Sans protection, la regle -e → -a ferait « pesca », « carna ».
    for (const mot of ["pesce", "carne", "latte", "pane"]) {
      expect(normalize(mot, "it")).toBe(mot);
    }
  });
});

describe("allemand", () => {
  test.each([
    ["Tomaten", "Tomate"], ["Zwiebeln", "Zwiebel"],
    ["Kartoffeln", "Kartoffel"], ["Bananen", "Banane"], ["Eier", "Ei"],
  ])("%s → %s", (p, s) => {
    expect(normalize(p, "de")).toBe(normalize(s, "de"));
  });

  test("les tremas convergent sans regle", () => {
    expect(normalize("Äpfel", "de")).toBe(normalize("Apfel", "de"));
  });

  test("les diminutifs restent intacts", () => {
    expect(normalize("Hähnchen", "de")).toBe("hahnchen");
  });
});

describe("arabe", () => {
  test("l'article defini est retire", () => {
    // « الطماطم » et « طماطم » designent la meme tomate.
    expect(normalize("الطماطم", "ar")).toBe(normalize("طماطم", "ar"));
  });

  test("les formes de l'alef sont unifiees", () => {
    expect(normalize("أرز", "ar")).toBe(normalize("ارز", "ar"));
  });

  test("les diacritiques sont retires", () => {
    expect(normalize("خُبْز", "ar")).toBe(normalize("خبز", "ar"));
  });

  test("aucune regle de pluriel n'est inventee", () => {
    // Les pluriels brises changent l'interieur du mot : on ne touche a rien.
    expect(normalize("كتب", "ar")).toBe("كتب");
    expect(normalize("كتاب", "ar")).toBe("كتاب");
  });
});

test("chaque langue casserait les mots de l'autre", () => {
  // La raison d'être du découpage par langue.
  expect(normalize("potatoes", "fr")).not.toBe(normalize("potato", "fr"));
  expect(normalize("potatoes", "en")).toBe(normalize("potato", "en"));
  expect(normalize("gâteaux", "fr")).toBe(normalize("gâteau", "fr"));
  expect(normalize("nueces", "es")).toBe("nuez");
  expect(normalize("nueces", "fr")).not.toBe("nuez");
});
