# Task 354f9094 - Gabinet Documents: WYSIWYG template editor

Status: in_progress

Action log:
- 2026-03-06 17:33 Europe/Warsaw — Rozpoczynam pracę nad wdrożeniem edytora WYSIWYG (TipTap) w `gabinet/settings/document-templates`.
- Utworzyłem lokalną gałąź roboczą (lokalnie) i uruchamiam agenta kodującego, który wprowadzi zmiany, zrobi commity i zgłosi listę zmienionych plików. Nie wykonuję push / otwierania PR bez potwierdzenia.
- 2026-03-06 17:50 Europe/Warsaw — Przeprowadziłem szybki przegląd kodu: komponent `TemplateEditor` już istnieje w `src/components/gabinet/template-editor.tsx` i jest zaimportowany/wykorzystany zarówno w ustawieniach szablonów (`_layout.gabinet.settings.document-templates.tsx`) jak i w tworzeniu dokumentów na stronie wizyty (`_layout.gabinet.appointments.$appointmentId.tsx`).

Co już jest zaimplementowane (znalezione):
- TipTap + rozszerzenia: StarterKit, Underline, HorizontalRule, TextAlign, Table (+ row/header/cell), Mention-based VariableMentionAt/Curly.
- Toolbar obsługujący: bold, italic, underline, H1-H3, listy ordered/bullet, align (left/center/right), wstawianie tabel i linia pozioma, oraz przyciski wstawiania zmiennych (kategorie + przyciski) i wsparcie dla wstawiania przez `@` i `{{`.
- Renderowanie zmiennych jako nieedytowalnych „chipów” z HTML/tekstową serializacją (renderHTML / renderText w `variable-mention.tsx`).
- Edytor jest zintegrowany z SidePanel w ustawieniach i w panelu dokumentu przy wizycie (wartości przekazywane przez propsy `value`/`onChange`).

Wnioski i następne kroki (proponowane):
1. Manualne testy wizualne: uruchomić aplikację dev i sprawdzić przepływy:
   - Wejdź do /dashboard/gabinet/settings/document-templates, utwórz nowy szablon — przetestuj formatowanie (bold/italic/heading/listy/tabele/hr) i wstawianie zmiennych przez przyciski i `@` oraz `{{`.
   - Wejdź na stronę wizyty, utwórz nowy dokument na bazie szablonu — sprawdź, czy treść szablonu ładuje się poprawnie, zapisywanie i podgląd (DocumentViewer) poprawnie pokazuje zmienne jako `{{...}}` lub render HTML zgodnie z oczekiwaniami.
2. Testy automatyczne: dodać prosty test komponentowy (React Testing Library) dla `TemplateEditor` — symulacja wstawienia zmiennej, sprawdzenie serializacji `getHTML()` i `getText()` zwracanego przez rozszerzenia.
3. Accessibility / kontrast — sprawdzić, czy dropdown podpowiedzi i przyciski mają czytelne kolory (wcag) — poprawić klasy jeśli trzeba.
4. Migracja istniejącej treści — jeśli istnieją dokumenty przechowywane jako czysty tekst lub HTML, upewnić się, że serializacja jest kompatybilna (uwzględnione w testach integracyjnych). Jeśli potrzebna, dodać konwerter przy odczycie istniejących szablonów (np. minimalne sanityzowanie).

Uwaga: podczas uruchamiania `npm run typecheck` natrafiłem na błędy TypeScript w innych plikach (niepowiązane bezpośrednio z edytorem): `src/components/data-table/editable-columns.ts` oraz `src/components/gabinet/employee-schedule-manager.tsx`. Błędy te powodują, że pełny typecheck/build zwraca niezerowy kod wyjścia. Opcje:
- Naprawić te błędy najpierw (może być poza zakresem tej zmiany) — to odblokuje CI/typecheck.
- Albo kontynuować prace nad edytorem i zrobić wizualne/manualne testy lokalnie bez oczekiwania na czysty typecheck. Proponuję to drugie, a jeśli chcesz, mogę też spróbować szybko skorygować te błędy (potrzebuję potwierdzenia, czy mam je naprawić i pushować).

Proszę o decyzję:
- Czy mam przygotować gałąź `feat/wysiwyg-template-editor` z commitem zawierającym ewentualne testy i drobne poprawki i otworzyć PR? (nie zrobię push bez Twojego potwierdzenia)
- Czy wolisz najpierw, abym naprawił błędy TypeScript w codebase tak, żeby `npm run typecheck` przechodził bez błędów przed otwarciem PR?

Krótkie how-to-test (dodane do tasks_progress.json):
- Otwórz /dashboard/gabinet/settings/document-templates, dodaj nowy szablon, zapisz, odśwież listę — formatowanie powinno pozostać.
- Na stronie wizyty stwórz dokument na bazie szablonu, zapisz, otwórz podgląd — upewnij się, że treść i zmienne są zgodne.

Zgłoszę kolejne aktualizacje po:
- zakończeniu manualnego testu i ewentualnej poprawce UI, lub
- otrzymaniu instrukcji co do TypeScript errorów (naprawiać teraz vs zostawić), lub
- po otrzymaniu potwierdzenia do utworzenia gałęzi i otwarcia PR.
