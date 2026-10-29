export const TOOL = "goveda_pregled_kretanja";
export const MAX_ANIMALS = 20;
export const RESULT_FIELDS = ["Broj životinje", "Kretanje", "Datum dolaska", "Datum odlaska", "Dolazak na gazdinstvo", "Držalac"] as const;

export function parseJobInput(input: unknown) {
  const b = input as Record<string, unknown> | null;
  if (!b || typeof b !== "object") throw new Error("invalid_input");
  if (typeof b.request_ref !== "string" || !/^[\p{L}\p{N}._ /-]{1,120}$/u.test(b.request_ref)) throw new Error("invalid_request_ref");
  if (!Array.isArray(b.animal_ids) || b.animal_ids.length < 1 || b.animal_ids.length > MAX_ANIMALS) throw new Error("invalid_animal_count");
  const ids = b.animal_ids.map((id: unknown) => {
    if (typeof id !== "string" || !/^(?:RS\s*)?\d{10}$/i.test(id.trim())) throw new Error("invalid_animal_id");
    return id.trim().replace(/^RS\s*/i, "");
  });
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_animal_id");
  return { request_ref: b.request_ref.trim(), animal_ids: ids };
}

export function parseJobResult(input: unknown, expected: string[]) {
  const b = input as Record<string, unknown> | null;
  if (!b || typeof b !== "object") throw new Error("invalid_result");
  if (b.status === "failed") {
    const reasons = ["airs_login_required", "tab_closed", "tool_busy", "launch_failed", "run_timeout", "operator_stopped", "execution_interrupted"];
    if (typeof b.error !== "string" || !reasons.includes(b.error)) throw new Error("invalid_failure_reason");
    return { status: "failed", result: null, error: b.error };
  }
  if (b.status !== "completed" || !Array.isArray(b.rows) || !b.rows.length || b.rows.length > 2000) throw new Error("invalid_result_rows");
  const seen = new Set<string>();
  let warnings = false;
  const rows = b.rows.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("invalid_result_row");
    const r = raw as Record<string, unknown>;
    const id = r["Broj životinje"];
    if (typeof id !== "string" || !expected.includes(id)) throw new Error("unexpected_animal_id");
    seen.add(id);
    const out: Record<string, string> = {};
    for (const field of RESULT_FIELDS) {
      if (typeof r[field] !== "string" || r[field].length > 1000) throw new Error("invalid_result_field");
      out[field] = r[field];
    }
    if (!["0", "1"].includes(String(r.__WARN))) throw new Error("missing_warning_flag");
    const warning = String(r.__WARN) === "1" || out.Kretanje.startsWith("NEMA PODATAKA");
    if (!warning && (!out.Kretanje || (!out["Datum dolaska"] && !out["Datum odlaska"]))) throw new Error("empty_movement");
    out.__WARN = warning ? "1" : "0";
    warnings ||= warning;
    return out;
  });
  if (seen.size !== expected.length) throw new Error("missing_animals_in_result");
  return { status: warnings ? "needs_review" : "completed", result: rows, error: warnings ? "movement_warnings" : null };
}
