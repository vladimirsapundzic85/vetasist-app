export type FormSubmission = {
  responseId: string;
  submittedAt: string | null;
  email: string | null;
  organization: string | null;
  requestType: string | null;
  urgent: boolean;
  breedingProgram: string | null;
  declaredAnimalCount: number | null;
  seller: string | null;
  buyer: string | null;
  attachmentLinks: string[];
  attachmentFileIds: string[];
  checks: Array<{ code: string; message: string }>;
};

const normalizeHeader = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .toLocaleLowerCase("sr-Cyrl")
  .replace(/[\s\r\n]+/g, " ")
  .trim();

function findColumn(headers: unknown[], includes: string[], excludes: string[] = []): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex(value => includes.every(part => value.includes(part)) && excludes.every(part => !value.includes(part)));
}

function cell(row: unknown[], index: number): string | null {
  if (index < 0) return null;
  const value = row[index];
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

function parseCount(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function extractDriveFileIds(...values: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const urls = value.match(/https?:\/\/drive\.google\.com\/[^\s,;"']+/gi) ?? [];
    for (const rawUrl of urls) {
      try {
        const url = new URL(rawUrl.replace(/[).]+$/, ""));
        const pathMatch = url.pathname.match(/^\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]+)/i);
        const id = pathMatch?.[1] ?? url.searchParams.get("id");
        if (id && /^[\w-]+$/.test(id)) found.add(id);
      } catch {
        // Ignore malformed or non-Drive links; the caller reports missing attachments.
      }
    }
  }
  return [...found];
}

export function parseFormSubmission(headers: unknown[], row: unknown[], rowIndex: number): FormSubmission {
  const responseIdIndex = findColumn(headers, ["деловодни", "број"]);
  const submittedAtIndex = findColumn(headers, ["временска", "ознака"]);
  const emailIndex = findColumn(headers, ["имејл", "адреса"], ["2"]);
  const organizationIndex = findColumn(headers, ["основна", "одгајивачка", "организација"], ["2"]);
  const typeIndex = findColumn(headers, ["врста", "захтева"]);
  const urgentIndex = findColumn(headers, ["хитна", "израда"]);
  const programIndex = findColumn(headers, ["одгајивачки", "програм"]);
  const countIndex = findColumn(headers, ["број", "грла", "захтеву"]);
  const sellerIndex = findColumn(headers, ["продавца"]);
  const buyerIndex = findColumn(headers, ["купца"]);
  const attachmentIndex = findColumn(headers, ["електронски", "потписан", "захтев"]);

  const responseId = cell(row, responseIdIndex) ?? `row-${rowIndex}`;
  const submittedAt = cell(row, submittedAtIndex);
  const email = cell(row, emailIndex);
  const organization = cell(row, organizationIndex);
  const requestType = cell(row, typeIndex);
  const urgentValue = cell(row, urgentIndex) ?? "";
  const breedingProgram = cell(row, programIndex);
  const countText = cell(row, countIndex);
  const declaredAnimalCount = parseCount(countText);
  const seller = cell(row, sellerIndex);
  const buyer = cell(row, buyerIndex);
  const attachmentCell = cell(row, attachmentIndex);
  const attachmentLinks = [...new Set((attachmentCell?.match(/https?:\/\/[^\s,;"']+/g) ?? []).map(link => link.replace(/[),.]+$/, "")))];
  const attachmentFileIds = extractDriveFileIds(attachmentCell);
  const checks: FormSubmission["checks"] = [];

  if (declaredAnimalCount === null) checks.push({ code: "invalid_animal_count", message: "Broj grla u odgovoru obrasca nedostaje ili nije ceo broj." });
  else if (declaredAnimalCount === 0) checks.push({ code: "zero_animal_count", message: "Obrazac navodi nula grla; zahtev mora na ručnu proveru." });
  if (attachmentLinks.length === 0) checks.push({ code: "missing_attachments", message: "U odgovoru obrasca nije pronađen link ka prilozima." });

  return {
    responseId, submittedAt, email, organization, requestType,
    urgent: /хитн|hitn/i.test(urgentValue), breedingProgram, declaredAnimalCount,
    seller, buyer, attachmentLinks, attachmentFileIds, checks,
  };
}
