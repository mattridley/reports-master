import type { ClassRecord, CsvPreview as CsvPreviewType, ScoreScale, ScoreType, StatementTemplate, StudentRecord } from "./types";
import { parseSubjects, primarySubject } from "./classes";

type Row = Record<string, string>;
export type CsvPreview<T> = CsvPreviewType<T>;
export type CsvImportKind = "classes" | "students" | "statements";
export type CsvColumnMapping = Record<string, string>;

export interface CsvFieldSpec {
  field: string;
  label: string;
  required: boolean;
  aliases: string[];
}

export interface ParsedCsv {
  headers: string[];
  rows: Row[];
}

export const csvFieldSpecs: Record<CsvImportKind, CsvFieldSpec[]> = {
  classes: [
    { field: "year_group", label: "Year group", required: true, aliases: ["year", "year group", "year_group", "yeargroup"] },
    { field: "class_name", label: "Class name", required: true, aliases: ["class", "class name", "class_name", "classname", "group"] },
    { field: "subjects", label: "Subjects", required: true, aliases: ["subjects", "subject", "course", "courses"] },
    { field: "teacher", label: "Teacher", required: false, aliases: ["teacher", "staff", "class teacher"] }
  ],
  students: [
    { field: "class", label: "Class", required: true, aliases: ["class", "class name", "class_name", "group", "teaching group"] },
    { field: "subject", label: "Subject", required: true, aliases: ["subject", "course"] },
    { field: "first_name", label: "First name", required: true, aliases: ["first", "first name", "first_name", "forename", "given name"] },
    { field: "last_name", label: "Last name", required: true, aliases: ["last", "last name", "last_name", "surname", "family name"] },
    { field: "pronoun_set", label: "Pronouns", required: true, aliases: ["pronouns", "pronoun", "pronoun_set"] },
    { field: "effort_score", label: "Effort score", required: true, aliases: ["effort", "effort score", "effort_score"] },
    { field: "attainment_score", label: "Attainment score", required: true, aliases: ["attainment", "attainment score", "attainment_score", "grade"] }
  ],
  statements: [
    { field: "year_group", label: "Year group", required: true, aliases: ["year", "year group", "year_group", "yeargroup"] },
    { field: "subject", label: "Subject", required: true, aliases: ["subject", "course"] },
    { field: "score_type", label: "Score type", required: true, aliases: ["score type", "score_type", "type", "category"] },
    { field: "score_label", label: "Score label", required: true, aliases: ["score", "score label", "score_label", "band", "grade"] },
    { field: "statement_text", label: "Statement text", required: true, aliases: ["statement", "statement text", "statement_text", "comment", "text"] }
  ]
};

export function parseCsv(text: string): Row[] {
  return parseCsvWithHeaders(text).rows;
}

export function parseCsvWithHeaders(text: string): ParsedCsv {
  return parseCsvWithHeadersLocal(text);
}

export async function parseCsvFast(text: string): Promise<ParsedCsv> {
  const invoke = (window as any).__TAURI_INTERNALS__ ? (await import("@tauri-apps/api/core")).invoke : undefined;
  if (!invoke) return parseCsvWithHeadersLocal(text);
  return invoke<ParsedCsv>("parse_csv", { text });
}

function parseCsvWithHeadersLocal(text: string): ParsedCsv {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  const [header = [], ...data] = rows;
  return {
    headers: header.map((value) => value.trim()),
    rows: data.map((values) => Object.fromEntries(header.map((key, index) => [key.trim(), (values[index] ?? "").trim()])))
  };
}

export function autoMapCsvColumns(kind: CsvImportKind, headers: string[]): CsvColumnMapping {
  const normalisedHeaders = new Map(headers.map((header) => [normaliseHeader(header), header]));
  return Object.fromEntries(
    csvFieldSpecs[kind].map((spec) => {
      const match = spec.aliases.map(normaliseHeader).map((alias) => normalisedHeaders.get(alias)).find(Boolean) ?? "";
      return [spec.field, match];
    })
  );
}

export function applyCsvMapping(rows: Row[], mapping: CsvColumnMapping): Row[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(mapping)
        .filter(([, header]) => header)
        .map(([field, header]) => [field, row[header] ?? ""])
    )
  );
}

