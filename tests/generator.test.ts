import { describe, expect, it } from "vitest";
import { generateReports, getStudentSubjectScore } from "../src/lib/generator";
import { initialState } from "../src/lib/storage";

describe("generateReports", () => {
  it("skips edited drafts by default", () => {
    const classId = "c1";
    const studentId = "s1";
    const state = {
      ...initialState,
      classes: [{ id: classId, yearGroup: "Year 7", subject: "English", subjects: ["English"], className: "7A" }],
      students: [{
        id: studentId,
        classId,
        firstName: "Ava",
        lastName: "Patel",
        pronounSetId: "she-her",
        subjectScores: [{ classId, subject: "English", effortScore: "1", attainmentScore: "Expected" }],
        effortScore: "1",
        attainmentScore: "Expected"
      }],
      statements: [
        { id: "e1", yearGroup: "Year 7", subject: "English", scoreType: "effort" as const, scoreLabel: "1", statementText: "{name} {has_have} worked well." },
        { id: "a1", yearGroup: "Year 7", subject: "English", scoreType: "attainment" as const, scoreLabel: "Expected", statementText: "{they} {is_are} secure." }
      ],
      drafts: [{
        id: "d1",
        classId,
        studentId,
        generatedText: "Old",
        editedText: "Teacher edit",
        mode: "rule" as const,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }]
    };

    const result = generateReports(state, { classId, mode: "rule", overwritePolicy: "skipEdited" });
    expect(result.drafts[0].editedText).toBe("Teacher edit");
    expect(result.warnings[0]).toContain("skipped");
  });

  it("matches subject scores by both class and subject", () => {
    const score = getStudentSubjectScore({
      id: "s1",
      classId: "c1",
      firstName: "Ava",
      lastName: "Patel",
      pronounSetId: "she-her",
      effortScore: "legacy",
      attainmentScore: "legacy",
      subjectScores: [
        { classId: "c1", subject: "English", effortScore: "1", attainmentScore: "Expected" },
        { classId: "c1", subject: "Maths", effortScore: "2", attainmentScore: "Above" }
      ]
    }, "c1", "Maths");
    expect(score.effortScore).toBe("2");
  });

  it("treats blank required statements as missing during generation", () => {
    const classId = "c1";
    const studentId = "s1";
    const state = {
      ...initialState,
      classes: [{ id: classId, yearGroup: "Year 7", subject: "English", subjects: ["English"], className: "7A" }],
      students: [{
        id: studentId,
        classId,
        firstName: "Ava",
        lastName: "Patel",
        pronounSetId: "she-her",
        subjectScores: [{ classId, subject: "English", effortScore: "1", attainmentScore: "Expected" }],
        effortScore: "1",
        attainmentScore: "Expected"
      }],
      statements: [
        { id: "e1", yearGroup: "Year 7", subject: "English", scoreType: "effort" as const, scoreLabel: "1", statementText: "" },
        { id: "a1", yearGroup: "Year 7", subject: "English", scoreType: "attainment" as const, scoreLabel: "Expected", statementText: "{they} {is_are} secure." }
      ]
    };

    const result = generateReports(state, { classId, mode: "rule", overwritePolicy: "skipEdited" });

    expect(result.warnings).toContain("Missing effort statement for Year 7 English 1.");
  });
});
