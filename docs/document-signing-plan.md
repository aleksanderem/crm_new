# Plan: System podpisywania dokumentow

## Stan obecny

Mamy podstawowy szkielet:
- Template definiuje `signatureSlots` (id, role, label)
- Instancja dokumentu ma tablice `signatures` kopiowana z template przy tworzeniu
- Mutacja `sign` przyjmuje `slotId + signatureData` (base64 z canvas) — dziala tylko dla zalogowanych czlonkow organizacji
- `SignaturePad` — rysowanie podpisu na canvas, zwraca dataURL
- Viewer pokazuje sloty podpisow z przyciskiem "Podpisz"
- Status flow: draft -> pending_review -> approved -> pending_signature -> signed

## Czego brakuje

1. Nie mozna wyslac dokumentu do podpisu zewnetrznemu sygnatariuszowi (pacjent, klient)
2. Nie ma publicznej strony podpisywania (bez logowania)
3. Nie ma wyboru metody weryfikacji (click vs SMS OTP)
4. Nie ma integracji SMS
5. Nie ma powiadomien email o prosbie o podpis

---

## Proponowany plan

### ETAP 1: Model danych — rozszerzenie slotow podpisow

Zmiany w `documentTemplates.signatureSlots`:
```
signatureSlot: {
  id: string,
  role: "author" | "client" | "patient" | "employee" | "witness" | "custom",
  label: string,                          // np. "Podpis pacjenta"
  verificationMethod: "click" | "sms",    // NOWE — jak weryfikowac
  signerType: "internal" | "external",    // NOWE — user systemu vs zewnetrzny
}
```

Zmiany w `documentInstances.signatures`:
```
signatureEntry: {
  slotId: string,
  slotLabel: string,
  verificationMethod: "click" | "sms",

  // Kto ma podpisac (wypelniane przy wyslaniu do podpisu)
  signerType: "internal" | "external",
  signerUserId?: Id<"users">,            // jesli internal
  signerEmail?: string,                  // jesli external
  signerName?: string,                   // jesli external
  signerPhone?: string,                  // jesli external (potrzebne do SMS)

  // Status podpisu
  signatureData?: string,                // base64 PNG (canvas) lub "acknowledged"
  signedByUserId?: Id<"users">,
  signedByName?: string,
  signedAt?: number,

  // OTP
  otpCode?: string,                      // hash kodu SMS (nigdy plain text!)
  otpSentAt?: number,
  otpVerified?: boolean,
}
```

Nowa tabela `signatureRequests` (public access tokens):
```
signatureRequests: {
  organizationId: Id<"organizations">,
  instanceId: Id<"documentInstances">,
  slotId: string,
  token: string,            // crypto random, unikatowy, indeksowany
  signerEmail?: string,
  signerName?: string,
  signerPhone?: string,
  verificationMethod: "click" | "sms",
  status: "pending" | "signed" | "expired",
  expiresAt: number,        // np. 7 dni
  createdAt: number,
}
```

### ETAP 2: Flow "Wyslij do podpisu"

Przycisk "Wyslij do podpisu" w document-viewer (juz istnieje jako "Wyslij do podpisu"
przy statusie `approved`). Po kliknieciu otwiera sie dialog:

```
Dialog "Wyslij do podpisu"
+--------------------------------------------------+
| Slot: Podpis pacjenta                            |
| Metoda: [SMS OTP]  (z template, readonly)        |
|                                                  |
| Typ sygnatariusza: ( ) Uzytkownik systemu        |
|                    (x) Osoba zewnetrzna           |
|                                                  |
| Imie i nazwisko: [Jan Kowalski___]               |
| E-mail:          [jan@example.com]               |
| Telefon:         [+48 600 123 456] (wymagany     |
|                                      przy SMS)   |
+--------------------------------------------------+
| Slot: Podpis lekarza                             |
| Metoda: [Klikniecie]  (z template)               |
|                                                  |
| Typ: (x) Uzytkownik systemu                      |
| Wybierz: [Dr Anna Nowak v]                       |
+--------------------------------------------------+
|                    [Anuluj]  [Wyslij]             |
+--------------------------------------------------+
```

