import { getAssignedTeacherName, getClassSubjects } from "./classes";
import { toCsv } from "./csv";
import { getStudentSubjectScore } from "./generator";
import type { AppState, DraftReport, StudentRecord } from "./types";

export function buildReportsCsv(state: AppState, classId: string | "all"): string {
  const drafts = selectDrafts(state, classId);
  return toCsv(
    drafts.map((draft) => {
      const student = state.students.find((item) => item.id === draft.studentId);
      const classRecord = state.classes.find((item) => item.id === draft.classId);
      const subject = draft.subject ?? classRecord?.subject ?? "";
      const scores = student && classRecord ? getStudentSubjectScore(student, draft.classId, subject) : undefined;
      return {
        year_group: classRecord?.yearGroup ?? "",
        subject,
        teacher: classRecord ? getAssignedTeacherName(classRecord, subject, state.teachers) : "",
        class_name: classRecord?.className ?? "",
        first_name: student?.firstName ?? "",
        last_name: student?.lastName ?? "",
        pronoun_set: student?.pronounSetId ?? "",
        effort_score: scores?.effortScore ?? "",
        attainment_score: scores?.attainmentScore ?? "",
        generated_text: draft.generatedText,
        final_text: draft.editedText,
        export_timestamp: new Date().toISOString()
      };
    })
  );
}

export function downloadCsv(filename: string, csv: string): void {
  download(filename, csv, "text/csv;charset=utf-8");
}

export function printReportsPdf(state: AppState, classId: string | "all"): void {
  const html = buildPrintableHtml(state, classId);
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function buildPrintableHtml(state: AppState, classId: string | "all"): string {
  const pages = Array.from(groupDraftsByStudent(state, selectDrafts(state, classId)).entries())
    .map(([studentKey, drafts]) => {
      const firstStudent = state.students.find((item) => studentKeyFor(item) === studentKey);
      const subjectSections = drafts
        .map((draft) => {
          const student = state.students.find((item) => item.id === draft.studentId);
          const classRecord = state.classes.find((item) => item.id === draft.classId);
          const subject = draft.subject ?? classRecord?.subject ?? "";
          const scores =
            student && classRecord ? getStudentSubjectScore(student, draft.classId, subject) : undefined;
          return `<section class="subject">
            <h2>${escapeHtml(subject || "Subject")}</h2>
            <p>${escapeHtml(classRecord ? `${classRecord.yearGroup} - ${classRecord.className}` : "")}${classRecord ? ` - ${escapeHtml(getAssignedTeacherName(classRecord, subject, state.teachers))}` : ""}</p>
            <dl>
              <div><dt>Effort</dt><dd>${escapeHtml(scores?.effortScore ?? "")}</dd></div>
              <div><dt>Attainment</dt><dd>${escapeHtml(scores?.attainmentScore ?? "")}</dd></div>
            </dl>
            <article>${escapeHtml(draft.editedText).replace(/\n/g, "<br />")}</article>
          </section>`;
        })
        .join("");

      return `<section class="page">
        <header>
          <h1>${escapeHtml(firstStudent ? `${firstStudent.firstName} ${firstStudent.lastName}` : "Student report")}</h1>
          <p>All subject reports</p>
        </header>
        ${subjectSections}
      </section>`;
    })
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <title>Reports Master PDF Export</title>
        <style>
          @page { size: A4; margin: 22mm; }
          body { font-family: Arial, sans-serif; color: #1d252c; }
          .page { break-after: page; min-height: 246mm; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          h2 { font-size: 18px; margin: 20px 0 4px; }
          p { margin: 0 0 28px; color: #52616c; }
          dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 28px; }
          dt { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #66737d; }
          dd { margin: 4px 0 0; font-size: 16px; }
          article { font-size: 17px; line-height: 1.6; white-space: normal; }
          .subject { border-top: 1px solid #d8dee2; padding-top: 12px; }
          .subject p { margin-bottom: 12px; }
          .subject dl { margin-bottom: 14px; }
        </style>
      </head>
      <body>${pages}</body>
    </html>`;
}

function selectDrafts(state: AppState, classId: string | "all"): DraftReport[] {
  return state.drafts.filter((draft) => {
    if (classId === "all") return true;
    if (draft.classId === classId) return true;
    const classRecord = state.classes.find((item) => item.id === classId);
    return Boolean(classRecord && draft.classId === classId && getClassSubjects(classRecord).includes(draft.subject ?? ""));
  });
}

function groupDraftsByStudent(state: AppState, drafts: DraftReport[]): Map<string, DraftReport[]> {
  const grouped = new Map<string, DraftReport[]>();
  for (const draft of drafts) {
    const student = state.students.find((item) => item.id === draft.studentId);
    const key = student ? studentKeyFor(student) : draft.studentId;
    grouped.set(key, [...(grouped.get(key) ?? []), draft]);
  }
  return grouped;
}

function studentKeyFor(student: Pick<StudentRecord, "firstName" | "lastName">): string {
  return `${student.firstName.trim().toLowerCase()}::${student.lastName.trim().toLowerCase()}`;
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char];
  });
}
