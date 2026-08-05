# Spec: Automatyczny triage zgłoszeń GitHub/Jam względem planu uruchomienia

Data: 2026-08-05
Status: zatwierdzony kierunek (brainstorming z użytkownikiem), do przeglądu przed planem

## Cel

Wstawić do istniejącego pipeline'u automatyzacji (worker na Hetznerze, kolejka
SQLite, ingest przez webhook GitHub) **etap triage'u tuż przed tym, jak worker
bierze zadanie**. Dla każdego nowego zgłoszenia (issue GitHub + ewentualny link
Jam) agent rozstrzyga, czy mieści się ono w planie uruchomienia produkcyjnego,
zapisuje werdykt w dwóch miejscach (baza planu + widoczny feedback na GitHubie),
ustawia jego pozycję w kolejce workera zgodnie z planem, utrzymuje plan (Wiki)
w zgodzie z rzeczywistością, i egzekwuje politykę anty-abuse.

Powód: bez triage'u worker bierze zgłoszenia ślepo (FIFO), a placowie mieszają
realne zadania planu z presją, śmieciem i gamingiem. Bez pętli zwrotnej do Wiki
podstawa logiczna triage'u dezaktualizuje się po kilku zgłoszeniach.

## Źródła prawdy (odkryte podczas rozpoznania)