Po kliknieciu "Wyslij":
1. Dla kazdego slotu tworzy `signatureRequest` z unikalnym tokenem
2. Status dokumentu -> `pending_signature`
3. Wysyla email z linkiem do podpisania: `/sign/{token}`
4. Jesli sygnatariusz jest `internal` — dodaje tez notyfikacje in-app

### ETAP 3: Publiczna strona podpisywania `/sign/{token}`

Nowa strona BEZ wymogu logowania:
```
/sign/{token}
+--------------------------------------------------+
| Logo organizacji                                 |
|                                                  |
| Dokument do podpisania                           |
| "Umowa o swiadczenie uslug"                      |
| Organizacja: Klinika ABC                         |
|                                                  |
| [========= Rendered HTML dokumentu =========]    |
|                                                  |
| --- Twoj podpis ---                              |
| Podpisujesz jako: Jan Kowalski (Pacjent)         |
|                                                  |
| OPCJA A (click):                                 |
| [x] Potwierdzam zapoznanie sie z dokumentem      |
|     i wyrazam zgode na jego tresc.               |
| [Podpisz dokument]                               |
|                                                  |
| OPCJA B (sms):                                   |
| Wyslemy kod SMS na numer +48 600 *** 456         |
| [Wyslij kod]                                     |
| Kod SMS: [______]                                |
| [Weryfikuj i podpisz]                            |
|                                                  |
| OPCJONALNIE (jesli template ma pad):             |
| [======= Signature Pad canvas =======]           |
|                                                  |
+--------------------------------------------------+
```

Flow:
- Strona laduje token → walidacja (nie wygasl, nie uzyty)
- Pokazuje rendered HTML dokumentu (read-only)
- Metoda weryfikacji z templateslotu:
  - `click`: checkbox "Potwierdzam..." + przycisk
  - `sms`: przycisk "Wyslij kod" → SMS → input kodu → weryfikacja
- Po weryfikacji: mutacja `signExternal` zapisuje podpis
- Jesli wszystkie sloty podpisane → auto-transition do `signed`

### ETAP 4: Integracja SMS

Potrzebna konfiguracja SMS na poziomie organizacji.

Tabela `orgSmsConfig`:
```
orgSmsConfig: {
  organizationId: Id<"organizations">,
  provider: "twilio" | "smsapi",
  apiKey: string,         // zaszyfrowany
  apiSecret?: string,     // zaszyfrowany (Twilio)
  senderId?: string,      // np. "KlinikaABC" (nadawca SMS)
  fromNumber?: string,    // Twilio phone number
}
```

Rekomendacja providera:
- **SMSAPI.pl** — polski provider, tani, prosty REST API, idealny dla PL rynku
  - Wysylka: POST https://api.smsapi.pl/sms.do
  - Koszt: ~0.07 PLN/SMS
  - Nadawca alfanumeryczny (np. "KlinikaABC")
  - Nie wymaga numeru telefonu nadawcy
- **Twilio** — alternatywa miedzynarodowa, drozszy ale bardziej uniwersalny

UI konfiguracji: Settings > Integracje > SMS
```
+--------------------------------------------------+
| Konfiguracja SMS                                 |
|                                                  |
| Provider: [SMSAPI.pl v]                          |
| Token API: [********************************]    |
| Nadawca:   [KlinikaABC] (max 11 znakow)         |
|                                                  |
| [Wyslij testowy SMS]  [Zapisz]                   |
+--------------------------------------------------+
```

