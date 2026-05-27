export type ScoreType = "effort" | "attainment";
export type GenerationMode = "rule" | "ai";
export type OverwritePolicy = "skipEdited" | "replaceAll";

export interface ClassRecord {
  id: string;
  yearGroup: string;
  subject: string;
  subjects?: string[];
  subjectTeachers?: SubjectTeacherAssignment[];
  className: string;
}

export interface TeacherRecord {
  id: string;
  name: string;
}

export interface SubjectTeacherAssignment {
  subject: string;
  teacherId: string;
}

export interface PronounSet {
  id: string;
  label: string;
  subject: string;
  object: string;
  possessive: string;
  reflexive: string;
  isPlural: boolean;
}

export interface StudentRecord {
  id: string;
  classId: string;
  firstName: string;
  lastName: string;
  pronounSetId: string;
  subjectScores?: SubjectScore[];
  effortScore: string;
  attainmentScore: string;
}

export interface SubjectScore {
  classId: string;
  subject: string;
  effortScore: string;
  attainmentScore: string;
}

export interface StatementTemplate {
  id: string;
  yearGroup: string;
  subject: string;
  scoreType: ScoreType;
  scoreLabel: string;
  statementText: string;
}

export interface DraftReport {
  id: string;
  studentId: string;
  classId: string;
  subject?: string;
  generatedText: string;
  editedText: string;
  mode: GenerationMode;
  updatedAt: string;
}

export interface ScoreScale {
  effort: string[];
  attainment: string[];
}

export interface AiSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
}

export interface AppState {
  classes: ClassRecord[];
  subjects: string[];
  teachers: TeacherRecord[];
  students: StudentRecord[];
  statements: StatementTemplate[];
  drafts: DraftReport[];
  pronounSets: PronounSet[];
  scoreScale: ScoreScale;
  aiSettings: AiSettings;
}

export interface GenerationRequest {
  classId: string | "all";
  mode: GenerationMode;
  overwritePolicy: OverwritePolicy;
}

export interface GenerationResult {
  drafts: DraftReport[];
  warnings: string[];
}

export interface CsvPreview<T> {
  validRows: T[];
  errors: Array<{ row: number; message: string }>;
}
