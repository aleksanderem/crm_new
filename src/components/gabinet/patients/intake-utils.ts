export const INTAKE_GROUP_ORDER = [
  "diseases",
  "allergies",
  "medications",
  "devices",
  "other",
] as const;
export type IntakeGroupKey = (typeof INTAKE_GROUP_ORDER)[number];

const ALLERGY_KEYWORDS = ["alerg", "uczulen", "nadwrażliw", "nietolerancj"];
const MED_KEYWORDS = [
  "lek",
  "preparat",
  "suplement",
  "farmak",
  "dawkow",
  "przyjmow",
];
const DEVICE_KEYWORDS = [
  "implan",
  "rozrusznik",
  "protez",
  "urządzeni",
  "wszczep",
  "defibrylat",
  "endoprotez",
  "metalow",
  "stymulat",
];

export function classifyIntakeItem(item: string): IntakeGroupKey {
  const separatorIdx = item.indexOf(": ");
  const isTextField = separatorIdx !== -1;
  const label = isTextField ? item.slice(0, separatorIdx) : item;
  const lower = label.toLowerCase();

  if (ALLERGY_KEYWORDS.some((k) => lower.includes(k))) return "allergies";
  if (MED_KEYWORDS.some((k) => lower.includes(k))) return "medications";
  if (DEVICE_KEYWORDS.some((k) => lower.includes(k))) return "devices";
  return isTextField ? "other" : "diseases";
}

export function groupIntakeSummary(
  items: string[],
): { key: IntakeGroupKey; items: string[] }[] {
  const map: Record<IntakeGroupKey, string[]> = {
    diseases: [],
    allergies: [],
    medications: [],
    devices: [],
    other: [],
  };
  for (const item of items) {
    map[classifyIntakeItem(item)].push(item);
  }
  return INTAKE_GROUP_ORDER.filter((k) => map[k].length > 0).map((k) => ({
    key: k,
    items: map[k],
  }));
}