Convex action (nie mutation — wymaga HTTP call):
```ts
// convex/sms.ts
export const sendOtp = action({
  args: { signatureRequestId: Id<"signatureRequests"> },
  handler: async (ctx, args) => {
    // 1. Pobierz request + orgSmsConfig
    // 2. Wygeneruj 6-cyfrowy kod
    // 3. Wyslij SMS via SMSAPI/Twilio
    // 4. Zapisz hash kodu w signatureRequest
    // 5. Ustaw otpSentAt
  }
});

export const verifyOtp = mutation({
  args: { token: string, code: string },
  handler: async (ctx, args) => {
    // 1. Znajdz signatureRequest po token
    // 2. Porownaj hash kodu
    // 3. Jesli OK → otpVerified = true
    // 4. Pozwol na podpisanie
  }
});
```

### ETAP 5: Email z prosba o podpis

Wykorzystuje istniejacy system Resend:
```
Temat: Dokument do podpisania — "Umowa o swiadczenie uslug"

Czesc Jan,

Organizacja "Klinika ABC" prosi o podpisanie dokumentu:
"Umowa o swiadczenie uslug"

Kliknij ponizszy link aby przejrzec i podpisac dokument:
[Podpisz dokument] → https://app.example.com/sign/{token}

Link wazny do: 14.03.2026

Pozdrawiamy,
Klinika ABC
```

Dla internal userow: email + notyfikacja in-app z linkiem do
`/dashboard/documents/{instanceId}` (podpisuja w panelu).

### ETAP 6: Powiadomienia i audit

- Powiadomienie email do autora dokumentu gdy slot zostanie podpisany
- Powiadomienie email gdy wszystkie sloty podpisane
- Audit log: kto, kiedy, jaka metoda weryfikacji, IP address
- Mozliwosc ponownego wyslania (resend) jesli sygnatariusz nie podpisal

---

## Kolejnosc implementacji

```
Faza A: Model danych
  - Rozszerzenie schema (signatureSlots, signatures, signatureRequests, orgSmsConfig)
  - Backend: createSignatureRequests, signExternal, sendOtp, verifyOtp

Faza B: UI "Wyslij do podpisu"
  - Dialog wysylania z konfiguracjia sygnatariuszy
  - Integracja z document-viewer

Faza C: Publiczna strona /sign/{token}
  - Route bez auth
  - Widok dokumentu + formularz podpisu
  - Click verification flow
  - SMS OTP flow

Faza D: Integracja SMS
  - Settings UI dla konfiguracji SMS
  - Convex action dla SMSAPI/Twilio
  - Generacja i weryfikacja OTP

Faza E: Email + powiadomienia
  - Template emaila z Resend
  - In-app notyfikacje
  - Audit log entries
```

## Szacowana zlozonosc

- Faza A: 2 pliki backend, 1 schema update
- Faza B: 1 nowy komponent (send-for-signing-dialog), 1 update (document-viewer)
- Faza C: 1 nowa strona (public route), 1 nowy komponent (signing-page)
- Faza D: 1 backend action (sms.ts), 1 settings page
- Faza E: 1 email template, updates do istniejacych komponentow

## Uwagi do planu

1. Token w `signatureRequests` musi byc kryptograficznie bezpieczny (crypto.randomUUID
   lub lepiej 32-bajtowy hex). Indeks na tokenie dla szybkiego lookupu.

2. OTP code NIGDY nie jest przechowywany jako plain text — tylko hash (SHA-256).
   Kod 6-cyfrowy, wazny 10 minut, max 3 proby.

3. Publiczna strona `/sign/{token}` nie wymaga logowania, ale wymaga:
   - Walidacji tokena (istnieje, nie wygasl, nie uzyty)
   - Rate limiting na IP
   - CSRF protection

4. SMS provider config przechowuje API key zaszyfrowany. Klucz szyfrowania
   w env variable.

5. Alternatywa do SMS OTP: email OTP (tansze, nie wymaga konfiguracji SMS).
   Mozna dodac jako trzecia metoda weryfikacji: "click" | "sms" | "email_otp".
