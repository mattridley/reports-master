import { describe, expect, it } from "vitest";
import { expandPronounTokens } from "../src/lib/pronouns";

describe("expandPronounTokens", () => {
  it("expands singular grammar tokens", () => {
    const text = expandPronounTokens("{name} {is_are} focused and {has_have} improved.", {
      id: "she-her",
      label: "she/her",
      subject: "she",
      object: "her",
      possessive: "her",
      reflexive: "herself",
      isPlural: false
    }, "Ava Patel");
    expect(text).toBe("Ava Patel is focused and has improved.");
  });

  it("expands plural grammar tokens", () => {
    const text = expandPronounTokens("{they} {is_are} confident in {their} work.", {
      id: "they-them",
      label: "they/them",
      subject: "they",
      object: "them",
      possessive: "their",
      reflexive: "themself",
      isPlural: true
    }, "Sam Lee");
    expect(text).toBe("they are confident in their work.");
  });
});