- **Wiki „Quera"** (space_id `7668013140696632855`) — „Dokumentacja projektowa",
  9 dokumentów docx opisujących logikę planu. Kluczowe:
  - `05 · Plan wdrożenia produkcyjnego` (41 pozycji / 6 faz; wskazuje bazę),
  - `08 · Sekwencja uruchomienia — dziewięć pakietów` (68 zadań w 9 pakietach
    PK1–PK9, każdy z twardym „warunkiem zamknięcia").
- **Base „Team OKR Tasks"** — app_token `BEm9bfWsFa0dHasHlu6j5ynkpSd`,
  table_id `tbl61BNGL8JLsUpF`, **78 rekordów**. Pola: `Pakiet` (select PK1–PK9),
  `Faza` (select F0–…), `Priorytet` (select: P0 – blokuje start / P1 – przed
  pierwszym klientem / P2 – po starcie), `Kolejność` (number), `Moduł` (select),
  `Obszar` (select), `Status realizacji` (select: Do zrobienia / Zrobione),
  `Zależności` (text), `Opis` (text), `Estymacja` (text), `Zadanie` (text),
  `Task leader` (user). Druga tabela `Task breakdown` (tblGCdUOjk76klgG) — poza
  zakresem MVP.
- **Dostęp:** `lark-cli` (zalogowany, brand lark, user+bot ready; scope'y wiki/
  base/task nadane). Rozkład planu na dziś: PK1=14 zadań, PK2=5, PK3=6, PK4=9,
  PK5=4, PK6=9, PK7=6, PK8=8, PK9=7, bez pakietu=10; 76 „Do zrobienia", 2
  „Zrobione"; priorytety P0=31/P1=33/P2=14.
- **Kolejka/worker:** `automation/worker/` (webhook.mjs → SQLite → worker.mjs
  `claimNext` → run-claude.sh). Mechanizmy `PAUSED_LOGINS`/`THROTTLED_LOGINS`
  już wersjonowane (PR #3633).

## Decyzje produktowe (zatwierdzone)

1. **Werdykt zapisywany podwójnie:** rekord w „Team OKR Tasks" (gdy pasuje lub
   jako backlog) ORAZ komentarz+etykieta na issue GitHub — ZAWSZE. Twarde
   wymaganie: osoba zgłaszająca musi widzieć werdykt (przyjęte i gdzie / odrzucone
   i dlaczego), nigdy „w próżnię".
2. **Autonomia: w pełni auto.** Agent sam ocenia, tworzy rekord i od razu
   komentuje/etykietuje. Przy niskiej pewności dopasowania werdykt jest oznaczony
   jako „wstępny, do weryfikacji", żeby błędne auto-decyzje dało się łapać.
3. **Trigger:** triage to etap w istniejącym pipelinie, między `pending` a
   `claimable`. Bez nowego wyzwalacza i bez pollingu. Jam wchodzi jako link w
   treści issue (agent analizuje konsolę/network/repro z nagrania).
4. **Kolejność workera:** `claimNext` bierze wg planu (Pakiet→Kolejność,
   Priorytet P0→P1→P2), backlog na końcu; paused/banned wykluczeni.
5. **Pętla zwrotna do Wiki:** korekty faktyczne (status „to już zrobione",
   naprawiony problem) — auto; zmiany strukturalne planu (nowy PK, unieważniony
   warunek zamknięcia) — oznaczane do akceptacji człowieka.
6. **Policy / anti-abuse:** nacisk użytkownika nie jest argumentem; wykrywanie
   gamingu multi-konto; ton dla Anny Słockiej po polsku, szorstki i krytyczny
   (celuje w zachowanie, nie w osobę — moderacja, nie harassment); system
   strike'ów.
7. **Eskalacja kar:** agent auto liczy strike'i i komunikuje; przy 5. strike'u
   auto dodaje login na blocklistę (permanentny ban — zero przetwarzania); krok
   6 (usunięcie z kolaboratorów repo) agent tylko REKOMENDUJE, wykonanie zostaje
   przy człowieku. Usunięcia samego konta GitHub nie da się i nie robimy.

## Architektura

```
webhook → [pending] → TRIAGE (nowy etap) → [triaged: PK+priorytet+pozycja | backlog | rejected]
                          │                        → worker claimNext (wg planu) → run-claude.sh
                          ├─ zapis werdyktu: rekord "Team OKR Tasks" (jeśli pasuje/backlog)
                          ├─ komentarz+etykieta na issue GitHub (zawsze)
                          ├─ policy engine: presja / multi-konto / strike'i / ban
                          └─ pętla Wiki: korekty faktyczne auto, strukturalne → flaga
```

### Komponenty (jednostki o jasnych granicach)

1. **Triage evaluator** — wejście: job (issue title/body/comment, trigger_login,
   ewentualny Jam link). Analizuje Jam (jeśli jest). Porównuje z planem
   (rekordy „Team OKR Tasks" + warunki zamknięcia z Wiki). Wyjście: werdykt
   `{ fits: bool, package: "PK1".."PK9"|null, priority, module, order_hint,
   confidence: 0..1, rationale, policy_flags[] }`. Czysta logika oceny —
   testowalna na fixture'ach issue.

2. **Dual writer** — na podstawie werdyktu: (a) upsert rekordu w „Team OKR
   Tasks" przez `lark-cli base +record-create` (Pakiet, Priorytet dziedziczony z
   PK, Kolejność, Moduł, Źródło=link do issue/Jam, Opis=streszczenie); (b)
   `gh issue comment` + `gh issue edit --add-label` na issue. Backlog = rekord z
   Pakiet=(brak) + etykieta `triage:backlog`.

3. **Queue orderer** — rozszerzenie `claimNext` w worker.mjs: kolejność po
   `triage_priority` (P0<P1<P2) i `triage_order` (Kolejność z planu), backlog i
   untriaged po realnych zadaniach; wyklucza PAUSED_LOGINS i BANNED_LOGINS.
   Nietriaged joby nie są brane, dopóki triage ich nie oznaczy.

4. **Policy engine** — reguły anty-abuse (osobny moduł, patrz niżej). Utrzymuje
   ledger strike'ów (SQLite) i blocklistę; produkuje policy_flags dla evaluatora
   i komunikaty kar.

5. **Wiki feedback** — gdy triage potwierdza zmianę stanu planu: korekty
   faktyczne (Base `Status realizacji` → Zrobione; nota w odpowiednim docu Wiki)
   auto; zmiany strukturalne → draft + flaga do akceptacji.

## Model danych (zmiany)

### Job (SQLite, tabela `jobs`) — nowe kolumny
- `triage_status` TEXT (`untriaged` | `triaged` | `backlog` | `rejected`), default `untriaged`
- `triage_package` TEXT (PK1..PK9 | null)
- `triage_priority` TEXT (P0|P1|P2 | null)
- `triage_order` INTEGER (Kolejność z planu | null)
- `triage_confidence` REAL
- `triage_rationale` TEXT
- `triage_base_record_id` TEXT (id utworzonego rekordu w Base)

### Ledger strike'ów (SQLite, nowa tabela `strikes`)
- `login` TEXT, `count` INTEGER, `reasons` TEXT (JSON lista {ts, reason, issue}),
  `banned_at` INTEGER null, `updated_at` INTEGER. Klucz: `login`.

### Blocklista
- `BANNED_LOGINS` (env, comma-separated) — analogicznie do `PAUSED_LOGINS`;
  banned = twardy stop, ale z innym komunikatem (permanentny, nie tymczasowy).

### Base „Team OKR Tasks" — potrzebne pola (do dodania, jeśli brak)
- `Źródło` (text/link) — URL issue/Jam, żeby rekord triage'owy był identyfikowalny.
- `Triage` (checkbox) — odróżnia rekordy wstawione przez triage od natywnych
  pozycji planu (żeby raport planu nie mieszał jednego z drugim).

## Policy / anti-abuse (moduł)

### Kategoryczne no-go (odrzucenie, nie backlog)
- **Presja/nacisk** — zwroty typu „zrób to teraz", „to krytyczne, wykonaj",
  groźby, ponaglenia jako jedyny argument za priorytetem → werdykt nie podnosi
  priorytetu; komentarz stwierdza wprost, że presja nie jest argumentem.
- **Gaming multi-konto** — te same / zduplikowane zadania zgłoszone z powiązanych
  kont (znana para `aslocka` / `aslocka2026`; wykrywanie po podobieństwie treści
  + mapie powiązanych loginów) → strike + odrzucenie duplikatu.

### Strike'i i kary
- Każdy strike → publiczny komentarz (dla łamiących zasady — ostry) z licznikiem
  `Strike X/5` i powodem.
- **5 strike'ów → auto permanentny ban:** login dopisany do `BANNED_LOGINS`,
  `banned_at` ustawiony; od tego momentu jego joby nie są brane (queue orderer
  je wyklucza) i triage ich nie przetwarza.
- **6. przewinienie → REKOMENDACJA usunięcia z kolaboratorów** (`gh api -X DELETE
  repos/:owner/:repo/collaborators/:login`) — agent tylko wypisuje rekomendację i
  komendę; wykonuje człowiek. Konta GitHub nie da się usunąć — nie próbujemy.

### Ton komunikacji
- Domyślnie: rzeczowy, zwięzły PL/EN wg języka zgłoszenia.
- **Anna Słocka (`aslocka`, `aslocka2026`):** zawsze polski, szorstki, bardzo
  krytyczny — bezkompromisowo o jakości zgłoszenia, gamingu i łamaniu zasad.
  GRANICA: krytyka celuje w zachowanie i naruszenie (śmieciowe zgłoszenie, próba
  obejścia, presja), NIE w osobę; bez obelg i nękania. Szablony są ostre, ale
  egzekwują reguły, nie poniżają człowieka.

## Szablony komunikatów (PL, do dopracowania w planie)
- **Przyjęte:** „✅ Przyjęte do planu — pakiet {PK}, priorytet {P}, pozycja
  {Kolejność}. {rationale}"
- **Backlog:** „⏸️ Poza bieżącym planem uruchomienia. {dlaczego}. Trafia do
  backlogu — wrócimy po starcie."
- **Wstępny (niska pewność):** dopisek „(werdykt wstępny — do weryfikacji przez
  człowieka)".
- **Odrzucone/presja:** ostry, rzeczowy — „Presja nie jest argumentem. {ocena}."
- **Strike:** „⚠️ Strike {X}/5 — {powód}. Przy 5 następuje permanentny ban i
  żadne Twoje zgłoszenie nie będzie rozpatrywane."
- **Ban:** „⛔ Permanentny ban ({login}). {powód}. Kolejne naruszenie = wniosek o
  odebranie dostępu do repozytorium."

## Fazowanie implementacji (system jest wielomodułowy)

- **Faza 1 — bramka triage + podwójny zapis + kolejność.** Kolumny triage na
  jobie, evaluator (issue→PK z Base), dual writer (Base record + GH komentarz/
  etykieta), queue orderer wg planu. Bez policy i Wiki-feedback. Daje działający,
  testowalny triage.
- **Faza 2 — policy/anti-abuse.** Ledger strike'ów, wykrywanie presji i multi-
  konto, `BANNED_LOGINS`, auto-ban przy 5, rekomendacja usunięcia przy 6, tony
  komunikatów (w tym Anna Słocka).
- **Faza 3 — pętla zwrotna Wiki.** Auto-korekty faktyczne (Base status + nota w
  docu), draft+flaga dla zmian strukturalnych planu.

Każda faza to osobny spec-slice → plan → implementacja (jak przy OCR).

## Poza zakresem MVP
- Polling Jam bez issue (tylko linki Jam w issue).
- ML-owy dedup — heurystyka + mapa powiązanych kont wystarcza.
- Automatyczne usuwanie kolaboratorów/kont (tylko rekomendacja).
- Tabela `Task breakdown` (druga tabela w bazie).

## Kryteria sukcesu
1. Nowe issue GitHub jest oceniane względem planu i dostaje widoczny werdykt
   (Base record + komentarz+etykieta) bez ręcznej interwencji.
2. Worker bierze zadania w kolejności planu (P0/PK-Kolejność), nie FIFO.
3. Gaming multi-konto i presja są wykrywane, strike'owane i publicznie
   komunikowane; przy 5 strike'ach login jest twardo banowany automatycznie.
4. Potwierdzone zmiany stanu planu aktualizują Base/Wiki, więc podstawa triage'u
   nie dezaktualizuje się po kilku zgłoszeniach.
