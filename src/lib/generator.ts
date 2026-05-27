import { getClassSubjects } from "./classes";
import { expandPronounTokens } from "./pronouns";
import type {
  AppState,
  DraftReport,
  GenerationRequest,
  GenerationResult,
  StatementTemplate,
  StudentRecord
} from "./types";

export function generateReports(state: AppState, request: GenerationRequest): GenerationResult {
  if (request.mode === "ai") {
    throw new Error("AI generation must be run through generateAiReports so drafts can be reviewed before saving.");
  }

  const warnings: string[] = [];
  const classIds = request.classId === "all" ? state.classes.map((item) => item.id) : [request.classId];
  const drafts = [...state.drafts];

  for (const classId of classIds) {
    const classRecord = state.classes.find((item) => item.id === classId);
    if (!classRecord) {
      warnings.push(`Class ${classId} was not found.`);
      continue;
    }

    const students = state.students.filter((student) => student.classId === classId);
    for (const subject of getClassSubjects(classRecord)) {
      for (const student of students) {
        const existingIndex = drafts.findIndex(
          (draft) => draft.studentId === student.id && draft.classId === classId && draftSubject(draft, classRecord.subject) === subject
        );
        const existing = existingIndex >= 0 ? drafts[existingIndex] : undefined;
        const edited = existing && existing.editedText !== existing.generatedText;
        if (edited && request.overwritePolicy === "skipEdited") {
          warnings.push(`${student.firstName} ${student.lastName} ${subject} has teacher edits and was skipped.`);
          continue;
        }

        const text = buildRuleDraft(state, classRecord.yearGroup, subject, classId, student, warnings);
        const draft: DraftReport = {
          id: existing?.id ?? crypto.randomUUID(),
          studentId: student.id,
          classId,
          subject,
          generatedText: text,
          editedText: existing && edited && request.overwritePolicy === "replaceAll" ? text : existing?.editedText ?? text,
          mode: "rule",
          updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) drafts[existingIndex] = draft;
        else drafts.push(draft);
      }
    }
  }

  return { drafts, warnings };
}

function draftSubject(draft: DraftReport, fallback: string): string {
  return draft.subject ?? fallback;
}

export function buildRuleDraft(
  state: AppState,
  yearGroup: string,
  subject: string,
  classId: string,
  student: StudentRecord,
  warnings: string[]
): string {
  const pronouns = state.pronounSets.find((set) => set.id === student.pronounSetId) ?? state.pronounSets[0];
  const studentName = `${student.firstName} ${student.lastName}`;
  const scores = getStudentSubjectScore(student, classId, subject);
  const effort = findStatement(state.statements, yearGroup, subject, "effort", scores.effortScore);
  const attainment = findStatement(state.statements, yearGroup, subject, "attainment", scores.attainmentScore);

  if (!effort) warnings.push(`Missing effort statement for ${yearGroup} ${subject} ${scores.effortScore}.`);
  if (!attainment) warnings.push(`Missing attainment statement for ${yearGroup} ${subject} ${scores.attainmentScore}.`);

  return [effort?.statementText, attainment?.statementText]
    .filter(Boolean)
    .map((statement) => expandPronounTokens(statement!, pronouns, studentName))
    .join(" ");
}

export function getStudentSubjectScore(student: StudentRecord, classId: string, subject: string) {
  return (
    student.subjectScores?.find((score) => score.classId === classId && score.subject === subject) ?? {
      classId,
      subject,
      effortScore: student.effortScore,
      attainmentScore: student.attainmentScore
    }
  );
}

function findStatement(
  statements: StatementTemplate[],
  yearGroup: string,
  subject: string,
  scoreType: "effort" | "attainment",
  scoreLabel: string
): StatementTemplate | undefined {
  return statements.find(
    (statement) =>
      statement.yearGroup.toLowerCase() === yearGroup.toLowerCase() &&
      statement.subject.toLowerCase() === subject.toLowerCase() &&
      statement.scoreType === scoreType &&
      statement.scoreLabel === scoreLabel &&
      statement.statementText.trim()
  );
}
