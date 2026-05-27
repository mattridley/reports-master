import type { AppState, ClassRecord, SubjectTeacherAssignment, TeacherRecord } from "./types";

export function getClassSubjects(classRecord: ClassRecord): string[] {
  const subjects = classRecord.subjects !== undefined ? classRecord.subjects : [classRecord.subject];
  return unique(subjects.map((subject) => subject.trim()).filter(Boolean));
}

export function parseSubjects(value: string): string[] {
  return unique(value.split(",").map((subject) => subject.trim()).filter(Boolean));
}

export function primarySubject(subjects: string[]): string {
  return subjects[0] ?? "";
}

export function formatSubjects(classRecord: ClassRecord): string {
  return getClassSubjects(classRecord).join(", ");
}

export function allSubjects(classes: ClassRecord[]): string[] {
  return unique(classes.flatMap(getClassSubjects));
}

export function normalizeAppClasses(state: AppState): AppState {
  const classes: ClassRecord[] = [];
  const idMap = new Map<string, string>();
  const indexByKey = new Map<string, number>();

  for (const classRecord of state.classes) {
    const key = classIdentityKey(classRecord);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      const subjects = getClassSubjects(classRecord);
      classes.push({
        ...classRecord,
        subject: primarySubject(subjects),
        subjects,
        subjectTeachers: normalizeSubjectTeachers(subjects, classRecord.subjectTeachers)
      });
      indexByKey.set(key, classes.length - 1);
      idMap.set(classRecord.id, classRecord.id);
      continue;
    }

    const existing = classes[existingIndex];
    const subjects = unique([...getClassSubjects(existing), ...getClassSubjects(classRecord)]);
    classes[existingIndex] = {
      ...existing,
      subject: primarySubject(subjects),
      subjects,
      subjectTeachers: mergeSubjectTeachers(subjects, existing.subjectTeachers, classRecord.subjectTeachers)
    };
    idMap.set(classRecord.id, existing.id);
  }

  const subjects = unique([
    ...(state.subjects ?? []),
    ...classes.flatMap(getClassSubjects),
    ...state.statements.map((statement) => statement.subject)
  ].filter(Boolean));

  return {
    ...state,
    subjects,
    classes,
    students: state.students.map((student) => ({
      ...student,
      classId: idMap.get(student.classId) ?? student.classId,
      subjectScores: student.subjectScores?.map((score) => ({
        ...score,
        classId: idMap.get(score.classId) ?? score.classId
      }))
    })),
    drafts: state.drafts.map((draft) => ({
      ...draft,
      classId: idMap.get(draft.classId) ?? draft.classId
    }))
  };
}

export function getAssignedTeacherName(
  classRecord: ClassRecord,
  subject: string,
  teachers: TeacherRecord[]
): string {
  const assignment = classRecord.subjectTeachers?.find((item) => item.subject === subject);
  return teachers.find((teacher) => teacher.id === assignment?.teacherId)?.name ?? "";
}

export function normaliseTeacherAssignments(
  classRecord: ClassRecord,
  form: FormData
): ClassRecord["subjectTeachers"] {
  return getClassSubjects(classRecord)
    .map((subject) => ({
      subject,
      teacherId: String(form.get(`teacher:${subject}`) ?? "")
    }))
    .filter((assignment) => assignment.teacherId);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function classIdentityKey(classRecord: ClassRecord): string {
  return `${classRecord.yearGroup.trim().toLowerCase()}::${classRecord.className.trim().toLowerCase()}`;
}

function normalizeSubjectTeachers(
  subjects: string[],
  assignments: SubjectTeacherAssignment[] | undefined
): SubjectTeacherAssignment[] {
  return mergeSubjectTeachers(subjects, assignments, []);
}

function mergeSubjectTeachers(
  subjects: string[],
  first: SubjectTeacherAssignment[] | undefined,
  second: SubjectTeacherAssignment[] | undefined
): SubjectTeacherAssignment[] {
  return subjects
    .map((subject) => {
      const assignment =
        second?.find((item) => item.subject === subject && item.teacherId) ??
        first?.find((item) => item.subject === subject && item.teacherId);
      return assignment ? { subject, teacherId: assignment.teacherId } : undefined;
    })
    .filter((assignment): assignment is SubjectTeacherAssignment => Boolean(assignment));
}
