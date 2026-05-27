import { describe, expect, it } from "vitest";
import {
  applyCsvMapping,
  autoMapCsvColumns,
  parseCsvWithHeaders,
  previewMappedStatementsCsv,
  previewStatementsCsv
} from "../src/lib/csv";

describe("CSV previews", () => {
  it("validates statement score labels", () => {
    const preview = previewStatementsCsv(
      "year_group,subject,score_type,score_label,statement_text\nYear 7,English,effort,5,Text",
      { effort: ["1", "2"], attainment: ["Expected"] }
    );
    expect(preview.validRows).toHaveLength(0);
    expect(preview.errors[0].message).toContain("Unknown effort score");
  });

  it("auto-maps arbitrary statement headers before validation", () => {
    const parsed = parseCsvWithHeaders("Year,Course,Type,Band,Comment\nYear 7,English,effort,1,Great work");
    const mapping = autoMapCsvColumns("statements", parsed.headers);
    const rows = applyCsvMapping(parsed.rows, mapping);
    const preview = previewMappedStatementsCsv(rows, { effort: ["1"], attainment: ["Expected"] });
    expect(preview.validRows[0].statementText).toBe("Great work");
  });
});
