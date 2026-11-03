export type IdentitySource = "serbian_register" | "attached_pedigree" | "institute_zemun_pedigree" | "missing";

export type AnimalIdentity = {
  animalId: string;
  birthDate?: string | null;
  registryNumber?: string | null;
  sireId?: string | null;
  damId?: string | null;
  breeder?: string | null;
  sex?: string | null;
  status?: "alive" | "dead" | string | null;
};

export type LactationRecord = {
  number: number;
  ongoing?: boolean;
  days?: number | null;
  milkKg?: number | null;
  fatPercent?: number | null;
  proteinPercent?: number | null;
};

export type OwnershipInterval = {
  owner: string;
  from: string;
  to?: string | null;
};

export type AnimalCase = {
  animalId: string;
  hasRsPrefix: boolean;
  hasInstituteZemunPedigree?: boolean;
  requested?: AnimalIdentity & {
    parity?: number | null;
    lactationCount?: number | null;
    smotraOrdinalNumber?: string | null;
    seller?: string | null;
    buyer?: string | null;
    saleDate?: string | null;
  };
  attachedPedigree?: AnimalIdentity | null;
  register?: AnimalIdentity | null;
  smotra?: { ordinalNumber?: string | null; date?: string | null; owner?: string | null } | null;
  airsOwnership?: OwnershipInterval[];
  milkRecord?: { parity?: number | null; lactations: LactationRecord[] } | null;
};

export type CaseCheck = {
  code: string;
  severity: "warning" | "needs_data";
  field?: string;
  expected?: string | number | null;
  actual?: string | number | null;
  message: string;
};

