import {
  Bot,
  Download,
  FileText,
  GraduationCap,
  Info,
  Library,
  Printer,
  Save,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  UserCog,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateAiReports } from "./lib/ai";
import {
  formatSubjects,
  getAssignedTeacherName,
  getClassSubjects,
  normalizeAppClasses,
  normaliseTeacherAssignments,
  primarySubject
} from "./lib/classes";
import {
  applyCsvMapping,
  autoMapCsvColumns,
  csvFieldSpecs,
  parseCsvFast,
  parseCsvWithHeaders,
  previewMappedClassesCsv,
  previewMappedStatementsCsv,
  previewMappedStudentsCsv,
  type CsvColumnMapping,
  type CsvImportKind,
  type CsvPreview,
  type ParsedCsv
} from "./lib/csv";
import { buildReportsCsv, downloadCsv, printReportsPdf } from "./lib/export";
import { generateReports } from "./lib/generator";
import { initialState, loadState, saveState } from "./lib/storage";
import type { AppState, ClassRecord, DraftReport, GenerationMode, ScoreType } from "./lib/types";

type View = "classes" | "subjects" | "teachers" | "students" | "statements" | "drafts" | "exports" | "settings";
type ToastTone = "info" | "success" | "error";
type Toast = {
  id: string;
  text: string;
  items?: string[];
  tone: ToastTone;
  exiting?: boolean;
};

