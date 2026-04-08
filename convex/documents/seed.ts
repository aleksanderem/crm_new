import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { v, type GenericId } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";

// ---------------------------------------------------------------------------
// Seed form templates (formTemplates table)
// ---------------------------------------------------------------------------

/** One-time migration: add "treatment" to entityTypes on all templates that have "appointment" or "patient" */
export const migrateEntityTypes = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    let patched = 0;
    for (const t of all) {
      const types = new Set(t.entityTypes);
      let changed = false;
      if (types.has("appointment") && !types.has("treatment")) {
        types.add("treatment");
        changed = true;
      }
      if (types.has("patient") && !types.has("treatment")) {
        types.add("treatment");
        changed = true;
      }
      if (types.has("lead") && !types.has("company")) {
        types.add("company");
        changed = true;
      }
      if (changed) {
        await ctx.db.patch(t._id, { entityTypes: [...types], updatedAt: Date.now() });
        patched++;
      }
    }
    return { patched, total: all.length };
  },
});

/** One-time migration: assign folderPath to existing templates based on category + module */
const CATEGORY_FOLDER_MAP: Record<string, Record<string, string>> = {
  gabinet: {
    consent: "Gabinet/Zgody",
    intake: "Gabinet/Przyjęcia",
    prescription: "Gabinet/Recepty",
    referral: "Gabinet/Skierowania",
    medical_record: "Gabinet/Dokumentacja",
    protocol: "Gabinet/Protokoły",
  },
  crm: {
    contract: "CRM/Umowy",
    invoice: "CRM/Faktury",
  },
};

export const migrateFolderPaths = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const all = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    let patched = 0;
    for (const t of all) {
      if (t.folderPath) continue; // already has a folder
      const mod = (t.modules?.[0] ?? "platform") as string;
      const folderMap = CATEGORY_FOLDER_MAP[mod];
      const folder = folderMap?.[t.category];
      if (folder) {
        await ctx.db.patch(t._id, { folderPath: folder, updatedAt: Date.now() });
        patched++;
      }
    }
    return { patched, total: all.length };
  },
});

/** Authenticated version — callable from frontend */
export const seedFormTemplates = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    return await seedHandler(ctx, args.organizationId, user._id);
  },
});

/** Internal version — callable from CLI via `convex run` */
export const seedFormTemplatesInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await seedHandler(ctx, args.organizationId, args.userId);
  },
});

// ---------------------------------------------------------------------------
// Shared handler
// ---------------------------------------------------------------------------

