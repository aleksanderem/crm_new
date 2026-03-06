# Task 720e1ca7 - Przenieś kolumnę Pacjent + Szczegóły wizyty do środkowego sidebara

Status: started

Action log:
- 2026-03-06 17:41 Europe/Warsaw — Otwieram zadanie i zaczynam analizę plików (_layout.gabinet.appointments.$appointmentId.tsx) w celu przeniesienia kart `Pacjent` i `Szczegóły wizyty` do środkowego sidebara.

Plan i następne kroki:
1. Zlokalizować plik layoutu (`_layout.gabinet.appointments.$appointmentId.tsx`) oraz komponenty/karty: `PatientCard`, `VisitDetailsCard` (nazwa może się różnić) i komponent tabów (Szczegóły/Dokumenty/Płatności).
2. Zmodyfikować strukturę grid-a: usunąć lewą kolumnę (lub przenieść jej zawartość) i umieścić karty `Pacjent` + `Szczegóły wizyty` w środkowej kolumnie przed tabami.
   - Proponowane podejście: zamiast sztywnego `grid-cols-3` użyć trzech obszarów z klasami rozkładu np. `grid-cols-[auto,256px,1fr]` albo explicit `col-span` tak, aby środkowy sidebar miał stałą szerokość 256px, a prawa część wypełniała resztę.
3. Zachować responsywność: na małych ekranach kolumny powinny się stackować w kolejności: (1) header/tabs, (2) środkowy sidebar z kartami, (3) content — lub zgodnie z wymaganiami UX. Upewnię się, że zmiany nie łamią istniejących breakpointów.
4. Przejrzeć powiązane style i propsy (np. przekazywanie appointmentId do kart) i przenieść odpowiednie dane do nowych lokalizacji komponentów.
5. Uruchomić lokalne testy i ręczne scenariusze: odwiedzić stronę szczegółów wizyty z danymi testowymi, sprawdzić zachowanie przy różnych szerokościach ekranu (desktop, tablet, mobile).
6. Dodać prosty test integracyjny/komponentowy jeśli repozytorium ma setup (np. React Testing Library) żeby złapać regresje layoutu.
7. Stworzyć gałąź roboczą `feat/move-patient-cards-to-middle-sidebar`, wykonać commity. Nie wykonuję `push` ani otwieram PR bez Twojego potwierdzenia.

Ryzyka / pytania:
- Potrzebuję potwierdzenia dotyczącej kolejności priorytetów na małych ekranach — czy karty pacjenta powinny być widoczne przed tabami, czy ukrywane za zakładką? Jeśli masz preferencję, napisz proszę.
- Jeśli projekt korzysta z konkretnego systemu layoutu (np. CSS Grid helpers w komponencie Layout), poinformuj mnie, żebym użył istniejącej konwencji.

Zgłoszę kolejne aktualizacje po:
- utworzeniu gałęzi i pierwszym commicie z listą zmienionych plików, albo
- jeśli napotkam blokadę przy zależnościach komponentów lub brakującymi propsami.