const nav: Array<{ id: View; label: string; icon: typeof GraduationCap }> = [
  { id: "classes", label: "Classes", icon: GraduationCap },
  { id: "subjects", label: "Subjects", icon: Library },
  { id: "teachers", label: "Teachers", icon: UserCog },
  { id: "students", label: "Students", icon: Users },
  { id: "statements", label: "Statements", icon: Library },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "exports", label: "Exports", icon: Download },
  { id: "settings", label: "Settings", icon: Settings }
];

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("classes");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef(new Map<string, number>());
  const [selectedClass, setSelectedClass] = useState<string | "all">("all");
  const [pendingAiDrafts, setPendingAiDrafts] = useState<DraftReport[] | null>(null);
  const [showPlaceholderHelp, setShowPlaceholderHelp] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStatementId, setEditingStatementId] = useState<string | null>(null);
  const [csvImport, setCsvImport] = useState<{ kind: CsvImportKind; parsed: ParsedCsv; mapping: CsvColumnMapping } | null>(null);

  useEffect(() => {
    loadState()
      .then(setState)
      .catch(() => showToast("Could not load local data.", "error"))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveState(state).catch(() => showToast("Could not save local data.", "error"));
  }, [loaded, state]);

  useEffect(() => {
    if (!loaded) return;
    setState((current) => ensureRequiredStatements(current));
  }, [loaded, state.classes, state.scoreScale]);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer));
      toastTimers.current.clear();
    };
  }, []);

  function showToast(text: string, tone: ToastTone = "info", items?: string[]) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, text, items, tone }]);
    const timer = window.setTimeout(() => dismissToast(id), 5000);
    toastTimers.current.set(id, timer);
  }

  function showGenerationResult(warnings: string[], successMessage: string) {
    if (warnings.length === 0) {
      showToast(successMessage, "success");
      return;
    }
    if (warnings.length === 1) {
      showToast(warnings[0], "error");
      return;
    }
    showToast(`${warnings.length} issues found while generating reports:`, "error", warnings);
  }

  function dismissToast(id: string) {
    const timer = toastTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 260);
  }

  function dismissToasts() {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    toastTimers.current.clear();
    setToasts((current) => current.map((toast) => ({ ...toast, exiting: true })));
    window.setTimeout(() => setToasts([]), 260);
  }

  function clearStaleMessage() {
    dismissToasts();
  }

  function changeView(nextView: View) {
    setView(nextView);
    clearStaleMessage();
  }

  function changeSelectedClass(nextClass: string | "all") {
    setSelectedClass(nextClass);
    clearStaleMessage();
  }

  const classesByName = useMemo(
    () => new Map(state.classes.map((classRecord) => [classRecord.className, classRecord.id])),
    [state.classes]
  );

  function addClass(form: FormData): boolean {
    const subjects = form.getAll("subjects").map(String);
    const record: ClassRecord = {
      id: crypto.randomUUID(),
      yearGroup: String(form.get("yearGroup") ?? "").trim(),
      subject: primarySubject(subjects),
      subjects,
      className: String(form.get("className") ?? "").trim()
    };
    if (!record.yearGroup || !record.className || !record.subjects?.length) {
      const missing = [
        !record.yearGroup ? "Year group" : "",
        !record.className ? "Class name" : "",
        !record.subjects?.length ? "At least one subject" : ""
      ].filter(Boolean);
      showToast("Class was not added. Complete these fields:", "error", missing);
      return false;
    }
    setState((current) => normalizeAppClasses({ ...current, classes: [...current.classes, record] }));
    clearStaleMessage();
    return true;
  }

  function updateClass(id: string, form: FormData) {
    const subjects = form.getAll("subjects").map(String);
    if (subjects.length === 0) return;
    setState((current) => normalizeAppClasses({
      ...current,
      classes: current.classes.map((classRecord) =>
        classRecord.id === id
          ? {
              ...classRecord,
              yearGroup: String(form.get("yearGroup") ?? "").trim(),
              className: String(form.get("className") ?? "").trim(),
              subject: primarySubject(subjects),
              subjects,
              subjectTeachers: normaliseTeacherAssignments({ ...classRecord, subject: primarySubject(subjects), subjects }, form)
            }
          : classRecord
      )
    }));
    setEditingClassId(null);
    clearStaleMessage();
  }

  function addStudent(form: FormData) {
    const classId = String(form.get("classId"));
    const classRecord = state.classes.find((item) => item.id === classId);
    const subjectMode = String(form.get("subjectMode"));
    const selectedSubject = normaliseSelectedSubject(classRecord, String(form.get("subject")));
    const firstName = String(form.get("firstName"));
    const lastName = String(form.get("lastName"));
    const existingStudent = state.students.find(
      (student) =>
        student.classId === classId &&
        student.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
        student.lastName.trim().toLowerCase() === lastName.trim().toLowerCase()
    );
    if (existingStudent) {
      setState((current) => ({
        ...current,
        students: current.students.map((student) =>
          student.id === existingStudent.id
            ? {
                ...student,
                pronounSetId: String(form.get("pronounSetId")),
                firstName,
                lastName,
                subjectScores: mergeSelectedSubjectScores(
                  classRecord,
                  student.subjectScores,
                  state.scoreScale,
                  subjectMode,
                  selectedSubject
                )
              }
            : student
        )
      }));
      clearStaleMessage();
      return;
    }
    setState((current) => ({
      ...current,
      students: [
        ...current.students,
        {
          id: crypto.randomUUID(),
          classId,
          firstName,
          lastName,
          pronounSetId: String(form.get("pronounSetId")),
          subjectScores: classRecord
            ? defaultSubjectScores(classRecord, state.scoreScale, subjectMode, selectedSubject)
            : undefined,
          effortScore: state.scoreScale.effort[0] ?? "",
          attainmentScore: state.scoreScale.attainment[0] ?? ""
        }
      ]
    }));
    clearStaleMessage();
  }

  function updateStudent(id: string, form: FormData) {
    const classId = String(form.get("classId"));
    const classRecord = state.classes.find((item) => item.id === classId);
    setState((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === id
          ? {
              ...student,
              classId,
              firstName: String(form.get("firstName")),
              lastName: String(form.get("lastName")),
              pronounSetId: String(form.get("pronounSetId")),
              subjectScores: mergeSubjectScores(classRecord, student.subjectScores, current.scoreScale)
            }
          : student
      )
    }));
    setEditingStudentId(null);
    clearStaleMessage();
  }

  function updateStudentScore(studentId: string, classId: string, subject: string, scoreType: "effortScore" | "attainmentScore", value: string) {
    setState((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId
          ? {
              ...student,
              [scoreType]: value,
              subjectScores: upsertSubjectScore(student.subjectScores, {
                classId,
                subject,
                effortScore: scoreType === "effortScore" ? value : getSubjectScoreValue(student, classId, subject, "effortScore"),
                attainmentScore: scoreType === "attainmentScore" ? value : getSubjectScoreValue(student, classId, subject, "attainmentScore")
              })
            }
          : student
      )
    }));
    clearStaleMessage();
  }

  function updateStatement(id: string, form: FormData) {
    setState((current) => ({
      ...current,
      statements: current.statements.map((statement) =>
        statement.id === id
          ? {
              ...statement,
              yearGroup: String(form.get("yearGroup")),
              subject: String(form.get("subject")),
              scoreType: String(form.get("scoreType")) as ScoreType,
              scoreLabel: String(form.get("scoreLabel")),
              statementText: String(form.get("statementText"))
            }
          : statement
      )
    }));
    setEditingStatementId(null);
    clearStaleMessage();
  }

  function addTeacher(form: FormData) {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    setState((current) => ({
      ...current,
      teachers: [...current.teachers, { id: crypto.randomUUID(), name }]
    }));
    clearStaleMessage();
  }

  function addSubject(form: FormData) {
    const subject = String(form.get("subject") ?? "").trim();
    if (!subject) return;
    setState((current) => ({
      ...current,
      subjects: unique([...current.subjects, subject])
    }));
    clearStaleMessage();
  }

  function deleteSubject(subject: string) {
    setState((current) => normalizeAppClasses({
      ...current,
      subjects: current.subjects.filter((item) => item !== subject),
      classes: current.classes.map((classRecord) => {
        const subjects = getClassSubjects(classRecord).filter((item) => item !== subject);
        return {
          ...classRecord,
          subject: primarySubject(subjects),
          subjects,
          subjectTeachers: classRecord.subjectTeachers?.filter((item) => item.subject !== subject)
        };
      }),
      students: current.students.map((student) => ({
        ...student,
        subjectScores: student.subjectScores?.filter((score) => score.subject !== subject)
      })),
      statements: current.statements.filter((statement) => statement.subject !== subject),
      drafts: current.drafts.filter((draft) => draft.subject !== subject)
    }));
    clearStaleMessage();
  }

  function deleteClass(id: string) {
    setState((current) => normalizeAppClasses({
      ...current,
      classes: current.classes.filter((classRecord) => classRecord.id !== id),
      students: current.students.filter((student) => student.classId !== id),
      drafts: current.drafts.filter((draft) => draft.classId !== id)
    }));
    clearStaleMessage();
  }

  function deleteTeacher(id: string) {
    setState((current) => ({
      ...current,
      teachers: current.teachers.filter((teacher) => teacher.id !== id),
      classes: current.classes.map((classRecord) => ({
        ...classRecord,
        subjectTeachers: classRecord.subjectTeachers?.filter((assignment) => assignment.teacherId !== id)
      }))
    }));
    clearStaleMessage();
  }

  function deleteStudent(id: string) {
    setState((current) => ({
      ...current,
      students: current.students.filter((student) => student.id !== id),
      drafts: current.drafts.filter((draft) => draft.studentId !== id)
    }));
    clearStaleMessage();
  }

  function deleteStatement(id: string) {
    setState((current) => ({
      ...current,
      statements: current.statements.some((statement) => statement.id === id && isRequiredStatement(current, statement))
        ? current.statements.map((statement) => statement.id === id ? { ...statement, statementText: "" } : statement)
        : current.statements.filter((statement) => statement.id !== id)
    }));
    clearStaleMessage();
  }

  function deleteDraft(id: string) {
    setState((current) => ({
      ...current,
      drafts: current.drafts.filter((draft) => draft.id !== id)
    }));
    clearStaleMessage();
  }

  async function openCsvImport(kind: CsvImportKind, text: string) {
    try {
      const parsed = await parseCsvFast(text);
      setCsvImport({ kind, parsed, mapping: autoMapCsvColumns(kind, parsed.headers) });
    } catch (error) {
      showToast(`Could not parse CSV: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  function commitCsvImport(kind: CsvImportKind, parsed: ParsedCsv, mapping: CsvColumnMapping) {
    const mappedRows = applyCsvMapping(parsed.rows, mapping);
    if (kind === "classes") {
      const preview = previewMappedClassesCsv(mappedRows);
      setState((current) => ({
        ...current,
        ...commitImportedClasses(current, preview.validRows.map((row) => ({ ...row, id: crypto.randomUUID() })))
      }));
      showToast(`${preview.validRows.length} classes imported. ${preview.errors.length} rows skipped.`, preview.errors.length ? "error" : "success");
    }
    if (kind === "students") {
      const preview = previewMappedStudentsCsv(mappedRows, classesByName, state.scoreScale);
      setState((current) => ({
        ...current,
        students: [
          ...current.students,
          ...preview.validRows.map((row) => {
            const classRecord = current.classes.find((item) => item.id === row.classId);
            const subject = row.subjectScores?.[0]?.subject ?? classRecord?.subject ?? "";
            return {
              ...row,
              id: crypto.randomUUID(),
              subjectScores: classRecord
                ? [{
                    classId: row.classId,
                    subject,
                    effortScore: row.effortScore,
                    attainmentScore: row.attainmentScore
                  }]
                : undefined
            };
          })
        ]
      }));
      showToast(`${preview.validRows.length} students imported. ${preview.errors.length} rows skipped.`, preview.errors.length ? "error" : "success");
    }
    if (kind === "statements") {
      const preview = previewMappedStatementsCsv(mappedRows, state.scoreScale);
      setState((current) => ({
        ...current,
        statements: upsertStatements(current.statements, preview.validRows.map((row) => ({ ...row, id: crypto.randomUUID() })))
      }));
      showToast(`${preview.validRows.length} statements imported. ${preview.errors.length} rows skipped.`, preview.errors.length ? "error" : "success");
    }
    setCsvImport(null);
  }

  async function runGeneration(mode: GenerationMode) {
    if (mode === "ai") {
      showToast("Generating AI drafts...", "info");
      const result = await generateAiReports(state, { classId: selectedClass, mode, overwritePolicy: "skipEdited" });
      setPendingAiDrafts(result.drafts);
      showGenerationResult(result.warnings, "AI drafts are ready to review.");
      return;
    }
    const result = generateReports(state, { classId: selectedClass, mode, overwritePolicy: "skipEdited" });
    setState((current) => ({ ...current, drafts: result.drafts }));
    showGenerationResult(result.warnings, "Rule-based drafts generated.");
  }

  function updateDraft(id: string, editedText: string) {
    setState((current) => ({
      ...current,
      drafts: current.drafts.map((draft) =>
        draft.id === id ? { ...draft, editedText, updatedAt: new Date().toISOString() } : draft
      )
    }));
    clearStaleMessage();
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <GraduationCap size={26} />
          <span>Reports Master</span>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local teacher workspace</p>
            <h1>{nav.find((item) => item.id === view)?.label}</h1>
          </div>
          <p className="status">Ready</p>
        </header>

        {view === "classes" && (
          <Panel title="Classes" action={<UploadButton label="Import CSV" onText={(text) => {
            void openCsvImport("classes", text);
          }} />}>
            <Form onSubmit={addClass} submit="Add class">
              <Field label="Year group"><input name="yearGroup" /></Field>
              <SubjectCheckboxes subjects={state.subjects} selected={[]} />
              <Field label="Class name"><input name="className" /></Field>
            </Form>
            <ClassEditor
              classes={state.classes}
              subjects={state.subjects}
              teachers={state.teachers}
              editingClassId={editingClassId}
              onEdit={setEditingClassId}
              onSave={updateClass}
              onCancel={() => setEditingClassId(null)}
              onDelete={deleteClass}
            />
          </Panel>
        )}

        {view === "subjects" && (
          <Panel title="Subjects">
            <Form onSubmit={addSubject} submit="Add subject">
              <Field label="Subject name"><input name="subject" /></Field>
            </Form>
            <div className="table">
              <table>
                <thead><tr><th>Subject</th><th>Actions</th></tr></thead>
                <tbody>
                  {state.subjects.map((subject) => (
                    <tr key={subject}>
                      <td>{subject}</td>
                      <td><DeleteButton label={`Delete ${subject}`} onClick={() => deleteSubject(subject)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {view === "teachers" && (
          <Panel title="Teachers">
            <Form onSubmit={addTeacher} submit="Add teacher">
              <Field label="Teacher name"><input name="name" /></Field>
            </Form>
            <div className="table">
              <table>
                <thead><tr><th>Teacher</th><th>Actions</th></tr></thead>
                <tbody>
                  {state.teachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td>{teacher.name}</td>
                      <td><DeleteButton label={`Delete ${teacher.name}`} onClick={() => deleteTeacher(teacher.id)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {view === "students" && (
          <Panel title="Students" action={<UploadButton label="Import CSV" onText={(text) => {
            void openCsvImport("students", text);
          }} />}>
            <AddStudentForm state={state} onSubmit={addStudent} />
            <StudentEditor
              state={state}
              editingStudentId={editingStudentId}
              onEdit={setEditingStudentId}
              onCancel={() => setEditingStudentId(null)}
              onSave={updateStudent}
              onScoreChange={updateStudentScore}
              onDelete={deleteStudent}
            />
          </Panel>
        )}

        {view === "statements" && (
          <Panel title="Statement bank" action={<UploadButton label="Import CSV" onText={(text) => {
            void openCsvImport("statements", text);
          }} />}>
            <StatementEditor
              state={state}
              editingStatementId={editingStatementId}
              onEdit={setEditingStatementId}
              onCancel={() => setEditingStatementId(null)}
              onSave={updateStatement}
              onHelp={() => setShowPlaceholderHelp(true)}
              onDelete={deleteStatement}
            />
          </Panel>
        )}

        {view === "drafts" && (
          <Panel title="Draft reports" action={<GenerationControls selectedClass={selectedClass} setSelectedClass={changeSelectedClass} classes={state.classes} onGenerate={runGeneration} />}>
            {pendingAiDrafts && (
              <div className="review">
                <Bot size={18} />
                <span>AI drafts are staged for review.</span>
                <button onClick={() => { setState((current) => ({ ...current, drafts: pendingAiDrafts })); setPendingAiDrafts(null); }}>Accept drafts</button>
                <button onClick={() => setPendingAiDrafts(null)}>Discard</button>
              </div>
            )}
            <div className="draft-grid">
              {state.drafts.map((draft) => {
                const student = state.students.find((item) => item.id === draft.studentId);
                const classRecord = state.classes.find((item) => item.id === draft.classId);
                return (
                  <article className="draft" key={draft.id}>
                    <header>
                      <strong>{student ? `${student.firstName} ${student.lastName}` : "Student"}</strong>
                      <span>{classRecord?.className} - {draft.subject ?? classRecord?.subject} - {draft.mode}</span>
                      <DeleteButton label="Delete draft" onClick={() => deleteDraft(draft.id)} />
                    </header>
                    <textarea value={draft.editedText} onChange={(event) => updateDraft(draft.id, event.target.value)} />
                  </article>
                );
              })}
            </div>
          </Panel>
        )}

        {view === "exports" && (
          <Panel title="Exports">
            <div className="actions">
              <select value={selectedClass} onChange={(event) => changeSelectedClass(event.target.value)}>
                <option value="all">All classes</option>
                {state.classes.map((item) => <option key={item.id} value={item.id}>{formatClassOption(item)}</option>)}
              </select>
              <button onClick={() => downloadCsv("reports-master-export.csv", buildReportsCsv(state, selectedClass))}><Download size={18} />Export CSV</button>
              <button onClick={() => printReportsPdf(state, selectedClass)}><Printer size={18} />Export PDF</button>
            </div>
          </Panel>
        )}

        {view === "settings" && (
          <Panel title="Settings">
            <div className="settings-grid">
              <label>Effort labels<input value={state.scoreScale.effort.join(", ")} onChange={(event) => { setState({ ...state, scoreScale: { ...state.scoreScale, effort: splitLabels(event.target.value) } }); clearStaleMessage(); }} /></label>
              <label>Attainment labels<input value={state.scoreScale.attainment.join(", ")} onChange={(event) => { setState({ ...state, scoreScale: { ...state.scoreScale, attainment: splitLabels(event.target.value) } }); clearStaleMessage(); }} /></label>
              <label>AI model<input value={state.aiSettings.model} onChange={(event) => { setState({ ...state, aiSettings: { ...state.aiSettings, model: event.target.value } }); clearStaleMessage(); }} /></label>
              <label>OpenAI API key<input type="password" value={state.aiSettings.apiKey} onChange={(event) => { setState({ ...state, aiSettings: { ...state.aiSettings, apiKey: event.target.value } }); clearStaleMessage(); }} /></label>
              <label className="toggle"><input type="checkbox" checked={state.aiSettings.enabled} onChange={(event) => { setState({ ...state, aiSettings: { ...state.aiSettings, enabled: event.target.checked } }); clearStaleMessage(); }} />Enable AI assist</label>
              <p className="privacy">AI assist sends the selected class, students, scores, pronouns, and statement bank to OpenAI only when you generate AI drafts.</p>
            </div>
          </Panel>
        )}
      </section>
      {showPlaceholderHelp && <PlaceholderHelpModal onClose={() => setShowPlaceholderHelp(false)} />}
      {csvImport && (
        <CsvMappingModal
          importState={csvImport}
          preview={previewCsvImport(csvImport.kind, applyCsvMapping(csvImport.parsed.rows, csvImport.mapping), classesByName, state)}
          onMappingChange={(field, header) =>
            setCsvImport((current) => current && { ...current, mapping: { ...current.mapping, [field]: header } })
          }
          onClose={() => setCsvImport(null)}
          onImport={() => commitCsvImport(csvImport.kind, csvImport.parsed, csvImport.mapping)}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><header><h2>{title}</h2>{action}</header>{children}</section>;
}

function Form({ onSubmit, submit, children }: { onSubmit: (form: FormData) => void | boolean; submit: string; children: React.ReactNode }) {
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const shouldReset = onSubmit(new FormData(event.currentTarget));
      if (shouldReset !== false) event.currentTarget.reset();
    }}>
      {children}
      <button type="submit"><Save size={18} />{submit}</button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="delete-button" onClick={onClick} aria-label={label}>
      <Trash2 size={16} />
      Delete
    </button>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}${toast.exiting ? " toast-exit" : ""}`} role={toast.tone === "error" ? "alert" : "status"}>
          <div className="toast-content">
            <span>{toast.text}</span>
            {toast.items && toast.items.length > 0 && (
              <ul>
                {toast.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </div>
          <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function SubjectCheckboxes({
  subjects,
  selected,
  onChange
}: {
  subjects: string[];
  selected: string[];
  onChange?: (subject: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="checkbox-group">
      <legend>Subjects</legend>
      {subjects.length === 0 && <span className="muted">Add subjects before assigning them to classes.</span>}
      {subjects.map((subject) => (
        <label key={subject} className="checkbox-item">
          <input
            name="subjects"
            type="checkbox"
            value={subject}
            checked={onChange ? selected.includes(subject) : undefined}
            defaultChecked={onChange ? undefined : selected.includes(subject)}
            onChange={onChange ? (event) => onChange(subject, event.target.checked) : undefined}
          />
          <span>{subject}</span>
        </label>
      ))}
    </fieldset>
  );
}

function AddStudentForm({ state, onSubmit }: { state: AppState; onSubmit: (form: FormData) => void }) {
  const [classId, setClassId] = useState(state.classes[0]?.id ?? "");
  const [subjectMode, setSubjectMode] = useState("all");
  useEffect(() => {
    if (!classId && state.classes[0]) setClassId(state.classes[0].id);
  }, [classId, state.classes]);
  const selectedClass = state.classes.find((item) => item.id === classId) ?? state.classes[0];
  const subjects = selectedClass ? getClassSubjects(selectedClass) : [];

  return (
    <Form onSubmit={onSubmit} submit="Add student">
      <Field label="Class">
        <select name="classId" value={classId} onChange={(event) => setClassId(event.target.value)}>
          {state.classes.map((item) => <option key={item.id} value={item.id}>{formatClassOption(item)}</option>)}
        </select>
      </Field>
      <Field label="Add to subjects">
        <select name="subjectMode" value={subjectMode} onChange={(event) => setSubjectMode(event.target.value)}>
          <option value="all">All subjects in class</option>
          <option value="one">One subject only</option>
        </select>
      </Field>
      {subjectMode === "one" && (
        <Field label="Subject">
          <select name="subject">
            {subjects.map((subject) => <option key={subject}>{subject}</option>)}
          </select>
        </Field>
      )}
      <Field label="First name"><input name="firstName" /></Field>
      <Field label="Last name"><input name="lastName" /></Field>
      <Field label="Pronouns"><select name="pronounSetId">{state.pronounSets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    </Form>
  );
}

function ClassEditor({
  classes,
  subjects,
  teachers,
  editingClassId,
  onEdit,
  onSave,
  onCancel,
  onDelete
}: {
  classes: ClassRecord[];
  subjects: string[];
  teachers: AppState["teachers"];
  editingClassId: string | null;
  onEdit: (id: string) => void;
  onSave: (id: string, form: FormData) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Subjects</th>
            <th>Teachers</th>
            <th>Class</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {classes.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-cell">No classes added yet.</td>
            </tr>
          )}
          {classes.map((classRecord) => (
            <tr key={classRecord.id}>
              {editingClassId === classRecord.id ? (
                <td colSpan={5}>
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSave(classRecord.id, new FormData(event.currentTarget));
                    }}
                  >
                    <Field label="Year group"><input name="yearGroup" defaultValue={classRecord.yearGroup} /></Field>
                    <ClassEditFields classRecord={classRecord} subjects={subjects} teachers={teachers} />
                    <button type="submit"><Save size={18} />Save</button>
                    <button type="button" onClick={onCancel}>Cancel</button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{classRecord.yearGroup}</td>
                  <td>{formatSubjects(classRecord)}</td>
                  <td>{getClassSubjects(classRecord).map((subject) => `${subject}: ${getAssignedTeacherName(classRecord, subject, teachers) || "Unassigned"}`).join(", ")}</td>
                  <td>{classRecord.className}</td>
                  <td><div className="row-actions"><button type="button" onClick={() => onEdit(classRecord.id)}>Edit</button><DeleteButton label={`Delete ${classRecord.className}`} onClick={() => onDelete(classRecord.id)} /></div></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassEditFields({
  classRecord,
  subjects,
  teachers
}: {
  classRecord: ClassRecord;
  subjects: string[];
  teachers: AppState["teachers"];
}) {
  const [selectedSubjects, setSelectedSubjects] = useState(() => getClassSubjects(classRecord));
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      getClassSubjects(classRecord).map((subject) => [
        subject,
        classRecord.subjectTeachers?.find((item) => item.subject === subject)?.teacherId ?? ""
      ])
    )
  );

  function toggleSubject(subject: string, checked: boolean) {
    setSelectedSubjects((current) =>
      checked ? unique([...current, subject]) : current.filter((item) => item !== subject)
    );
    if (checked) {
      setAssignments((current) => ({ ...current, [subject]: current[subject] ?? "" }));
    }
  }

  return (
    <>
      <SubjectCheckboxes subjects={subjects} selected={selectedSubjects} onChange={toggleSubject} />
      <Field label="Class name"><input name="className" defaultValue={classRecord.className} /></Field>
      <ClassTeacherFields subjects={selectedSubjects} teachers={teachers} assignments={assignments} setAssignments={setAssignments} />
    </>
  );
}

function ClassTeacherFields({
  subjects,
  teachers,
  assignments,
  setAssignments
}: {
  subjects: string[];
  teachers: AppState["teachers"];
  assignments: Record<string, string>;
  setAssignments: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  function applyTeacherToAll(teacherId: string) {
    setAssignments(Object.fromEntries(subjects.map((subject) => [subject, teacherId])));
  }

  function updateSubjectTeacher(subject: string, teacherId: string) {
    setAssignments((current) => ({ ...current, [subject]: teacherId }));
  }

  return (
    <>
      <Field label="Set all subjects to">
        <select defaultValue="__choose" onChange={(event) => {
          if (event.target.value === "__choose") return;
          applyTeacherToAll(event.target.value);
        }}>
          <option value="__choose">Choose teacher</option>
          <option value="">Unassigned</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </Field>
      {subjects.map((subject) => (
        <Field key={subject} label={`${subject} teacher`}>
          <select
            name={`teacher:${subject}`}
            value={assignments[subject] ?? ""}
            onChange={(event) => updateSubjectTeacher(subject, event.target.value)}
          >
            <option value="">Unassigned</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
        </Field>
      ))}
    </>
  );
}

function StatementForm({
  state,
  onSubmit,
  onHelp,
  initial,
  submitLabel = "Add statement"
}: {
  state: AppState;
  onSubmit: (form: FormData) => void;
  onHelp: () => void;
  initial?: AppState["statements"][number];
  submitLabel?: string;
}) {
  const [scoreType, setScoreType] = useState<ScoreType>(initial?.scoreType ?? "effort");
  const yearGroups = unique([...state.classes.map((item) => item.yearGroup), ...state.statements.map((item) => item.yearGroup)]);
  const subjects = state.subjects;
  const scoreLabels = state.scoreScale[scoreType];

  return (
    <Form onSubmit={onSubmit} submit={submitLabel}>
      <Field label="Year group">
        <select name="yearGroup" defaultValue={initial?.yearGroup}>{yearGroups.map((item) => <option key={item}>{item}</option>)}</select>
      </Field>
      <Field label="Subject">
        <select name="subject" defaultValue={initial?.subject}>{subjects.map((item) => <option key={item}>{item}</option>)}</select>
      </Field>
      <Field label="Score type">
        <select name="scoreType" value={scoreType} onChange={(event) => setScoreType(event.target.value as ScoreType)}>
          <option value="effort">Effort</option>
          <option value="attainment">Attainment</option>
        </select>
      </Field>
      <Field label="Score label">
        <select name="scoreLabel" defaultValue={initial?.scoreLabel}>{scoreLabels.map((item) => <option key={item}>{item}</option>)}</select>
      </Field>
      <label className="field statement-field">
        <span className="label-row">Statement text <button type="button" className="icon-button" onClick={onHelp} aria-label="Statement placeholder help"><Info size={16} /></button></span>
        <textarea name="statementText" defaultValue={initial?.statementText} />
      </label>
    </Form>
  );
}

function StudentEditor({
  state,
  editingStudentId,
  onEdit,
  onCancel,
  onSave,
  onScoreChange,
  onDelete
}: {
  state: AppState;
  editingStudentId: string | null;
  onEdit: (id: string) => void;
  onCancel: () => void;
  onSave: (id: string, form: FormData) => void;
  onScoreChange: (studentId: string, classId: string, subject: string, scoreType: "effortScore" | "attainmentScore", value: string) => void;
  onDelete: (id: string) => void;
}) {
  const studentsByClass = state.classes.map((classRecord) => ({
    classRecord,
    students: state.students.filter((student) => student.classId === classRecord.id)
  }));

  return (
    <div className="student-sections">
      {studentsByClass.map(({ classRecord, students }) => {
        const subjects = getClassSubjects(classRecord);
        return (
          <section className="student-section" key={classRecord.id}>
            <header>
              <div>
                <h3>{formatClassOption(classRecord)}</h3>
              </div>
            </header>
            <div className="table student-score-table">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Pronouns</th>
                    <th>Subject</th>
                    <th>Effort</th>
                    <th>Attainment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-cell">No students assigned to this class.</td>
                    </tr>
                  )}
                  {students.map((student) => (
                    editingStudentId === student.id ? (
                      <tr key={`${student.id}-edit`}>
                        <td colSpan={6}>
                          <form
                            className="inline-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              onSave(student.id, new FormData(event.currentTarget));
                            }}
                          >
                            <Field label="Class"><select name="classId" defaultValue={student.classId}>{state.classes.map((item) => <option key={item.id} value={item.id}>{formatClassOption(item)}</option>)}</select></Field>
                            <Field label="First name"><input name="firstName" defaultValue={student.firstName} /></Field>
                            <Field label="Last name"><input name="lastName" defaultValue={student.lastName} /></Field>
                            <Field label="Pronouns"><select name="pronounSetId" defaultValue={student.pronounSetId}>{state.pronounSets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                            <button type="submit"><Save size={18} />Save</button>
                            <button type="button" onClick={onCancel}>Cancel</button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      subjects.map((subject, subjectIndex) => {
                        const score = getSubjectScore(student, student.classId, subject);
                        const pronouns = state.pronounSets.find((item) => item.id === student.pronounSetId)?.label ?? "";
                        return (
                          <tr key={`${student.id}-${subject}`}>
                            {subjectIndex === 0 && (
                              <>
                                <td rowSpan={subjects.length}><strong>{student.firstName} {student.lastName}</strong></td>
                                <td rowSpan={subjects.length}>{pronouns}</td>
                              </>
                            )}
                            <td>{subject}</td>
                            <td>
                              <select value={score.effortScore} onChange={(event) => onScoreChange(student.id, student.classId, subject, "effortScore", event.target.value)}>
                                {state.scoreScale.effort.map((item) => <option key={item}>{item}</option>)}
                              </select>
                            </td>
                            <td>
                              <select value={score.attainmentScore} onChange={(event) => onScoreChange(student.id, student.classId, subject, "attainmentScore", event.target.value)}>
                                {state.scoreScale.attainment.map((item) => <option key={item}>{item}</option>)}
                              </select>
                            </td>
                            {subjectIndex === 0 && (
                              <td rowSpan={subjects.length}><div className="row-actions"><button type="button" onClick={() => onEdit(student.id)}>Edit</button><DeleteButton label={`Delete ${student.firstName} ${student.lastName}`} onClick={() => onDelete(student.id)} /></div></td>
                            )}
                          </tr>
                        );
                      })
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StatementEditor({
  state,
  editingStatementId,
  onEdit,
  onCancel,
  onSave,
  onHelp,
  onDelete
}: {
  state: AppState;
  editingStatementId: string | null;
  onEdit: (id: string) => void;
  onCancel: () => void;
  onSave: (id: string, form: FormData) => void;
  onHelp: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="table">
      <table>
        <thead><tr><th>Year</th><th>Subject</th><th>Type</th><th>Score</th><th>Statement</th><th>Actions</th></tr></thead>
        <tbody>
          {state.statements.map((statement) => (
            <tr key={statement.id}>
              {editingStatementId === statement.id ? (
                <td colSpan={6}>
                  <StatementForm
                    state={state}
                    submitLabel="Save statement"
                    initial={statement}
                    onSubmit={(form) => onSave(statement.id, form)}
                    onHelp={onHelp}
                  />
                  <button type="button" onClick={onCancel}>Cancel</button>
                </td>
              ) : (
                <>
                  <td>{statement.yearGroup}</td>
                  <td>{statement.subject}</td>
                  <td>{capitalizeScoreType(statement.scoreType)}</td>
                  <td>{statement.scoreLabel}</td>
                  <td>{statement.statementText || <span className="missing-text">Missing statement text</span>}</td>
                  <td><div className="row-actions"><button type="button" onClick={() => onEdit(statement.id)}>Edit</button><DeleteButton label="Delete statement" onClick={() => onDelete(statement.id)} /></div></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="table"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function UploadButton({ label, onText }: { label: string; onText: (text: string) => void }) {
  return <label className="upload"><Upload size={18} />{label}<input type="file" accept=".csv,text/csv" onChange={async (event) => {
    const file = event.target.files?.[0];
    if (file) onText(await file.text());
    event.target.value = "";
  }} /></label>;
}

function GenerationControls({ selectedClass, setSelectedClass, classes, onGenerate }: {
  selectedClass: string | "all";
  setSelectedClass: (id: string | "all") => void;
  classes: ClassRecord[];
  onGenerate: (mode: GenerationMode) => void;
}) {
  return <div className="actions"><select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option value="all">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{formatClassOption(item)}</option>)}</select><button onClick={() => onGenerate("rule")}><Sparkles size={18} />Generate</button><button onClick={() => onGenerate("ai")}><Bot size={18} />AI generate</button></div>;
}

function splitLabels(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function capitalizeScoreType(scoreType: ScoreType): string {
  return scoreType === "effort" ? "Effort" : "Attainment";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function ensureRequiredStatements(state: AppState): AppState {
  const requiredStatements = buildRequiredStatementRows(state);
  const statements = sortStatements(upsertStatements(state.statements, requiredStatements));
  if (sameStatementList(state.statements, statements)) return state;
  return { ...state, statements };
}

function buildRequiredStatementRows(state: AppState): AppState["statements"] {
  return state.classes.flatMap((classRecord) => {
    const subjects = getClassSubjects(classRecord);
    return subjects.flatMap((subject) => [
      ...state.scoreScale.effort.map((scoreLabel) => createBlankStatement(classRecord.yearGroup, subject, "effort", scoreLabel)),
      ...state.scoreScale.attainment.map((scoreLabel) => createBlankStatement(classRecord.yearGroup, subject, "attainment", scoreLabel))
    ]);
  });
}

function createBlankStatement(
  yearGroup: string,
  subject: string,
  scoreType: ScoreType,
  scoreLabel: string
): AppState["statements"][number] {
  return {
    id: crypto.randomUUID(),
    yearGroup,
    subject,
    scoreType,
    scoreLabel,
    statementText: ""
  };
}

function upsertStatements(
  existingStatements: AppState["statements"],
  nextStatements: AppState["statements"]
): AppState["statements"] {
  return nextStatements.reduce(upsertStatement, existingStatements);
}

function upsertStatement(
  existingStatements: AppState["statements"],
  nextStatement: AppState["statements"][number]
): AppState["statements"] {
  const index = existingStatements.findIndex((statement) => statementKey(statement) === statementKey(nextStatement));
  if (index === -1) return [...existingStatements, nextStatement];
  return existingStatements.map((statement, statementIndex) =>
    statementIndex === index
      ? {
          ...statement,
          statementText: nextStatement.statementText.trim() || statement.statementText
        }
      : statement
  );
}

function sortStatements(statements: AppState["statements"]): AppState["statements"] {
  return [...statements].sort((first, second) =>
    statementKey(first).localeCompare(statementKey(second), undefined, { sensitivity: "base" })
  );
}

function sameStatementList(first: AppState["statements"], second: AppState["statements"]): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function isRequiredStatement(state: AppState, statement: AppState["statements"][number]): boolean {
  return state.classes.some((classRecord) =>
    classRecord.yearGroup.trim().toLowerCase() === statement.yearGroup.trim().toLowerCase() &&
    getClassSubjects(classRecord).some((subject) => subject.trim().toLowerCase() === statement.subject.trim().toLowerCase()) &&
    state.scoreScale[statement.scoreType].some((scoreLabel) => scoreLabel.trim().toLowerCase() === statement.scoreLabel.trim().toLowerCase())
  );
}

function statementKey(statement: AppState["statements"][number]): string {
  return [
    statement.yearGroup.trim().toLowerCase(),
    statement.subject.trim().toLowerCase(),
    statement.scoreType,
    statement.scoreLabel.trim().toLowerCase()
  ].join("::");
}

function upsertSubjectScore(
  scores: NonNullable<AppState["students"][number]["subjectScores"]> | undefined,
  next: NonNullable<AppState["students"][number]["subjectScores"]>[number]
) {
  const existing = scores ?? [];
  const index = existing.findIndex((score) => score.classId === next.classId && score.subject === next.subject);
  if (index === -1) return [...existing, next];
  return existing.map((score, scoreIndex) => (scoreIndex === index ? next : score));
}

function defaultSubjectScores(
  classRecord: ClassRecord,
  scoreScale: AppState["scoreScale"],
  subjectMode = "all",
  selectedSubject = ""
) {
  const subjects = subjectMode === "one"
    ? getClassSubjects(classRecord).filter((subject) => subject === selectedSubject)
    : getClassSubjects(classRecord);
  return subjects.map((subject) => ({
    classId: classRecord.id,
    subject,
    effortScore: scoreScale.effort[0] ?? "",
    attainmentScore: scoreScale.attainment[0] ?? ""
  }));
}

function mergeSelectedSubjectScores(
  classRecord: ClassRecord | undefined,
  scores: AppState["students"][number]["subjectScores"],
  scoreScale: AppState["scoreScale"],
  subjectMode: string,
  selectedSubject: string
) {
  if (!classRecord) return scores;
  const nextScores = defaultSubjectScores(classRecord, scoreScale, subjectMode, selectedSubject);
  return nextScores.reduce(
    (merged, score) => upsertSubjectScore(merged, scores?.find((existing) => existing.classId === score.classId && existing.subject === score.subject) ?? score),
    scores ?? []
  );
}

function mergeSubjectScores(
  classRecord: ClassRecord | undefined,
  scores: AppState["students"][number]["subjectScores"],
  scoreScale: AppState["scoreScale"]
) {
  if (!classRecord) return scores;
  return getClassSubjects(classRecord).map((subject) => {
    const existing = scores?.find((score) => score.classId === classRecord.id && score.subject === subject);
    return existing ?? {
      classId: classRecord.id,
      subject,
      effortScore: scoreScale.effort[0] ?? "",
      attainmentScore: scoreScale.attainment[0] ?? ""
    };
  });
}

function normaliseSelectedSubject(classRecord: ClassRecord | undefined, selectedSubject: string): string {
  if (!classRecord) return selectedSubject;
  const subjects = getClassSubjects(classRecord);
  return subjects.includes(selectedSubject) ? selectedSubject : subjects[0] ?? selectedSubject;
}

function formatClassOption(classRecord: ClassRecord): string {
  return `${classRecord.yearGroup} - ${classRecord.className}`;
}

function getSubjectScore(student: AppState["students"][number], classId: string, subject: string) {
  return student.subjectScores?.find((score) => score.classId === classId && score.subject === subject) ?? {
    classId,
    subject,
    effortScore: student.effortScore,
    attainmentScore: student.attainmentScore
  };
}

function getSubjectScoreValue(
  student: AppState["students"][number],
  classId: string,
  subject: string,
  scoreType: "effortScore" | "attainmentScore"
) {
  return getSubjectScore(student, classId, subject)[scoreType];
}

function commitImportedClasses(current: AppState, importedClasses: ClassRecord[]): Pick<AppState, "classes" | "subjects" | "teachers"> {
  const teachers = [...current.teachers];
  const teacherIdByName = new Map(teachers.map((teacher) => [teacher.name.toLowerCase(), teacher.id]));
  const classes = importedClasses.map((classRecord) => ({
    ...classRecord,
    subjectTeachers: classRecord.subjectTeachers?.map((assignment) => {
      const teacherName = assignment.teacherId.trim();
      const key = teacherName.toLowerCase();
      let teacherId = teacherIdByName.get(key);
      if (!teacherId && teacherName) {
        teacherId = crypto.randomUUID();
        teacherIdByName.set(key, teacherId);
        teachers.push({ id: teacherId, name: teacherName });
      }
      return { ...assignment, teacherId: teacherId ?? "" };
    }).filter((assignment) => assignment.teacherId)
  }));

  const normalized = normalizeAppClasses({
    ...current,
    teachers,
    classes: [...current.classes, ...classes]
  });

  return {
    teachers,
    subjects: normalized.subjects,
    classes: normalized.classes
  };
}

function previewCsvImport(
  kind: CsvImportKind,
  rows: Record<string, string>[],
  classesByName: Map<string, string>,
  state: AppState
): CsvPreview<unknown> {
  if (kind === "classes") return previewMappedClassesCsv(rows);
  if (kind === "students") return previewMappedStudentsCsv(rows, classesByName, state.scoreScale);
  return previewMappedStatementsCsv(rows, state.scoreScale);
}

function CsvMappingModal({
  importState,
  preview,
  onMappingChange,
  onClose,
  onImport
}: {
  importState: { kind: CsvImportKind; parsed: ParsedCsv; mapping: CsvColumnMapping };
  preview: CsvPreview<unknown>;
  onMappingChange: (field: string, header: string) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  const specs = csvFieldSpecs[importState.kind];
  const missingRequired = specs.some((spec) => spec.required && !importState.mapping[spec.field]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="csv-mapping-title">
      <section className="modal wide-modal">
        <header>
          <h2 id="csv-mapping-title">Map CSV columns</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close CSV mapping"><X size={18} /></button>
        </header>
        <p>Match each app field to the column in your CSV. Obvious headers are selected automatically.</p>
        <div className="mapping-grid">
          {specs.map((spec) => (
            <Field key={spec.field} label={`${spec.label}${spec.required ? " *" : ""}`}>
              <select value={importState.mapping[spec.field] ?? ""} onChange={(event) => onMappingChange(spec.field, event.target.value)}>
                <option value="">Do not import</option>
                {importState.parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <div className="review">
          <Info size={18} />
          <span>{preview.validRows.length} rows ready. {preview.errors.length} rows have errors.</span>
        </div>
        {preview.errors.length > 0 && (
          <div className="table compact-table">
            <table>
              <thead><tr><th>Row</th><th>Error</th></tr></thead>
              <tbody>{preview.errors.slice(0, 6).map((error: { row: number; message: string }) => <tr key={`${error.row}-${error.message}`}><td>{String(error.row)}</td><td>{error.message}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="actions modal-actions">
          <button type="button" onClick={onImport} disabled={missingRequired || preview.validRows.length === 0}>Import rows</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

function PlaceholderHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="placeholder-title">
      <section className="modal">
        <header>
          <h2 id="placeholder-title">Statement placeholders</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close help"><X size={18} /></button>
        </header>
        <p>Use placeholders in statement text so Reports Master can adapt each draft to the student.</p>
        <Table
          headers={["Placeholder", "Output"]}
          rows={[
            ["{name}", "Student full name"],
            ["{they}", "Subject pronoun: he, she, they"],
            ["{them}", "Object pronoun: him, her, them"],
            ["{their}", "Possessive pronoun: his, her, their"],
            ["{is_are}", "is for singular pronouns, are for plural pronouns"],
            ["{has_have}", "has for singular pronouns, have for plural pronouns"],
            ["{was_were}", "was for singular pronouns, were for plural pronouns"],
            ["{s}", "Adds s for singular verbs, blank for plural verbs"]
          ]}
        />
      </section>
    </div>
  );
}
