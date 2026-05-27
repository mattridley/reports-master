import { getClassSubjects } from "./classes";
import type { AppState, DraftReport, GenerationRequest, GenerationResult } from "./types";

interface AiDraftResponse {
  reports: Array<{ studentId: string; subject: string; text: string }>;
  warnings?: string[];
}

export async function generateAiReports(state: AppState, request: GenerationRequest): Promise<GenerationResult> {
  if (!state.aiSettings.enabled || !state.aiSettings.apiKey) {
    return { drafts: state.drafts, warnings: ["AI assist is enabled only after an API key is saved in Settings."] };
  }

  const classes = request.classId === "all"
    ? state.classes
    : state.classes.filter((classRecord) => classRecord.id === request.classId);

  const payload = classes.flatMap((classRecord) => getClassSubjects(classRecord).map((subject) => ({
    class: classRecord,
    subject,
    students: state.students.filter((student) => student.classId === classRecord.id),
    statements: state.statements.filter(
      (statement) =>
        statement.yearGroup.toLowerCase() === classRecord.yearGroup.toLowerCase() &&
        statement.subject.toLowerCase() === subject.toLowerCase()
    )
  })));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.aiSettings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: state.aiSettings.model || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content:
            "You draft concise end-of-year school report comments. Return only JSON matching {\"reports\":[{\"studentId\":\"...\",\"subject\":\"...\",\"text\":\"...\"}],\"warnings\":[]}. Use the supplied statement bank and pronoun data. Do not invent sensitive personal information."
        },
        {
          role: "user",
          content: JSON.stringify({ classes: payload })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reports_master_drafts",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["reports", "warnings"],
            properties: {
              reports: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["studentId", "subject", "text"],
                  properties: {
                    studentId: { type: "string" },
                    subject: { type: "string" },
                    text: { type: "string" }
                  }
                }
              },
              warnings: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    return { drafts: state.drafts, warnings: [`AI generation failed: ${response.status} ${response.statusText}`] };
  }

  const body = await response.json();
  const output = extractText(body);
  const parsed = JSON.parse(output) as AiDraftResponse;
  const drafts = [...state.drafts];
  const warnings = [...(parsed.warnings ?? [])];

  for (const report of parsed.reports) {
    const student = state.students.find((item) => item.id === report.studentId);
    if (!student) {
      warnings.push(`AI returned a report for unknown student ${report.studentId}.`);
      continue;
    }
    const existingIndex = drafts.findIndex(
      (draft) =>
        draft.studentId === student.id &&
        draft.classId === student.classId &&
        (draft.subject ?? "") === report.subject
    );
    const existing = existingIndex >= 0 ? drafts[existingIndex] : undefined;
    const edited = existing && existing.editedText !== existing.generatedText;
    if (edited && request.overwritePolicy === "skipEdited") {
      warnings.push(`${student.firstName} ${student.lastName} has teacher edits and was skipped.`);
      continue;
    }
    const draft: DraftReport = {
      id: existing?.id ?? crypto.randomUUID(),
      studentId: student.id,
      classId: student.classId,
      subject: report.subject,
      generatedText: report.text,
      editedText: report.text,
      mode: "ai",
      updatedAt: new Date().toISOString()
    };
    if (existingIndex >= 0) drafts[existingIndex] = draft;
    else drafts.push(draft);
  }

  return { drafts, warnings };
}

function extractText(body: any): string {
  if (typeof body.output_text === "string") return body.output_text;
  const content = body.output?.flatMap((item: any) => item.content ?? []) ?? [];
  const text = content.find((item: any) => item.type === "output_text" || item.type === "text");
  if (typeof text?.text === "string") return text.text;
  throw new Error("AI response did not include text output.");
}