export function toCsv(rows: Row[]): string {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

export function previewClassesCsv(text: string): CsvPreview<Omit<ClassRecord, "id">> {
  return previewMappedClassesCsv(parseCsv(text));
}

export function previewStudentsCsv(
  text: string,
  classByName: Map<string, string>,
  scale: ScoreScale
): CsvPreview<Omit<StudentRecord, "id">> {
  return previewMappedStudentsCsv(parseCsv(text), classByName, scale);
}

export function previewStatementsCsv(
  text: string,
  scale: ScoreScale
): CsvPreview<Omit<StatementTemplate, "id">> {
  return previewMappedStatementsCsv(parseCsv(text), scale);
}

export function previewMappedClassesCsv(rows: Row[]): CsvPreview<Omit<ClassRecord, "id">> {
  return previewRows(rows, (row, index) => mapClassRow(row, index));
}

export function previewMappedStudentsCsv(
  rows: Row[],
  classByName: Map<string, string>,
  scale: ScoreScale
): CsvPreview<Omit<StudentRecord, "id">> {
  return previewRows(rows, (row, index) => mapStudentRow(row, index, classByName, scale));
}

export function previewMappedStatementsCsv(
  rows: Row[],
  scale: ScoreScale
): CsvPreview<Omit<StatementTemplate, "id">> {
  return previewRows(rows, (row, index) => mapStatementRow(row, index, scale));
}

function previewRows<T>(rows: Row[], mapRow: (row: Row, index: number) => T): CsvPreview<T> {
  const validRows: T[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  rows.forEach((row, index) => {
    try {
      validRows.push(mapRow(row, index + 2));
    } catch (error) {
      errors.push({ row: index + 2, message: error instanceof Error ? error.message : "Invalid row" });
    }
  });
  return { validRows, errors };
}

function mapClassRow(row: Row, index: number): Omit<ClassRecord, "id"> {
  requireFields(row, index, ["year_group", "class_name"]);
  const subjects = parseSubjects(row.subjects || row.subject);
  if (subjects.length === 0) throw new Error("At least one subject is required.");
  return {
    yearGroup: row.year_group,
    subject: primarySubject(subjects),
    subjects,
    subjectTeachers: subjects
      .map((subject) => ({
        subject,
        teacherId: row[`${subject.toLowerCase().replace(/\s+/g, "_")}_teacher`] || row.teacher || ""
      }))
      .filter((assignment) => assignment.teacherId),
    className: row.class_name
  };
}

function mapStudentRow(
  row: Row,
  index: number,
  classByName: Map<string, string>,
  scale: ScoreScale
): Omit<StudentRecord, "id"> {
  requireFields(row, index, [
    "class",
    "subject",
    "first_name",
    "last_name",
    "pronoun_set",
    "effort_score",
    "attainment_score"
  ]);
  const classId = classByName.get(row.class);
  if (!classId) throw new Error(`Unknown class "${row.class}"`);
  if (!scale.effort.includes(row.effort_score)) throw new Error(`Unknown effort score "${row.effort_score}"`);
  if (!scale.attainment.includes(row.attainment_score)) {
    throw new Error(`Unknown attainment score "${row.attainment_score}"`);
  }
  return {
    classId,
    firstName: row.first_name,
    lastName: row.last_name,
    pronounSetId: row.pronoun_set,
    subjectScores: [{
      classId,
      subject: row.subject,
      effortScore: row.effort_score,
      attainmentScore: row.attainment_score
    }],
    effortScore: row.effort_score,
    attainmentScore: row.attainment_score
  };
}

function mapStatementRow(row: Row, index: number, scale: ScoreScale): Omit<StatementTemplate, "id"> {
  requireFields(row, index, ["year_group", "subject", "score_type", "score_label", "statement_text"]);
  if (row.score_type !== "effort" && row.score_type !== "attainment") {
    throw new Error('score_type must be "effort" or "attainment"');
  }
  const labels = scale[row.score_type as ScoreType];
  if (!labels.includes(row.score_label)) throw new Error(`Unknown ${row.score_type} score "${row.score_label}"`);
  return {
    yearGroup: row.year_group,
    subject: row.subject,
    scoreType: row.score_type as ScoreType,
    scoreLabel: row.score_label,
    statementText: row.statement_text
  };
}

function requireFields(row: Row, index: number, fields: string[]): void {
  const missing = fields.filter((field) => !row[field]);
  if (missing.length > 0) throw new Error(`Row ${index} missing ${missing.join(", ")}`);
}

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
