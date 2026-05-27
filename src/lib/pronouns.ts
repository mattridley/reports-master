import type { PronounSet } from "./types";

export const defaultPronounSets: PronounSet[] = [
  {
    id: "he-him",
    label: "he/him",
    subject: "he",
    object: "him",
    possessive: "his",
    reflexive: "himself",
    isPlural: false
  },
  {
    id: "she-her",
    label: "she/her",
    subject: "she",
    object: "her",
    possessive: "her",
    reflexive: "herself",
    isPlural: false
  },
  {
    id: "they-them",
    label: "they/them",
    subject: "they",
    object: "them",
    possessive: "their",
    reflexive: "themself",
    isPlural: true
  },
  {
    id: "custom",
    label: "custom",
    subject: "they",
    object: "them",
    possessive: "their",
    reflexive: "themself",
    isPlural: true
  }
];

export function expandPronounTokens(text: string, pronouns: PronounSet, studentName: string): string {
  const replacements: Record<string, string> = {
    "{name}": studentName,
    "{they}": pronouns.subject,
    "{them}": pronouns.object,
    "{their}": pronouns.possessive,
    "{theirs}": pronouns.possessive,
    "{themself}": pronouns.reflexive,
    "{is_are}": pronouns.isPlural ? "are" : "is",
    "{was_were}": pronouns.isPlural ? "were" : "was",
    "{has_have}": pronouns.isPlural ? "have" : "has",
    "{does_do}": pronouns.isPlural ? "do" : "does",
    "{s}": pronouns.isPlural ? "" : "s"
  };

  return Object.entries(replacements).reduce(
    (draft, [token, value]) => draft.split(token).join(value),
    text
  );
}
