import { describe, expect, it } from "vitest";
import { normalizeAppClasses } from "../src/lib/classes";
import { initialState } from "../src/lib/storage";

describe("normalizeAppClasses", () => {
  it("merges class records that only differ by subject", () => {
    const state = normalizeAppClasses({
      ...initialState,
      classes: [
        { id: "english", yearGroup: "Year 5", className: "5R", subject: "English", subjects: ["English"] },
        { id: "maths", yearGroup: "Year 5", className: "5R", subject: "Maths", subjects: ["Maths"] }
      ],
      students: [{
        id: "s1",
        classId: "maths",
        firstName: "Ava",
        lastName: "Patel",
        pronounSetId: "she-her",
        effortScore: "1",
        attainmentScore: "Expected",
        subjectScores: [{ classId: "maths", subject: "Maths", effortScore: "2", attainmentScore: "Above" }]
      }],
      drafts: [{
        id: "d1",
        studentId: "s1",
        classId: "maths",
        subject: "Maths",
        generatedText: "",
        editedText: "",
        mode: "rule",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }]
    });

    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].subjects).toEqual(["English", "Maths"]);
    expect(state.students[0].classId).toBe("english");
    expect(state.students[0].subjectScores?.[0].classId).toBe("english");
    expect(state.drafts[0].classId).toBe("english");
  });

  it("maintains a separate subject list from saved subjects and class assignments", () => {
    const state = normalizeAppClasses({
      ...initialState,
      subjects: ["Art"],
      classes: [
        { id: "c1", yearGroup: "Year 4", className: "4B", subject: "Maths", subjects: ["Maths", "English"] }
      ]
    });

    expect(state.subjects).toEqual(["Art", "Maths", "English"]);
  });
});