const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("sr-Latn").replace(/\s+/g, " ");
function dateValue(value: unknown): number {
  const text = String(value ?? "").trim();
  const local = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (local) {
    const year = Number(local[3].length === 2 ? `${Number(local[3]) >= 80 ? "19" : "20"}${local[3]}` : local[3]);
    const date = new Date(Date.UTC(year, Number(local[2]) - 1, Number(local[1])));
    return date.getUTCFullYear() === year && date.getUTCMonth() === Number(local[2]) - 1 && date.getUTCDate() === Number(local[1]) ? date.getTime() : NaN;
  }
  return Date.parse(text);
}
function canonical(field: keyof AnimalIdentity, value: unknown): string {
  const text = normalized(value);
  if (field === "animalId" || field === "sireId" || field === "damId") return text.replace(/^rs\s*/, "").replace(/\s+/g, "");
  if (field === "sex") {
    if (["m", "male", "muško", "musko", "mužjak", "muzjak"].includes(text)) return "male";
    if (["f", "female", "žensko", "zensko", "ženka", "zenka"].includes(text)) return "female";
  }
  if (field === "status") {
    if (["alive", "živo", "zivo", "živ", "ziv", "aktivan"].includes(text)) return "alive";
    if (["dead", "mrtvo", "uginulo", "izlučeno", "izluceno"].includes(text)) return "dead";
  }
  if (field === "birthDate") {
    const parsed = dateValue(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return text;
}
const same = (field: keyof AnimalIdentity, a: unknown, b: unknown) => canonical(field, a) === canonical(field, b);
const present = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";

function checkIdentity(
  submitted: AnimalIdentity | undefined,
  source: AnimalIdentity | null | undefined,
  sourceName: string,
): CaseCheck[] {
  if (!source) return [{ code: `missing_${sourceName}`, severity: "needs_data", message: `Nedostaje podatak iz ${sourceName === "register" ? "registra" : "priloženog pedigrea"}.` }];
  if (!submitted) return [];

  const fields: Array<[keyof AnimalIdentity, string]> = [
    ["birthDate", "datum rođenja"], ["registryNumber", "redni broj"], ["sireId", "otac"],
    ["damId", "majka"], ["breeder", "odgajivač"], ["sex", "pol"], ["status", "status životinje"],
  ];
  const checks: CaseCheck[] = [];
  for (const [field, label] of fields) {
    if (!present(source[field])) {
      checks.push({ code: `missing_${sourceName}_${field}`, severity: "needs_data", field, message: `U izvoru ${sourceName} nedostaje ${label}.` });
    } else if (present(submitted[field]) && !same(field, submitted[field], source[field])) {
      checks.push({ code: `identity_mismatch_${field}`, severity: "warning", field, expected: String(source[field]), actual: String(submitted[field]), message: `${label} se razlikuje od izvora ${sourceName}.` });
    }
  }
  return checks;
}

function ownerAt(date: string, intervals: OwnershipInterval[] = []): string | null {
  const day = dateValue(date);
  if (!Number.isFinite(day)) return null;
  const found = intervals
    .filter(x => present(x.owner) && Number.isFinite(dateValue(x.from)) && dateValue(x.from) <= day && (!present(x.to) || dateValue(x.to!) >= day))
    .sort((a, b) => dateValue(b.from) - dateValue(a.from))[0];
  return found?.owner ?? null;
}

function sameDay(a: string, b: string): boolean {
  const left = dateValue(a), right = dateValue(b);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

export function evaluateAnimalCase(input: AnimalCase): CaseCheck[] {
  const checks: CaseCheck[] = [];
  const id = input.animalId.trim().replace(/^RS\s*/i, "");
  if (!/^\d{10}$/.test(id)) checks.push({ code: "invalid_animal_id", severity: "needs_data", message: "ID grla mora imati deset cifara; RS prefiks se zanemaruje pri poređenju." });

  const source: IdentitySource = input.hasRsPrefix
    ? input.hasInstituteZemunPedigree ? "institute_zemun_pedigree" : "serbian_register"
    : "attached_pedigree";
  if (source === "serbian_register") checks.push(...checkIdentity(input.requested, input.register, "register"));
  else if (source === "attached_pedigree" || source === "institute_zemun_pedigree") {
    checks.push(...checkIdentity(input.requested, input.attachedPedigree, "pedigree"));
  } else checks.push({ code: "missing_identity_source", severity: "needs_data", message: "Nije određen izvor identiteta grla." });

  const smotra = input.smotra;
  if (!smotra) checks.push({ code: "missing_smotra", severity: "needs_data", message: "Nedostaje zapis o smotri." });
  else {
    if (!present(smotra.ordinalNumber)) checks.push({ code: "missing_smotra_ordinal", severity: "needs_data", message: "Nedostaje redni broj grla u smotri." });
    else if (present(input.requested?.smotraOrdinalNumber) && normalized(input.requested?.smotraOrdinalNumber) !== normalized(smotra.ordinalNumber)) {
      checks.push({ code: "smotra_ordinal_mismatch", severity: "warning", expected: input.requested?.smotraOrdinalNumber, actual: smotra.ordinalNumber, message: "Redni broj u smotri se razlikuje od broja navedenog u zahtevu." });
    }
    if (!present(smotra.date)) checks.push({ code: "missing_smotra_date", severity: "needs_data", message: "Nedostaje datum smotre." });
    if (!present(smotra.owner)) checks.push({ code: "missing_smotra_owner", severity: "needs_data", message: "Nedostaje vlasnik naveden u smotri." });
    else if (present(smotra.date)) {
      const owner = ownerAt(smotra.date!, input.airsOwnership);
      if (!owner) checks.push({ code: "airs_owner_unknown_on_smotra_date", severity: "needs_data", message: "Iz dostupnih AIRS kretanja nije moguće utvrditi vlasnika na datum smotre." });
      else if (normalized(owner) !== normalized(smotra.owner)) checks.push({ code: "smotra_airs_owner_mismatch", severity: "warning", field: "owner", expected: owner, actual: smotra.owner, message: "Vlasnik u smotri se ne poklapa sa AIRS vlasnikom na taj datum; proveriti eventualnog međuvlasnika." });
    }
  }

  const transfer = input.requested;
  if (transfer && (present(transfer.seller) || present(transfer.buyer) || present(transfer.saleDate))) {
    if (typeof transfer.seller !== "string" || typeof transfer.buyer !== "string" || typeof transfer.saleDate !== "string" || !transfer.seller.trim() || !transfer.buyer.trim() || !transfer.saleDate.trim()) {
      checks.push({ code: "incomplete_requested_transfer", severity: "needs_data", message: "Za proveru promene vlasništva nedostaje prodavac, kupac ili datum prodaje iz zahteva." });
    } else {
      const saleDay = dateValue(transfer.saleDate);
      if (!Number.isFinite(saleDay)) {
        checks.push({ code: "invalid_requested_sale_date", severity: "needs_data", field: "saleDate", actual: transfer.saleDate, message: "Datum prodaje iz zahteva nije moguće protumačiti." });
      } else {
        const priorDay = new Date(saleDay - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const oldOwner = ownerAt(priorDay, input.airsOwnership);
        const newOwner = ownerAt(transfer.saleDate, input.airsOwnership);
        if (!oldOwner || !newOwner) {
          checks.push({ code: "airs_transfer_unknown", severity: "needs_data", message: "AIRS kretanja ne pokrivaju datum pre i datum promene vlasništva iz zahteva." });
        } else {
          if (normalized(oldOwner) !== normalized(transfer.seller)) checks.push({ code: "airs_old_owner_mismatch", severity: "warning", expected: transfer.seller, actual: oldOwner, message: "AIRS vlasnik pre datuma prodaje se razlikuje od prodavca navedenog u zahtevu." });
          if (normalized(newOwner) !== normalized(transfer.buyer)) checks.push({ code: "airs_new_owner_mismatch", severity: "warning", expected: transfer.buyer, actual: newOwner, message: "AIRS vlasnik na datum prodaje se razlikuje od kupca navedenog u zahtevu." });
          const buyerStart = input.airsOwnership?.filter(x => normalized(x.owner) === normalized(transfer.buyer!) && dateValue(x.from) >= saleDay).sort((a, b) => dateValue(a.from) - dateValue(b.from))[0]?.from;
          if (buyerStart && !sameDay(buyerStart, transfer.saleDate!)) checks.push({ code: "airs_transfer_date_mismatch", severity: "warning", expected: transfer.saleDate, actual: buyerStart, message: "Datum promene vlasnika u AIRS-u se razlikuje od datuma prodaje u zahtevu." });
          if (normalized(newOwner) !== normalized(transfer.seller) && normalized(newOwner) !== normalized(transfer.buyer)) {
            checks.push({ code: "airs_intermediary_owner", severity: "warning", field: "owner", expected: `${transfer.seller} → ${transfer.buyer}`, actual: newOwner, message: "Na datum prodaje AIRS prikazuje trećeg vlasnika; proveriti međuvlasnika i redosled prenosa." });
          }
        }
      }
    }
  }

  const milk = input.milkRecord;
  if (milk) {
    const lactations = milk.lactations ?? [];
    const declaredParity = input.requested?.parity;
    if (present(declaredParity) && present(milk.parity) && declaredParity !== milk.parity) checks.push({ code: "parity_mismatch", severity: "warning", expected: declaredParity, actual: milk.parity, message: "Paritet iz zahteva se razlikuje od pariteta u matičnom listu." });
    if (present(input.requested?.lactationCount) && present(milk.parity) && input.requested?.lactationCount !== milk.parity) checks.push({ code: "parity_lactation_count_mismatch", severity: "warning", expected: milk.parity, actual: input.requested?.lactationCount, message: "Broj laktacija u zahtevu se ne poklapa sa paritetom iz matičnog lista." });
    if (present(input.requested?.lactationCount) && lactations.length !== input.requested?.lactationCount) checks.push({ code: "lactation_row_count_mismatch", severity: "warning", expected: input.requested?.lactationCount, actual: lactations.length, message: "Broj prikazanih laktacija se razlikuje od broja navedenog u zahtevu." });
    const numbers = lactations.map(x => x.number).filter(Number.isInteger);
    const maximum = Math.max(0, ...numbers);
    const missing = Array.from({ length: maximum }, (_, i) => i + 1).filter(n => !numbers.includes(n));
    if (missing.length) checks.push({ code: "missing_lactations", severity: "warning", field: "lactations", actual: missing.join(", "), message: `Nedostaju podaci za laktaciju/e: ${missing.join(", ")}.` });
    const duplicateNumbers = numbers.filter((number, index) => numbers.indexOf(number) !== index);
    if (duplicateNumbers.length) checks.push({ code: "duplicate_lactation_numbers", severity: "warning", field: "lactations", actual: [...new Set(duplicateNumbers)].join(", "), message: `Broj laktacije se ponavlja: ${[...new Set(duplicateNumbers)].join(", ")}.` });
    for (const lactation of lactations) {
      if (!Number.isInteger(lactation.number) || lactation.number < 1) {
        checks.push({ code: "invalid_lactation_number", severity: "needs_data", field: "lactations", actual: lactation.number, message: "Broj laktacije nije ispravan." });
      } else if (!present(lactation.days) || !present(lactation.milkKg) || !Number.isFinite(Number(lactation.days)) || !Number.isFinite(Number(lactation.milkKg))) {
        checks.push({ code: lactation.ongoing ? "ongoing_lactation" : "incomplete_lactation_data", severity: "needs_data", field: `lactation_${lactation.number}`, message: lactation.ongoing ? `${lactation.number}. laktacija je u toku; proizvodnja još nije konačna.` : `Za ${lactation.number}. laktaciju nedostaje broj dana ili količina mleka; potrebna je ručna provera matičnog lista.` });
      } else if (Number(lactation.days) <= 0 || Number(lactation.milkKg) < 0) {
        checks.push({ code: "invalid_lactation_values", severity: "warning", field: `lactation_${lactation.number}`, actual: `${lactation.days} dana / ${lactation.milkKg} kg`, message: `Dani ili količina mleka za ${lactation.number}. laktaciju nisu mogući; proveriti matični list.` });
      }
    }

    for (const lactation of lactations) {
      if (Number(lactation.days) > 0 && Number(lactation.milkKg) >= 0 && Number(lactation.milkKg) / Number(lactation.days) > 40) {
        checks.push({ code: "high_daily_milk", severity: "warning", field: `lactation_${lactation.number}`, expected: 40, actual: Number((Number(lactation.milkKg) / Number(lactation.days)).toFixed(2)), message: `Prosek mleka u ${lactation.number}. laktaciji prelazi maksimalnih 40 kg/dan.` });
      }
      for (const [field, label] of [["fatPercent", "mlečna mast"], ["proteinPercent", "protein"]] as const) {
        const value = lactation[field];
        if (typeof value === "number" && value > 4.7) checks.push({ code: `high_${field}`, severity: "warning", field: `lactation_${lactation.number}`, actual: value, message: `${label} prelazi 4,7% u ${lactation.number}. laktaciji.` });
      }
    }
  }
  return checks;
}

export function resolveIdentitySource(hasRsPrefix: boolean, hasInstituteZemunPedigree = false): IdentitySource {
  if (!hasRsPrefix) return "attached_pedigree";
  return hasInstituteZemunPedigree ? "institute_zemun_pedigree" : "serbian_register";
}