async function seedHandler(
  ctx: MutationCtx,
  orgId: GenericId<"organizations">,
  userId: GenericId<"users">,
) {
  // Get existing template names to avoid duplicates
  const existingTemplates = await ctx.db
    .query("formTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();
  const existingNames = new Set(existingTemplates.map((t) => t.name));

  const now = Date.now();
  const templates = buildTemplates();

  let count = 0;
  for (const tmpl of templates) {
    // Skip if template with same name already exists
    if (existingNames.has(tmpl.name)) continue;
    await ctx.db.insert("formTemplates", {
      organizationId: orgId,
      ...tmpl,
      version: 1,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    count++;
  }

  return { skipped: false, count, message: `Seeded ${count} form templates` };
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

/**
 * Returns seed templates (placeholder — all templates now live in
 * buildBeautyDocumentTemplates below as TipTap document-type).
 */
function buildTemplates() {
  return [] as Array<{
    name: string;
    description: string;
    category: "consent" | "medical_record" | "prescription" | "referral" | "custom" | "contract" | "invoice" | "protocol" | "intake";
    folderPath: string;
    formJson: string;
    modules: string[];
    entityTypes: string[];
    requiresSignature: boolean;
    signatureConfig?: {
      method: "draw" | "click" | "sms" | "email_otp";
      signerRole: "patient" | "client" | "employee" | "external";
    };
  }>;
}


// ===========================================================================
// TipTap WYSIWYG-based beauty salon document templates (templateType: "document")
// ===========================================================================

// ---------------------------------------------------------------------------
// TipTap JSON node helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const txt = (text: string, marks?: Array<{ type: string }>): any =>
  ({ type: "text", text, ...(marks?.length ? { marks } : {}) });

const bold = (text: string): any => txt(text, [{ type: "bold" }]);
const italic = (text: string): any => txt(text, [{ type: "italic" }]);

const p = (...content: any[]): any =>
  ({ type: "paragraph", ...(content.length ? { content } : {}) });

const pCenter = (...content: any[]): any =>
  ({ type: "paragraph", attrs: { textAlign: "center" }, ...(content.length ? { content } : {}) });

const h2 = (text: string, center = false): any => ({
  type: "heading",
  attrs: { level: 2, ...(center ? { textAlign: "center" } : {}) },
  content: [{ type: "text", text }],
});

const h3 = (text: string): any => ({
  type: "heading",
  attrs: { level: 3 },
  content: [{ type: "text", text }],
});

const mention = (path: string): any => ({
  type: "variableMentionCurly",
  attrs: { id: path, label: path },
});

const formField = (
  fieldId: string,
  fieldType: string,
  label: string,
  opts?: { options?: string; required?: boolean; placeholder?: string },
): any => ({
  type: "formField",
  attrs: {
    fieldId,
    fieldType,
    label,
    options: opts?.options ?? "",
    required: opts?.required ?? false,
    placeholder: opts?.placeholder ?? "",
  },
});

const hr = (): any => ({ type: "horizontalRule" });

const bulletList = (...items: any[][]): any => ({
  type: "bulletList",
  content: items.map((content) => ({
    type: "listItem",
    content: [{ type: "paragraph", content }],
  })),
});

const tableRow = (...cells: { header?: boolean; content: any[] }[]): any => ({
  type: "tableRow",
  content: cells.map((c) => ({
    type: c.header ? "tableHeader" : "tableCell",
    attrs: { colspan: 1, rowspan: 1 },
    content: [{ type: "paragraph", content: c.content }],
  })),
});

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Shared document fragments
// ---------------------------------------------------------------------------

function docHeader(title: string): any[] {
  return [
    pCenter(mention("organization.name")),
    pCenter(italic("Salon kosmetyczny")),
    hr(),
    p(),
    h2(title, true),
    p(),
  ];
}

function patientDataSection(): any[] {
  return [
    h3("Dane klienta"),
    p(bold("Imię i nazwisko: "), mention("patient.firstName"), txt(" "), mention("patient.lastName")),
    p(bold("PESEL: "), mention("patient.pesel")),
    p(bold("Data urodzenia: "), mention("patient.dateOfBirth")),
    p(bold("Telefon: "), mention("patient.phone")),
    p(
      bold("Adres: "),
      mention("patient.address.street"),
      txt(", "),
      mention("patient.address.postalCode"),
      txt(" "),
      mention("patient.address.city"),
    ),
    p(),
  ];
}

function treatmentDataSection(): any[] {
  return [
    h3("Dane zabiegu"),
    p(bold("Nazwa zabiegu: "), mention("treatment.name")),
    p(bold("Opis: "), mention("treatment.description")),
    p(bold("Czas trwania: "), mention("treatment.duration"), txt(" min")),
    p(bold("Cena: "), mention("treatment.price"), txt(" PLN")),
    p(bold("Data wizyty: "), mention("appointment.date"), txt(", godz. "), mention("appointment.startTime")),
    p(
      bold("Specjalista: "),
      mention("employee.firstName"),
      txt(" "),
      mention("employee.lastName"),
      txt(" — "),
      mention("employee.specialization"),
    ),
    p(),
  ];
}

function signatureFooter(): any[] {
  return [
    p(),
    hr(),
    p(bold("Miejscowość i data: "), mention("patient.address.city"), txt(", "), mention("system.date_pl")),
    p(),
    p(),
    p(txt("........................................          ........................................")),
    p(txt("         Podpis klienta                                    Podpis osoby wykonującej")),
  ];
}

function signatureFooterClientOnly(): any[] {
  return [
    p(),
    hr(),
    p(bold("Miejscowość i data: "), mention("patient.address.city"), txt(", "), mention("system.date_pl")),
    p(),
    p(),
    p(txt("........................................")),
    p(txt("         Podpis klienta")),
  ];
}

// ---------------------------------------------------------------------------
// Template type definition
// ---------------------------------------------------------------------------

interface BeautyTemplate {
  name: string;
  description: string;
  category: "consent" | "intake" | "medical_record" | "protocol" | "custom";
  folderPath: string;
  templateType: "document";
  formJson: string;
  contentJson: string;
  modules: string[];
  entityTypes: string[];
  variableBindings?: string;
  requiresSignature: boolean;
  signatureConfig?: {
    method: "draw" | "click" | "sms" | "email_otp";
    signerRole: "patient" | "client" | "employee" | "external";
  };
}

// ---------------------------------------------------------------------------
// 1. Zgoda na przetwarzanie danych osobowych (RODO)
// ---------------------------------------------------------------------------

function buildRodoConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA PRZETWARZANIE DANYCH OSOBOWYCH"),
      pCenter(italic("(zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 — RODO)")),
      p(),
      ...patientDataSection(),
      hr(),
      h3("Klauzula informacyjna"),
      p(
        txt(
          "Administratorem Pani/Pana danych osobowych jest ",
        ),
        mention("organization.name"),
        txt(
          ". Dane osobowe będą przetwarzane w celu realizacji usług kosmetycznych, prowadzenia dokumentacji zabiegowej, kontaktu w sprawach związanych z umówionymi wizytami oraz — w przypadku wyrażenia odrębnej zgody — w celach marketingowych.",
        ),
      ),
      p(),
      p(
        txt(
          "Podstawę prawną przetwarzania danych stanowi art. 6 ust. 1 lit. a) oraz lit. b) RODO. Dane będą przechowywane przez okres niezbędny do realizacji celów przetwarzania, nie krócej jednak niż przez okres wymagany przepisami prawa.",
        ),
      ),
      p(),
      h3("Prawa osoby, której dane dotyczą"),
      bulletList(
        [txt("Prawo dostępu do swoich danych osobowych (art. 15 RODO)")],
        [txt("Prawo do sprostowania danych (art. 16 RODO)")],
        [txt("Prawo do usunięcia danych — \u201Eprawo do bycia zapomnianym\u201D (art. 17 RODO)")],
        [txt("Prawo do ograniczenia przetwarzania (art. 18 RODO)")],
        [txt("Prawo do przenoszenia danych (art. 20 RODO)")],
        [txt("Prawo do wniesienia sprzeciwu wobec przetwarzania (art. 21 RODO)")],
        [txt("Prawo do cofnięcia zgody w dowolnym momencie bez wpływu na zgodność z prawem przetwarzania dokonanego przed jej cofnięciem")],
        [txt("Prawo do wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("rodo_consent_processing", "checkbox", "Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji usług kosmetycznych i prowadzenia dokumentacji zabiegowej.", { required: true })),
      p(),
      p(formField("rodo_consent_contact", "checkbox", "Wyrażam zgodę na kontakt telefoniczny i/lub SMS w celu potwierdzania, przypominania o wizytach oraz informowania o zmianach terminów.", { required: true })),
      p(),
      p(formField("rodo_consent_marketing", "checkbox", "Wyrażam zgodę na przetwarzanie moich danych osobowych w celach marketingowych, w tym na otrzymywanie informacji o promocjach i nowych usługach drogą elektroniczną.")),
      p(),
      p(
        italic(
          "Podanie danych osobowych jest dobrowolne, jednak niezbędne do realizacji usług kosmetycznych. Brak zgody na przetwarzanie danych w celach podstawowych uniemożliwia świadczenie usług.",
        ),
      ),
      ...signatureFooterClientOnly(),
    ],
  };

  return {
    name: "Zgoda na przetwarzanie danych osobowych (RODO)",
    description: "Formularz zgody na przetwarzanie danych osobowych zgodnie z RODO — klauzula informacyjna, prawa klienta, zgody na przetwarzanie i marketing",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 2. Wywiad kosmetyczny
// ---------------------------------------------------------------------------

function buildCosmeticIntakeTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("WYWIAD KOSMETYCZNY"),
      ...patientDataSection(),
      hr(),
      h3("I. Typ skóry"),
      p(formField("skin_type", "select", "Typ skóry", { options: "sucha,normalna,mieszana,tłusta,wrażliwa", required: true })),
      p(),
      h3("II. Aktualne problemy skórne"),
      p(formField("acne", "checkbox", "Trądzik / zmiany trądzikowe")),
      p(formField("rosacea", "checkbox", "Trądzik różowaty (rosacea)")),
      p(formField("hyperpigmentation", "checkbox", "Przebarwienia / plamy pigmentacyjne")),
      p(formField("wrinkles", "checkbox", "Zmarszczki / utrata jędrności")),
      p(formField("dryness", "checkbox", "Nadmierna suchość / łuszczenie")),
      p(formField("oiliness", "checkbox", "Nadmierny łojotok")),
      p(formField("sensitivity", "checkbox", "Nadwrażliwość / skłonność do podrażnień")),
      p(formField("broken_capillaries", "checkbox", "Teleangiektazje / naczynka")),
      p(formField("scarring", "checkbox", "Blizny (potrądzikowe, pooperacyjne)")),
      p(formField("skin_conditions_other", "textarea", "Inne problemy skórne", { placeholder: "Proszę opisać inne problemy skórne..." })),
      p(),
      h3("III. Alergie i uczulenia"),
      p(bold("Alergie odnotowane w karcie pacjenta: "), mention("patient.allergies")),
      p(formField("cosmetic_allergies", "textarea", "Dodatkowe alergie / uczulenia na kosmetyki lub substancje", { placeholder: "Np. alergia na parabeny, lanoliny, olejki eteryczne..." })),
      p(),
      h3("IV. Przyjmowane leki"),
      p(formField("medications", "textarea", "Aktualnie przyjmowane leki (w tym suplementy, antykoncepcja)", { placeholder: "Wymienić nazwy leków i dawkowanie..." })),
      p(formField("retinoids", "checkbox", "Stosuję preparaty z retinoidami (retinol, tretynoina, izotretynoina)")),
      p(formField("anticoagulants", "checkbox", "Przyjmuję leki rozrzedzające krew (aspiryna, warfaryna, heparyna)")),
      p(formField("photosensitizing", "checkbox", "Przyjmuję leki fotouczulające (tetracykliny, NLPZ, diuretyki)")),
      p(),
      h3("V. Przebyte zabiegi i operacje"),
      p(formField("previous_treatments", "textarea", "Wcześniejsze zabiegi kosmetyczne / estetyczne", { placeholder: "Np. mezoterapia, laser, peeling, botoks — kiedy i gdzie wykonywane..." })),
      p(formField("surgeries", "textarea", "Przebyte operacje plastyczne / chirurgiczne w obrębie twarzy i ciała", { placeholder: "Rodzaj zabiegu, data, ewentualne powikłania..." })),
      p(),
      h3("VI. Stan zdrowia"),
      p(formField("pregnancy", "checkbox", "Jestem w ciąży lub podejrzewam ciążę")),
      p(formField("breastfeeding", "checkbox", "Karmię piersią")),
      p(formField("diabetes", "checkbox", "Choruję na cukrzycę")),
      p(formField("epilepsy", "checkbox", "Choruję na epilepsję")),
      p(formField("autoimmune_disease", "checkbox", "Choruję na chorobę autoimmunologiczną")),
      p(formField("herpes", "checkbox", "Mam nawracającą opryszczkę")),
      p(formField("pacemaker", "checkbox", "Posiadam rozrusznik serca lub implant metalowy")),
      p(formField("health_other", "textarea", "Inne choroby lub dolegliwości", { placeholder: "Proszę wymienić inne istotne informacje zdrowotne..." })),
      p(),
      h3("VII. Pielęgnacja domowa"),
      p(formField("home_care", "textarea", "Stosowane kosmetyki i rutyna pielęgnacyjna", { placeholder: "Opisz swoją codzienną pielęgnację (oczyszczanie, nawilżanie, ochrona UV)..." })),
      p(formField("sun_exposure", "select", "Ekspozycja na słońce", { options: "minimalna — unikam słońca,umiarkowana — stosuję filtr,częsta — nie stosuję ochrony,korzystam z solarium", required: true })),
      p(),
      h3("VIII. Oczekiwania i cele"),
      p(formField("expectations", "textarea", "Oczekiwania dotyczące zabiegów i pielęgnacji", { required: true, placeholder: "Czego oczekujesz od wizyt w naszym salonie? Jakie efekty chciałabyś/chciałbyś osiągnąć?" })),
      p(),
      p(italic("Oświadczam, że powyższe informacje są zgodne z prawdą i zostały podane dobrowolnie. Zobowiązuję się do niezwłocznego informowania o wszelkich zmianach w stanie zdrowia.")),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Wywiad kosmetyczny",
    description: "Szczegółowy kwestionariusz wywiadu kosmetycznego — typ skóry, alergie, leki, przebyte zabiegi, stan zdrowia, oczekiwania",
    category: "intake",
    folderPath: "Gabinet/Przyjęcia",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 3. Zgoda na zabieg kosmetyczny — ogólna
// ---------------------------------------------------------------------------

function buildGeneralCosmeticConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA ZABIEG KOSMETYCZNY"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Niniejszym oświadczam, że zostałam/em szczegółowo poinformowana/y przez osobę wykonującą zabieg o jego rodzaju, przebiegu, oczekiwanych efektach, możliwych powikłaniach oraz zalecanym postępowaniu pozabiegowym. Miałam/em możliwość zadawania pytań i uzyskałam/em na nie wyczerpujące odpowiedzi.",
        ),
      ),
      p(),
      h3("Przeciwwskazania"),
      p(bold("Przeciwwskazania do zabiegu: "), mention("treatment.contraindications")),
      p(),
      p(
        txt(
          "Oświadczam, że poinformowałam/em osobę wykonującą zabieg o wszelkich znanych mi przeciwwskazaniach, chorobach, alergiach, przyjmowanych lekach oraz ciąży/karmieniu piersią. Potwierdzam, że żadne z wymienionych przeciwwskazań mnie nie dotyczą lub zostały omówione ze specjalistą.",
        ),
      ),
      p(),
      h3("Zalecenia pozabiegowe"),
      p(mention("treatment.aftercareInstructions")),
      p(),
      h3("Oświadczenia i zgody"),
      p(formField("consent_informed", "checkbox", "Zostałam/em poinformowana/y o rodzaju zabiegu, jego przebiegu, oczekiwanych efektach i możliwych powikłaniach.", { required: true })),
      p(),
      p(formField("consent_contraindications", "checkbox", "Zostałam/em poinformowana/y o przeciwwskazaniach do zabiegu i oświadczam, że żadne z nich mnie nie dotyczą.", { required: true })),
      p(),
      p(formField("consent_aftercare", "checkbox", "Zostałam/em poinformowana/y o zaleceniach pozabiegowych i zobowiązuję się do ich przestrzegania.", { required: true })),
      p(),
      p(formField("consent_voluntary", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie powyższego zabiegu.", { required: true })),
      p(),
      p(formField("consent_notes", "textarea", "Uwagi dodatkowe", { placeholder: "Dodatkowe uwagi lub pytania..." })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na zabieg kosmetyczny — ogólna",
    description: "Uniwersalny formularz świadomej zgody na zabieg kosmetyczny z informacją o przeciwwskazaniach, ryzyku i zaleceniach pozabiegowych",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 4. Zgoda na zabiegi laserowe
// ---------------------------------------------------------------------------

function buildLaserConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA ZABIEGI LASEROWE"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu laserowym"),
      p(
        txt(
          "Zabieg laserowy polega na oddziaływaniu wiązki światła laserowego na skórę w celu osiągnięcia efektu terapeutycznego lub estetycznego. Rodzaj lasera, parametry zabiegu oraz liczba sesji dobierane są indywidualnie przez specjalistę w zależności od wskazań i typu skóry.",
        ),
      ),
      p(),
      h3("Możliwe działania niepożądane i powikłania"),
      bulletList(
        [txt("Rumień (zaczerwienienie) skóry — zazwyczaj ustępuje w ciągu 24–72 godzin")],
        [txt("Obrzęk w obszarze zabiegowym — zazwyczaj ustępuje w ciągu 48 godzin")],
        [txt("Oparzenie termiczne skóry — w rzadkich przypadkach, przy nieprawidłowych parametrach lub fototypie skóry")],
        [txt("Przebarwienia pozapalne (hiperpigmentacja) — mogą utrzymywać się przez kilka tygodni do kilku miesięcy")],
        [txt("Odbarwienia skóry (hipopigmentacja) — możliwe zwłaszcza u osób z ciemniejszą karnacją")],
        [txt("Pęcherze i strupy — rzadko, w przypadku zbyt intensywnych parametrów")],
        [txt("Blizny — niezwykle rzadko, przy nieprawidłowym gojeniu lub infekcji")],
        [txt("Zaostrzenie opryszczki — u osób z nawracającym zakażeniem wirusem HSV")],
      ),
      p(),
      h3("Bezwzględne przeciwwskazania"),
      bulletList(
        [txt("Ciąża i okres karmienia piersią")],
        [txt("Aktywna opalenizna (naturalna lub z solarium) w ciągu ostatnich 4 tygodni")],
        [txt("Stosowanie preparatów fotouczulających lub retinoidów")],
        [txt("Aktywne stany zapalne, infekcje lub rany w obszarze zabiegowym")],
        [txt("Cukrzyca niewyrównana, padaczka, choroby autoimmunologiczne w fazie aktywnej")],
        [txt("Skłonność do tworzenia blizn keloidowych")],
        [txt("Stosowanie leków immunosupresyjnych lub fotouczulających")],
        [txt("Obecność implantów metalowych w obszarze zabiegowym")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("laser_no_tan", "checkbox", "Oświadczam, że nie opalałam/em się (słońce, solarium, samoopalacz) w ciągu ostatnich 4 tygodni.", { required: true })),
      p(),
      p(formField("laser_no_retinoids", "checkbox", "Oświadczam, że nie stosuję retinoidów ani preparatów fotouczulających.", { required: true })),
      p(),
      p(formField("laser_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie żadne z wymienionych przeciwwskazań lub zostały one omówione ze specjalistą.", { required: true })),
      p(),
      p(formField("laser_risks_acknowledged", "checkbox", "Zostałam/em poinformowana/y o możliwych działaniach niepożądanych i akceptuję ryzyko związane z zabiegiem.", { required: true })),
      p(),
      p(formField("laser_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie zabiegu laserowego.", { required: true })),
      p(),
      p(formField("laser_notes", "textarea", "Uwagi dodatkowe", { placeholder: "Dodatkowe informacje lub pytania..." })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na zabiegi laserowe",
    description: "Formularz zgody na zabiegi laserowe — ryzyka (oparzenia, przebarwienia, rumień), przeciwwskazania, oświadczenia pacjenta",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 5. Zgoda na mezoterapię igłową
// ---------------------------------------------------------------------------

function buildMesotherapyConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA MEZOTERAPIĘ IGŁOWĄ"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Mezoterapia igłowa polega na śródskórnym podaniu substancji aktywnych za pomocą serii mikroiniekcji wykonywanych cienką igłą. Celem zabiegu jest poprawa jakości skóry, nawilżenie, odżywienie oraz stymulacja procesów regeneracyjnych. Zabieg wykonywany jest w warunkach aseptycznych przez wykwalifikowanego specjalistę.",
        ),
      ),
      p(),
      h3("Stosowane preparaty"),
      p(formField("meso_substance", "text", "Nazwa preparatu / substancji aktywnej", { required: true, placeholder: "Np. kwas hialuronowy nieusieciowany, koktajl witaminowy..." })),
      p(formField("meso_area", "text", "Obszar zabiegowy", { required: true, placeholder: "Np. twarz, szyja, dekolt, skóra głowy..." })),
      p(),
      h3("Możliwe działania niepożądane"),
      bulletList(
        [txt("Ból i dyskomfort w trakcie i bezpośrednio po zabiegu")],
        [txt("Rumień (zaczerwienienie) w miejscu iniekcji — ustępuje zwykle w ciągu 24–48 godzin")],
        [txt("Obrzęk — nasilony zwłaszcza w okolicy oczu, ustępuje w ciągu 1–3 dni")],
        [txt("Wybroczyny i siniaki — mogą utrzymywać się do 7–14 dni")],
        [txt("Grudki w miejscach wkłucia — ustępują samoistnie w ciągu kilku godzin")],
        [txt("Infekcja bakteryjna w miejscu wkłucia — rzadko, przy nieprzestrzeganiu zasad higieny")],
        [txt("Reakcja alergiczna na podany preparat — bardzo rzadko")],
        [txt("Ziarniniak — niezwykle rzadko")],
      ),
      p(),
      h3("Przeciwwskazania"),
      bulletList(
        [txt("Ciąża i okres karmienia piersią")],
        [txt("Aktywne infekcje skórne (opryszczka, grzybica, ropne zmiany) w obszarze zabiegowym")],
        [txt("Zaburzenia krzepnięcia krwi lub stosowanie leków przeciwzakrzepowych")],
        [txt("Choroby autoimmunologiczne w fazie aktywnej")],
        [txt("Alergia na składniki stosowanego preparatu")],
        [txt("Cukrzyca niewyrównana")],
        [txt("Skłonność do bliznowców")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("meso_informed", "checkbox", "Zostałam/em poinformowana/y o przebiegu zabiegu, stosowanych preparatach, możliwych działaniach niepożądanych i przeciwwskazaniach.", { required: true })),
      p(),
      p(formField("meso_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie żadne z wymienionych przeciwwskazań lub zostały one omówione ze specjalistą.", { required: true })),
      p(),
      p(formField("meso_allergy_check", "checkbox", "Oświadczam, że poinformowałam/em o wszystkich znanych mi alergiach.", { required: true })),
      p(),
      p(formField("meso_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie mezoterapii igłowej z użyciem wskazanego preparatu.", { required: true })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na mezoterapię igłową",
    description: "Formularz zgody na mezoterapię igłową — informacja o substancji, ryzyko (siniaki, obrzęk, infekcja), przeciwwskazania",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 6. Zgoda na wypełniacze (kwas hialuronowy)
// ---------------------------------------------------------------------------

function buildFillerConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA ZABIEG WYPEŁNIACZEM NA BAZIE KWASU HIALURONOWEGO"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Zabieg polega na śródskórnym lub podskórnym podaniu wypełniacza na bazie kwasu hialuronowego w celu korekcji objętości, konturowania rysów twarzy, wypełnienia zmarszczek lub modelowania ust. Kwas hialuronowy jest substancją naturalnie występującą w organizmie ludzkim, biodegradowalną — efekt zabiegu utrzymuje się od 6 do 18 miesięcy w zależności od zastosowanego preparatu i obszaru iniekcji.",
        ),
      ),
      p(),
      h3("Dane zabiegu"),
      p(formField("filler_product", "text", "Nazwa i producent preparatu", { required: true, placeholder: "Np. Juvederm Voluma, Restylane Lyft..." })),
      p(formField("filler_area", "text", "Obszar iniekcji", { required: true, placeholder: "Np. usta, bruzdy nosowo-wargowe, linia żuchwy, policzki..." })),
      p(formField("filler_volume", "text", "Planowana objętość preparatu (ml)", { required: true, placeholder: "Np. 1 ml" })),
      p(),
      h3("Możliwe działania niepożądane i powikłania"),
      bulletList(
        [txt("Obrzęk i zaczerwienienie w miejscu iniekcji — ustępuje w ciągu 1–7 dni")],
        [txt("Ból i tkliwość w obszarze zabiegowym — do kilku dni")],
        [txt("Wybroczyny i siniaki — mogą utrzymywać się 7–14 dni")],
        [txt("Asymetria — możliwa, korygowana na wizycie kontrolnej")],
        [txt("Guzki i nierówności — mogą wymagać masażu lub rozpuszczenia preparatu")],
        [txt("Reakcja alergiczna — bardzo rzadko")],
        [txt("Ziarniniak — rzadko, reakcja na ciało obce")],
        [bold("Okluzja naczyniowa"), txt(" — niezwykle rzadkie, ale poważne powikłanie mogące prowadzić do martwicy tkanek lub w skrajnych przypadkach do utraty wzroku. Wymaga natychmiastowej interwencji medycznej.")],
        [txt("Infekcja bakteryjna — rzadko")],
        [txt("Migracja preparatu poza obszar iniekcji — rzadko")],
      ),
      p(),
      h3("Przeciwwskazania"),
      bulletList(
        [txt("Ciąża i okres karmienia piersią")],
        [txt("Aktywne infekcje skórne w obszarze zabiegowym (opryszczka, trądzik, ropne zmiany)")],
        [txt("Alergia na kwas hialuronowy lub inne składniki preparatu")],
        [txt("Choroby autoimmunologiczne")],
        [txt("Zaburzenia krzepnięcia krwi")],
        [txt("Stosowanie leków immunosupresyjnych")],
        [txt("Obecność trwałych (niebiodegradowalnych) wypełniaczy w obszarze zabiegowym")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("filler_informed", "checkbox", "Zostałam/em poinformowana/y o przebiegu zabiegu, stosowanym preparacie, możliwych powikłaniach — w tym o ryzyku okluzji naczyniowej.", { required: true })),
      p(),
      p(formField("filler_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie wymienione przeciwwskazania lub zostały one omówione ze specjalistą.", { required: true })),
      p(),
      p(formField("filler_no_permanent", "checkbox", "Oświadczam, że nie posiadam trwałych (niebiodegradowalnych) wypełniaczy w planowanym obszarze zabiegowym.", { required: true })),
      p(),
      p(formField("filler_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie zabiegu iniekcji kwasu hialuronowego.", { required: true })),
      p(),
      p(formField("filler_notes", "textarea", "Uwagi dodatkowe", { placeholder: "Dodatkowe informacje, oczekiwania co do efektu..." })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na wypełniacze (kwas hialuronowy)",
    description: "Formularz zgody na iniekcje kwasu hialuronowego — produkt, obszar, objętość, ryzyka (okluzja naczyniowa, asymetria, ziarniniak)",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 7. Zgoda na toksynę botulinową
// ---------------------------------------------------------------------------

function buildBotoxConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA ZABIEG TOKSYNĄ BOTULINOWĄ"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Zabieg polega na domięśniowym podaniu toksyny botulinowej typu A w celu czasowego osłabienia czynności wybranych mięśni mimicznych, co prowadzi do wygładzenia zmarszczek dynamicznych. Efekt zabiegu pojawia się po 3–7 dniach, osiąga pełnię po około 14 dniach i utrzymuje się przez 3–6 miesięcy, po czym konieczne jest powtórzenie zabiegu.",
        ),
      ),
      p(),
      h3("Dane zabiegu"),
      p(formField("botox_product", "text", "Nazwa preparatu", { required: true, placeholder: "Np. Botox, Dysport, Xeomin, Bocouture..." })),
      p(formField("botox_areas", "text", "Obszary iniekcji", { required: true, placeholder: "Np. czoło, zmarszczka lwia, kurze łapki..." })),
      p(formField("botox_units", "text", "Planowana dawka (j.)", { required: true, placeholder: "Np. 50 j." })),
      p(),
      h3("Możliwe działania niepożądane"),
      bulletList(
        [txt("Ból, zaczerwienienie, obrzęk w miejscu iniekcji — ustępuje w ciągu kilku godzin do 2 dni")],
        [txt("Wybroczyny i siniaki — mogą utrzymywać się do 7–10 dni")],
        [txt("Ból głowy — może wystąpić w ciągu 24–48 godzin po zabiegu")],
        [txt("Opadnięcie powieki (ptoza) — rzadko, ustępuje samoistnie w ciągu 2–6 tygodni")],
        [txt("Opadnięcie brwi — przy nieprawidłowym rozmieszczeniu punktów iniekcji")],
        [txt("Asymetria mimiki twarzy — możliwa korekta dawką uzupełniającą po 2 tygodniach")],
        [txt("Uczucie ciężkości lub ściągnięcia w obszarze zabiegowym")],
        [txt("Suchość oczu lub nadmierne łzawienie — rzadko")],
        [txt("Reakcja alergiczna — niezwykle rzadko")],
      ),
      p(),
      h3("Przeciwwskazania"),
      bulletList(
        [txt("Ciąża i okres karmienia piersią")],
        [txt("Choroby nerwowo-mięśniowe (miastenia, zespół Lamberta-Eatona)")],
        [txt("Alergia na toksynę botulinową lub albuminę ludzką")],
        [txt("Aktywna infekcja w obszarze zabiegowym")],
        [txt("Stosowanie antybiotyków aminoglikozydowych")],
        [txt("Zaburzenia krzepnięcia krwi")],
      ),
      p(),
      h3("Zalecenia pozabiegowe"),
      bulletList(
        [txt("Nie pochylać się, nie kłaść się przez 4 godziny po zabiegu")],
        [txt("Nie dotykać, nie masować obszaru zabiegowego przez 24 godziny")],
        [txt("Unikać intensywnego wysiłku fizycznego przez 24–48 godzin")],
        [txt("Unikać sauny, gorących kąpieli i ekspozycji na słońce przez 48 godzin")],
        [txt("Nie spożywać alkoholu przez 24 godziny")],
        [txt("Zgłosić się na wizytę kontrolną po 14 dniach")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("botox_informed", "checkbox", "Zostałam/em poinformowana/y o przebiegu zabiegu, stosowanym preparacie, dawce, możliwych powikłaniach oraz zaleceniach pozabiegowych.", { required: true })),
      p(),
      p(formField("botox_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie wymienione przeciwwskazania lub zostały one omówione ze specjalistą.", { required: true })),
      p(),
      p(formField("botox_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie zabiegu toksyną botulinową.", { required: true })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na toksynę botulinową",
    description: "Formularz zgody na iniekcje toksyny botulinowej — preparat, dawka, obszary, ryzyka (ptoza, asymetria, ból głowy), zalecenia",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 8. Zgoda na peeling chemiczny
// ---------------------------------------------------------------------------

function buildChemicalPeelConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA PEELING CHEMICZNY"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Peeling chemiczny polega na kontrolowanym nałożeniu na skórę roztworu kwasu (lub mieszanki kwasów) w celu wywołania złuszczenia warstw naskórka i/lub skóry właściwej. Głębokość działania zależy od rodzaju i stężenia zastosowanego preparatu. Celem zabiegu jest poprawa struktury skóry, redukcja przebarwień, zmarszczek, blizn potrądzikowych oraz ogólna poprawa kolorytu i jędrności skóry.",
        ),
      ),
      p(),
      h3("Dane zabiegu"),
      p(formField("peel_type", "select", "Rodzaj peelingu", { options: "powierzchowny (superficial),średniogłęboki (medium),głęboki (deep)", required: true })),
      p(formField("peel_acid", "text", "Zastosowany kwas / preparat", { required: true, placeholder: "Np. kwas glikolowy 30%, kwas TCA 15%, kwas migdałowy 40%..." })),
      p(formField("peel_area", "text", "Obszar zabiegowy", { required: true, placeholder: "Np. twarz, szyja, dekolt, dłonie..." })),
      p(),
      h3("Możliwe działania niepożądane"),
      bulletList(
        [txt("Zaczerwienienie skóry — od kilku godzin (peeling powierzchowny) do kilku tygodni (peeling głęboki)")],
        [txt("Uczucie pieczenia i ściągania skóry w trakcie i po zabiegu")],
        [txt("Złuszczanie i łuszczenie się skóry — normalna reakcja, trwa 3–14 dni w zależności od głębokości")],
        [txt("Obrzęk — szczególnie w okolicy oczu, może utrzymywać się kilka dni")],
        [txt("Przebarwienia pozapalne — ryzyko wyższe u ciemnoskórych fototypów i przy braku ochrony UV")],
        [txt("Odbarwienia skóry — przy peelingach głębokich")],
        [txt("Nadwrażliwość skóry na słońce — utrzymuje się przez kilka tygodni po zabiegu")],
        [txt("Zaostrzenie opryszczki — u osób z nawracającym HSV")],
        [txt("Blizny — bardzo rzadko, przy peelingach głębokich lub nieprawidłowym gojeniu")],
      ),
      p(),
      h3("Przeciwwskazania"),
      bulletList(
        [txt("Ciąża i okres karmienia piersią")],
        [txt("Aktywna opalenizna lub solarium w ciągu ostatnich 2 tygodni")],
        [txt("Stosowanie retinoidów doustnych (izotretynoina) w ciągu ostatnich 6 miesięcy")],
        [txt("Aktywne infekcje skórne (opryszczka, grzybica, ropne zmiany)")],
        [txt("Rany otwarte lub stany zapalne w obszarze zabiegowym")],
        [txt("Skłonność do bliznowców")],
        [txt("Bielactwo nabyte w obszarze zabiegowym")],
        [txt("Stosowanie leków fotouczulających")],
      ),
      p(),
      h3("Zalecenia pozabiegowe"),
      bulletList(
        [txt("Bezwzględna ochrona przeciwsłoneczna (SPF 50+) przez minimum 4 tygodnie")],
        [txt("Nie odrywać, nie ściągać złuszczającego się naskórka")],
        [txt("Stosować delikatne preparaty nawilżające i łagodzące")],
        [txt("Unikać sauny, basenu, intensywnego wysiłku przez 48–72 godziny")],
        [txt("Nie stosować makijażu przez 24–48 godzin (peeling powierzchowny) lub dłużej (peeling głęboki)")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("peel_informed", "checkbox", "Zostałam/em poinformowana/y o rodzaju peelingu, stosowanym preparacie, przebiegu zabiegu, oczekiwanym przebiegu gojenia oraz możliwych powikłaniach.", { required: true })),
      p(),
      p(formField("peel_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie wymienione przeciwwskazania.", { required: true })),
      p(),
      p(formField("peel_spf_commitment", "checkbox", "Zobowiązuję się do stosowania ochrony przeciwsłonecznej SPF 50+ przez minimum 4 tygodnie po zabiegu.", { required: true })),
      p(),
      p(formField("peel_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie peelingu chemicznego.", { required: true })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na peeling chemiczny",
    description: "Formularz zgody na peeling chemiczny — rodzaj peelingu, kwas, ryzyka (złuszczanie, przebarwienia, blizny), zalecenia pozabiegowe",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 9. Zgoda na depilację laserową
// ---------------------------------------------------------------------------

function buildLaserHairRemovalConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA DEPILACJĘ LASEROWĄ"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Depilacja laserowa polega na selektywnym niszczeniu mieszków włosowych za pomocą wiązki światła laserowego. Melanina obecna w łodydze włosa absorbuje energię lasera, która przekształca się w ciepło i uszkadza komórki macierzyste mieszka włosowego. Skuteczność zabiegu zależy od fazy wzrostu włosa — jedynie włosy w fazie anagenu (aktywnego wzrostu) ulegają trwałemu usunięciu. Z tego powodu wymagana jest seria zabiegów (zwykle 6–10) w odstępach 4–8 tygodni.",
        ),
      ),
      p(),
      h3("Dane zabiegu"),
      p(formField("hair_removal_area", "text", "Obszar depilacji", { required: true, placeholder: "Np. pachy, bikini, nogi, twarz, klatka piersiowa..." })),
      p(formField("hair_removal_session", "text", "Numer sesji", { placeholder: "Np. 1/8, 3/6..." })),
      p(),
      h3("Możliwe działania niepożądane"),
      bulletList(
        [txt("Rumień i obrzęk wokół mieszków włosowych (perifolikularne) — normalna reakcja, ustępuje w ciągu 24–48 godzin")],
        [txt("Uczucie pieczenia i gorąca w trakcie i bezpośrednio po zabiegu")],
        [txt("Oparzenie skóry — przy nieprawidłowych parametrach lub zbyt ciemnej karnacji/opaleniźnie")],
        [txt("Przebarwienia pozapalne (hiperpigmentacja) — ryzyko wyższe u ciemnych fototypów")],
        [txt("Odbarwienia (hipopigmentacja) — mogą być trwałe")],
        [txt("Strupy i pęcherze — rzadko, przy zbyt intensywnych parametrach")],
        [txt("Paradoksalna hipertrichoza — niekontrolowany wzrost nowych włosów w sąsiedztwie obszaru zabiegowego, szczególnie na twarzy i szyi")],
        [txt("Blizny — niezwykle rzadko")],
        [txt("Zapalenie mieszków włosowych (folliculitis) — rzadko")],
      ),
      p(),
      h3("Przeciwwskazania"),
      bulletList(
        [txt("Ciąża i karmienie piersią")],
        [txt("Aktywna opalenizna (naturalna lub sztuczna) w ciągu ostatnich 4 tygodni")],
        [txt("Stosowanie preparatów samoopalających w ciągu ostatnich 2 tygodni")],
        [txt("Stosowanie retinoidów doustnych w ciągu ostatnich 6 miesięcy")],
        [txt("Aktywne infekcje skórne w obszarze zabiegowym")],
        [txt("Tatuaż w obszarze zabiegowym")],
        [txt("Epilacja woskiem, szarpanie lub depilacja elektryczna w ciągu ostatnich 4 tygodni (golenie jest dozwolone)")],
        [txt("Obecność implantów metalowych w bezpośrednim sąsiedztwie obszaru zabiegowego")],
        [txt("Cukrzyca niewyrównana, padaczka, choroby autoimmunologiczne w fazie aktywnej")],
      ),
      p(),
      h3("Przygotowanie do zabiegu"),
      bulletList(
        [txt("Ogolić obszar zabiegowy 24 godziny przed wizytą (nie wyrywać, nie woskować)")],
        [txt("Nie opalać się przez minimum 4 tygodnie przed zabiegiem")],
        [txt("Nie stosować kremów, dezodorantów ani perfum w dniu zabiegu na obszarze zabiegowym")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("hair_no_tan", "checkbox", "Oświadczam, że nie opalałam/em się i nie korzystałam/em z solarium ani samoopalacza w ciągu ostatnich 4 tygodni.", { required: true })),
      p(),
      p(formField("hair_no_waxing", "checkbox", "Oświadczam, że nie depilowałam/em włosów w obszarze zabiegowym metodami szarpiącymi (wosk, pęseta, depilator) w ciągu ostatnich 4 tygodni.", { required: true })),
      p(),
      p(formField("hair_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie wymienione przeciwwskazania.", { required: true })),
      p(),
      p(formField("hair_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie depilacji laserowej.", { required: true })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na depilację laserową",
    description: "Formularz zgody na depilację laserową — obszar, numer sesji, ryzyka (oparzenia, pigmentacja, paradoksalna hipertrichoza), przygotowanie",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 10. Zgoda na makijaż permanentny
// ---------------------------------------------------------------------------

function buildPermanentMakeupConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA MAKIJAŻ PERMANENTNY"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Informacja o zabiegu"),
      p(
        txt(
          "Makijaż permanentny (mikropigmentacja) polega na wprowadzeniu barwnika pod skórę za pomocą specjalistycznego urządzenia z jednorazowymi igłami. Zabieg wykonywany jest w celach estetycznych — podkreślenia i korekcji naturalnych rysów twarzy. Efekt utrzymuje się od 1 do 3 lat w zależności od techniki, rodzaju barwnika, typu skóry i sposobu pielęgnacji. Po okresie gojenia (4–6 tygodni) konieczna jest wizyta korekcyjna w celu uzupełnienia i doprecyzowania efektu.",
        ),
      ),
      p(),
      h3("Dane zabiegu"),
      p(formField("pmu_area", "select", "Obszar zabiegu", { options: "brwi,usta,eyeliner górny,eyeliner dolny,eyeliner górny i dolny,areola (brodawki sutkowe)", required: true })),
      p(formField("pmu_technique", "select", "Technika", { options: "microblading (włoskowa),powder brows (pudrowe),ombré brows,nano brows,aquarelle lips (akwarela ust),konturowanie ust,eyeliner klasyczny,eyeliner rozcieniowany", required: true })),
      p(formField("pmu_color", "text", "Wybrany kolor barwnika", { required: true, placeholder: "Np. jasny brąz, ciemny blond, różowy nude..." })),
      p(),
      h3("Możliwe działania niepożądane i powikłania"),
      bulletList(
        [txt("Obrzęk i zaczerwienienie — normalna reakcja, utrzymuje się 2–5 dni")],
        [txt("Ból i dyskomfort w trakcie i po zabiegu — mimo stosowania znieczulenia miejscowego")],
        [txt("Infekcja bakteryjna lub wirusowa — przy nieprzestrzeganiu zasad higieny i pielęgnacji pozabiegowej")],
        [txt("Reakcja alergiczna na barwnik — rzadko, zalecany test przed zabiegiem")],
        [txt("Asymetria kształtu — możliwa korekta na wizycie korekcyjnej")],
        [txt("Nierównomierne zatrzymanie barwnika — zależne od typu skóry i gojenia")],
        [txt("Zmiana koloru barwnika w czasie — może przybierać odcienie szarawe, różowawe lub niebieskawe")],
        [txt("Migracja barwnika — rozpływanie się poza zamierzony obszar")],
        [txt("Blizny — niezwykle rzadko, przy nieprawidłowej technice lub skłonności do bliznowców")],
        [txt("Zaostrzenie opryszczki wargowej — przy zabiegach na ustach, u osób z nawracającym HSV (zalecana profilaktyka acyklowirem)")],
      ),
      p(),
      h3("Przeciwwskazania"),
      bulletList(
        [txt("Ciąża i okres karmienia piersią")],
        [txt("Cukrzyca (szczególnie niewyrównana)")],
        [txt("Choroby autoimmunologiczne w fazie aktywnej")],
        [txt("Aktywna opryszczka w obszarze zabiegowym")],
        [txt("Stosowanie retinoidów doustnych w ciągu ostatnich 6 miesięcy")],
        [txt("Zaburzenia krzepnięcia krwi, stosowanie leków przeciwzakrzepowych")],
        [txt("Choroby nowotworowe w trakcie leczenia")],
        [txt("Skłonność do bliznowców")],
        [txt("Epilepsja")],
        [txt("Wiek poniżej 18 lat (bez zgody opiekuna prawnego)")],
      ),
      p(),
      h3("Oświadczenia"),
      p(formField("pmu_informed", "checkbox", "Zostałam/em poinformowana/y o przebiegu zabiegu, wybranej technice, barwniku, możliwych powikłaniach i konieczności wizyty korekcyjnej.", { required: true })),
      p(),
      p(formField("pmu_no_contraindications", "checkbox", "Oświadczam, że nie dotyczą mnie wymienione przeciwwskazania lub zostały one omówione ze specjalistą.", { required: true })),
      p(),
      p(formField("pmu_color_accepted", "checkbox", "Akceptuję wybrany kolor barwnika, mając świadomość, że ostateczny efekt kolorystyczny może się nieznacznie różnić po zagojeniu.", { required: true })),
      p(),
      p(formField("pmu_correction", "checkbox", "Zostałam/em poinformowana/y, że wizyta korekcyjna po 4–6 tygodniach jest integralną częścią zabiegu i jest niezbędna do osiągnięcia optymalnego efektu.", { required: true })),
      p(),
      p(formField("pmu_consent", "checkbox", "Wyrażam świadomą i dobrowolną zgodę na wykonanie makijażu permanentnego.", { required: true })),
      ...signatureFooter(),
    ],
  };

  return {
    name: "Zgoda na makijaż permanentny",
    description: "Formularz zgody na makijaż permanentny — obszar, technika (microblading, powder brows, ombré), kolor, ryzyka (asymetria, migracja barwnika)",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 11. Zgoda na dokumentację fotograficzną
// ---------------------------------------------------------------------------

function buildPhotographyConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA NA DOKUMENTACJĘ FOTOGRAFICZNĄ"),
      ...patientDataSection(),
      hr(),
      h3("Przedmiot zgody"),
      p(
        txt(
          "Niniejszym wyrażam zgodę na wykonanie dokumentacji fotograficznej (zdjęcia i/lub nagrania wideo) przed, w trakcie i po zabiegach kosmetycznych lub estetycznych wykonywanych w ",
        ),
        mention("organization.name"),
        txt(
          ". Dokumentacja fotograficzna stanowi integralną część dokumentacji zabiegowej i służy do oceny efektów terapeutycznych oraz planowania dalszego postępowania.",
        ),
      ),
      p(),
      h3("Zakres wykorzystania"),
      p(txt("Wyrażam zgodę na wykorzystanie wykonanej dokumentacji fotograficznej w następujących celach:")),
      p(),
      p(formField("photo_medical_record", "checkbox", "Dokumentacja zabiegowa — archiwizacja w kartotece pacjenta w celach medycznych i porównawczych (przed/po zabiegu).", { required: true })),
      p(),
      p(formField("photo_training", "checkbox", "Szkolenia wewnętrzne — wykorzystanie zdjęć w materiałach szkoleniowych dla personelu salonu (bez ujawniania danych osobowych).")),
      p(),
      p(formField("photo_marketing", "checkbox", "Materiały marketingowe — publikacja zdjęć na stronie internetowej, w materiałach drukowanych i reklamowych salonu (bez ujawniania danych osobowych).")),
      p(),
      p(formField("photo_social_media", "checkbox", "Media społecznościowe — publikacja zdjęć na profilach salonu w mediach społecznościowych (Facebook, Instagram, TikTok i inne) bez ujawniania danych osobowych.")),
      p(),
      p(formField("photo_press", "checkbox", "Publikacje branżowe — wykorzystanie zdjęć w artykułach, prezentacjach konferencyjnych i publikacjach branżowych (bez ujawniania danych osobowych).")),
      p(),
      h3("Warunki"),
      bulletList(
        [txt("Dokumentacja fotograficzna wykorzystywana poza dokumentacją zabiegową nie będzie zawierała danych umożliwiających identyfikację pacjenta (imię, nazwisko, PESEL), chyba że wyrażę na to odrębną, pisemną zgodę.")],
        [txt("Mam prawo cofnąć niniejszą zgodę w dowolnym momencie w formie pisemnej. Cofnięcie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego przed cofnięciem.")],
        [txt("Cofnięcie zgody nie obejmuje materiałów już opublikowanych, których usunięcie z obiegu nie jest technicznie możliwe.")],
      ),
      p(),
      p(italic("Niniejsza zgoda jest dobrowolna. Jej brak nie wpływa na jakość świadczonych usług kosmetycznych.")),
      ...signatureFooterClientOnly(),
    ],
  };

  return {
    name: "Zgoda na dokumentację fotograficzną",
    description: "Formularz zgody na wykonywanie i wykorzystanie dokumentacji fotograficznej — cele medyczne, szkoleniowe, marketingowe, media społecznościowe",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 12. Karta zabiegu (Treatment Protocol Card)
// ---------------------------------------------------------------------------

function buildTreatmentProtocolTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("KARTA ZABIEGU"),
      ...patientDataSection(),
      hr(),
      h3("Dane zabiegu"),
      {
        type: "table",
        content: [
          tableRow(
            { header: true, content: [bold("Parametr")] },
            { header: true, content: [bold("Wartość")] },
          ),
          tableRow(
            { content: [bold("Data wizyty")] },
            { content: [mention("appointment.date")] },
          ),
          tableRow(
            { content: [bold("Godzina")] },
            { content: [mention("appointment.startTime")] },
          ),
          tableRow(
            { content: [bold("Zabieg")] },
            { content: [mention("treatment.name")] },
          ),
          tableRow(
            { content: [bold("Kategoria")] },
            { content: [mention("treatment.category")] },
          ),
          tableRow(
            { content: [bold("Czas trwania")] },
            { content: [mention("treatment.duration"), txt(" min")] },
          ),
          tableRow(
            { content: [bold("Specjalista")] },
            { content: [mention("employee.firstName"), txt(" "), mention("employee.lastName")] },
          ),
          tableRow(
            { content: [bold("Nr licencji")] },
            { content: [mention("employee.licenseNumber")] },
          ),
        ],
      },
      p(),
      h3("Zastosowane produkty i preparaty"),
      p(formField("protocol_products", "textarea", "Produkty, preparaty, substancje aktywne (nazwa, seria, data ważności)", { required: true, placeholder: "Np. Kwas hialuronowy Juvederm Ultra 3, seria: AB1234, ważność: 2027-06..." })),
      p(),
      h3("Parametry urządzenia"),
      p(formField("protocol_device_settings", "textarea", "Urządzenie, ustawienia, parametry zabiegu", { placeholder: "Np. Laser Nd:YAG, długość fali: 1064 nm, fluencja: 40 J/cm², spot: 6 mm, częstotliwość: 2 Hz..." })),
      p(),
      h3("Obszar zabiegowy"),
      p(formField("protocol_area", "text", "Obszar / strefy zabiegowe", { required: true, placeholder: "Np. twarz — czoło, policzki, broda; szyja..." })),
      p(),
      h3("Przebieg zabiegu"),
      p(formField("protocol_procedure", "textarea", "Opis przebiegu zabiegu", { required: true, placeholder: "Opisz kolejne etapy zabiegu, reakcje skóry, tolerancję pacjenta..." })),
      p(),
      h3("Obserwacje i reakcje skóry"),
      p(formField("protocol_observations", "textarea", "Obserwacje — stan skóry, reakcje, ewentualne powikłania", { placeholder: "Np. lekki rumień, obrzęk perifolikularny, brak powikłań..." })),
      p(),
      h3("Zalecenia pozabiegowe"),
      p(bold("Standardowe zalecenia: "), mention("treatment.aftercareInstructions")),
      p(formField("protocol_custom_aftercare", "textarea", "Dodatkowe indywidualne zalecenia pozabiegowe", { placeholder: "Np. dodatkowe chłodzenie okładami, unikanie konkretnych preparatów..." })),
      p(),
      h3("Następna wizyta"),
      p(formField("protocol_next_visit", "text", "Zalecany termin następnej wizyty", { placeholder: "Np. za 4 tygodnie, po 14 dniach na kontrolę..." })),
      p(),
      hr(),
      p(bold("Specjalista wykonujący zabieg: "), mention("employee.firstName"), txt(" "), mention("employee.lastName")),
      p(bold("Data sporządzenia: "), mention("system.date_pl")),
    ],
  };

  return {
    name: "Karta zabiegu",
    description: "Protokół zabiegowy — dokumentacja przebiegu zabiegu, zastosowane produkty, parametry urządzenia, obserwacje, zalecenia pozabiegowe",
    category: "protocol",
    folderPath: "Gabinet/Protokoły",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment", "employee"],
    requiresSignature: false,
  };
}

// ---------------------------------------------------------------------------
// 13. Oświadczenie o stanie zdrowia
// ---------------------------------------------------------------------------

function buildHealthDeclarationTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("OŚWIADCZENIE O STANIE ZDROWIA"),
      ...patientDataSection(),
      hr(),
      h3("Choroby i schorzenia"),
      p(txt("Proszę zaznaczyć, jeśli obecnie choruje Pani/Pan lub chorowała/ł w przeszłości na poniższe schorzenia:")),
      p(),
      p(formField("health_diabetes", "checkbox", "Cukrzyca (typ 1, typ 2 lub ciążowa)")),
      p(formField("health_hypertension", "checkbox", "Nadciśnienie tętnicze")),
      p(formField("health_heart_disease", "checkbox", "Choroba serca (choroba wieńcowa, zastawkowa, niewydolność serca)")),
      p(formField("health_epilepsy", "checkbox", "Padaczka (epilepsja)")),
      p(formField("health_autoimmune", "checkbox", "Choroby autoimmunologiczne (toczeń, reumatoidalne zapalenie stawów, Hashimoto, bielactwo i inne)")),
      p(formField("health_hiv_hepatitis", "checkbox", "HIV / AIDS, wirusowe zapalenie wątroby (HBV, HCV)")),
      p(formField("health_keloids", "checkbox", "Skłonność do tworzenia blizn keloidowych lub przerostowych")),
      p(formField("health_blood_disorders", "checkbox", "Zaburzenia krzepnięcia krwi (hemofilia, trombocytopenia, choroba von Willebranda)")),
      p(formField("health_pacemaker", "checkbox", "Rozrusznik serca lub wszczepiony kardiowerter-defibrylator (ICD)")),
      p(formField("health_metal_implants", "checkbox", "Implanty metalowe (endoprotezy, płytki, śruby) w obszarze planowanego zabiegu")),
      p(formField("health_cancer", "checkbox", "Choroby nowotworowe (w trakcie leczenia lub w remisji)")),
      p(formField("health_thyroid", "checkbox", "Choroby tarczycy (nadczynność, niedoczynność)")),
      p(formField("health_skin_diseases", "checkbox", "Przewlekłe choroby skóry (łuszczyca, atopowe zapalenie skóry, bielactwo)")),
      p(formField("health_herpes", "checkbox", "Nawracająca opryszczka (HSV)")),
      p(formField("health_allergies_severe", "checkbox", "Ciężkie reakcje alergiczne (anafilaksja) w wywiadzie")),
      p(),
      p(formField("health_other_conditions", "textarea", "Inne choroby lub schorzenia nie wymienione powyżej", { placeholder: "Proszę wymienić wszelkie inne istotne informacje o stanie zdrowia..." })),
      p(),
      h3("Przyjmowane leki"),
      p(bold("Alergie odnotowane w karcie: "), mention("patient.allergies")),
      p(bold("Notatki medyczne: "), mention("patient.medicalNotes")),
      p(),
      p(formField("health_medications", "textarea", "Aktualnie przyjmowane leki (nazwa, dawka, częstotliwość)", { placeholder: "Np. Metformina 500mg 2x dziennie, Enarenal 5mg 1x rano..." })),
      p(formField("health_supplements", "textarea", "Suplementy diety i preparaty ziołowe", { placeholder: "Np. witamina D3 2000 j.m., omega-3, kurkumina..." })),
      p(formField("health_anticoagulants_detail", "checkbox", "Przyjmuję leki rozrzedzające krew (aspiryna, warfaryna, heparyna, riwaroksaban, dabigatran)")),
      p(formField("health_immunosuppressants", "checkbox", "Przyjmuję leki immunosupresyjne (metotreksat, cyklosporyna, sterydy systemowe)")),
      p(),
      h3("Alergie"),
      p(formField("health_allergy_latex", "checkbox", "Alergia na lateks")),
      p(formField("health_allergy_lidocaine", "checkbox", "Alergia na lidokainę lub inne środki znieczulające miejscowo")),
      p(formField("health_allergy_metals", "checkbox", "Alergia na metale (nikiel, kobalt)")),
      p(formField("health_allergy_detail", "textarea", "Inne alergie (leki, substancje, kosmetyki)", { placeholder: "Proszę wymienić wszelkie znane alergie..." })),
      p(),
      h3("Stan szczególny"),
      p(formField("health_pregnant", "checkbox", "Jestem w ciąży lub podejrzewam ciążę")),
      p(formField("health_breastfeeding", "checkbox", "Karmię piersią")),
      p(formField("health_recent_surgery", "checkbox", "Przeszłam/przeszedłem zabieg chirurgiczny w ciągu ostatnich 3 miesięcy")),
      p(formField("health_recent_surgery_detail", "textarea", "Jeśli tak — jaki zabieg i kiedy", { placeholder: "Rodzaj zabiegu, data..." })),
      p(),
      hr(),
      p(
        italic(
          "Oświadczam, że powyższe informacje są zgodne z prawdą i zostały podane w sposób pełny i rzetelny. Przyjmuję do wiadomości, że zatajenie istotnych informacji o stanie zdrowia może mieć wpływ na bezpieczeństwo i skuteczność zabiegów. Zobowiązuję się do niezwłocznego informowania personelu salonu o wszelkich zmianach w stanie zdrowia.",
        ),
      ),
      ...signatureFooterClientOnly(),
    ],
  };

  return {
    name: "Oświadczenie o stanie zdrowia",
    description: "Szczegółowa deklaracja stanu zdrowia — choroby, leki, alergie, implanty, stan szczególny (ciąża). Wymagane przed zabiegami inwazyjnymi",
    category: "medical_record",
    folderPath: "Gabinet/Dokumentacja",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// 14. Zgoda opiekuna osoby niepełnoletniej
// ---------------------------------------------------------------------------

function buildGuardianConsentTemplate(): BeautyTemplate {
  const doc = {
    type: "doc",
    content: [
      ...docHeader("ZGODA OPIEKUNA PRAWNEGO OSOBY NIEPEŁNOLETNIEJ"),
      ...patientDataSection(),
      ...treatmentDataSection(),
      hr(),
      h3("Dane opiekuna prawnego"),
      p(formField("guardian_name", "text", "Imię i nazwisko opiekuna prawnego", { required: true, placeholder: "Jan Kowalski" })),
      p(formField("guardian_pesel", "text", "PESEL opiekuna prawnego", { required: true, placeholder: "00000000000" })),
      p(formField("guardian_relationship", "select", "Stosunek pokrewieństwa / relacja", { options: "rodzic (matka),rodzic (ojciec),opiekun prawny,kurator", required: true })),
      p(formField("guardian_id_type", "select", "Rodzaj dokumentu tożsamości", { options: "dowód osobisty,paszport,karta pobytu", required: true })),
      p(formField("guardian_id_number", "text", "Numer dokumentu tożsamości", { required: true, placeholder: "ABC 123456" })),
      p(formField("guardian_phone", "text", "Numer telefonu opiekuna", { required: true, placeholder: "+48 600 000 000" })),
      p(),
      hr(),
      h3("Oświadczenie opiekuna prawnego"),
      p(
        txt(
          "Ja, niżej podpisana/y, jako opiekun prawny osoby niepełnoletniej — ",
        ),
        mention("patient.firstName"),
        txt(" "),
        mention("patient.lastName"),
        txt(
          ", ur. ",
        ),
        mention("patient.dateOfBirth"),
        txt(
          ", PESEL: ",
        ),
        mention("patient.pesel"),
        txt(
          " — oświadczam, co następuje:",
        ),
      ),
      p(),
      p(formField("guardian_informed", "checkbox", "Zostałam/em szczegółowo poinformowana/y o rodzaju planowanego zabiegu, jego przebiegu, oczekiwanych efektach, możliwych powikłaniach oraz zalecanym postępowaniu pozabiegowym.", { required: true })),
      p(),
      p(formField("guardian_contraindications", "checkbox", "Oświadczam, że przekazałam/em osobie wykonującej zabieg wszelkie znane mi informacje o stanie zdrowia osoby niepełnoletniej, w tym o alergiach, przyjmowanych lekach i przebytych chorobach.", { required: true })),
      p(),
      p(formField("guardian_risks", "checkbox", "Przyjmuję do wiadomości możliwe ryzyka i powikłania związane z zabiegiem oraz oświadczam, że miałam/em możliwość zadawania pytań i uzyskałam/em wyczerpujące odpowiedzi.", { required: true })),
      p(),
      p(formField("guardian_consent_final", "checkbox", "Wyrażam świadomą, dobrowolną zgodę na wykonanie powyższego zabiegu kosmetycznego na osobie niepełnoletniej, nad którą sprawuję opiekę prawną.", { required: true })),
      p(),
      p(formField("guardian_presence", "checkbox", "Oświadczam, że będę obecna/y w salonie przez cały czas trwania zabiegu lub wyrażam zgodę na jego wykonanie pod nieobecność (niepotrzebne skreślić).")),
      p(),
      h3("Informacje dodatkowe"),
      p(formField("guardian_notes", "textarea", "Dodatkowe uwagi opiekuna (np. szczególne obawy, pytania, informacje o stanie zdrowia)", { placeholder: "Dodatkowe informacje..." })),
      p(),
      hr(),
      p(
        italic(
          "Niniejsza zgoda została wyrażona dobrowolnie, po zapoznaniu się z pełną informacją o zabiegu. Opiekun prawny potwierdza swoją tożsamość okazanym dokumentem tożsamości.",
        ),
      ),
      p(),
      p(bold("Miejscowość i data: "), mention("patient.address.city"), txt(", "), mention("system.date_pl")),
      p(),
      p(),
      p(txt("........................................          ........................................")),
      p(txt("    Podpis opiekuna prawnego                          Podpis osoby wykonującej")),
      p(),
      p(txt("........................................")),
      p(txt("    Podpis osoby niepełnoletniej")),
      p(txt("    (jeśli ukończyła 16 lat)")),
    ],
  };

  return {
    name: "Zgoda opiekuna osoby niepełnoletniej",
    description: "Formularz zgody opiekuna prawnego na zabieg kosmetyczny osoby niepełnoletniej — dane opiekuna, dokument tożsamości, oświadczenia",
    category: "consent",
    folderPath: "Gabinet/Zgody",
    templateType: "document",
    formJson: "",
    contentJson: JSON.stringify(doc),
    modules: ["gabinet"],
    entityTypes: ["patient", "treatment", "appointment"],
    requiresSignature: true,
    signatureConfig: { method: "draw", signerRole: "patient" },
  };
}

// ---------------------------------------------------------------------------
// Build all beauty document templates
// ---------------------------------------------------------------------------

function buildBeautyDocumentTemplates(): BeautyTemplate[] {
  return [
    buildRodoConsentTemplate(),
    buildCosmeticIntakeTemplate(),
    buildGeneralCosmeticConsentTemplate(),
    buildLaserConsentTemplate(),
    buildMesotherapyConsentTemplate(),
    buildFillerConsentTemplate(),
    buildBotoxConsentTemplate(),
    buildChemicalPeelConsentTemplate(),
    buildLaserHairRemovalConsentTemplate(),
    buildPermanentMakeupConsentTemplate(),
    buildPhotographyConsentTemplate(),
    buildTreatmentProtocolTemplate(),
    buildHealthDeclarationTemplate(),
    buildGuardianConsentTemplate(),
  ];
}

// ---------------------------------------------------------------------------
// Shared handler for beauty document templates
// ---------------------------------------------------------------------------

async function seedBeautyHandler(
  ctx: MutationCtx,
  orgId: GenericId<"organizations">,
  userId: GenericId<"users">,
) {
  const existingTemplates = await ctx.db
    .query("formTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();
  const existingNames = new Set(existingTemplates.map((t) => t.name));

  const now = Date.now();
  const templates = buildBeautyDocumentTemplates();

  let count = 0;
  for (const tmpl of templates) {
    if (existingNames.has(tmpl.name)) continue;
    await ctx.db.insert("formTemplates", {
      organizationId: orgId,
      name: tmpl.name,
      description: tmpl.description,
      category: tmpl.category,
      folderPath: tmpl.folderPath,
      templateType: tmpl.templateType,
      formJson: tmpl.formJson,
      contentJson: tmpl.contentJson,
      modules: tmpl.modules,
      entityTypes: tmpl.entityTypes,
      variableBindings: undefined,
      requiresSignature: tmpl.requiresSignature,
      signatureConfig: tmpl.signatureConfig,
      version: 1,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    count++;
  }

  return { skipped: false, count, message: `Seeded ${count} beauty document templates` };
}

// ---------------------------------------------------------------------------
// Exported mutations
// ---------------------------------------------------------------------------

/** Authenticated version — callable from frontend */
export const seedBeautyDocumentTemplates = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    return await seedBeautyHandler(ctx, args.organizationId, user._id);
  },
});

/** Internal version — callable from CLI via `convex run` */
export const seedBeautyDocumentTemplatesInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await seedBeautyHandler(ctx, args.organizationId, args.userId);
  },
});
