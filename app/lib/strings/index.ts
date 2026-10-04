/**
 * Les textes de l'app, une langue par fichier.
 *
 * Le français est la référence : `Key` en dérive, donc toute clé ajoutée
 * là-bas doit être traduite partout sinon la compilation échoue.
 */
import { fr } from "./fr";
import { en } from "./en";
import { es } from "./es";
import { pt } from "./pt";
import { it } from "./it";
import { de } from "./de";
import { ar } from "./ar";

export type Key = keyof typeof fr;

export const STRINGS = { fr, en, es, pt, it, de, ar } as const;
