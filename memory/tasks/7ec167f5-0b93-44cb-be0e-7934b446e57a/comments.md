# Task 7ec167f5 - Layout: Auto-ukrywanie sidebara Column 2

Status: started

Action log:
- 2026-03-06 17:40 Europe/Warsaw — Otwieram zadanie i zaczynam pracę nad automatycznym chowaniem Column 2 gdy główny content powoduje overflow.

Plan i następne kroki:
1. Dodać logikę po stronie layoutu (komponent nadrzędny lub `app-sidebar.tsx`) która wykrywa, czy główny content jest szerszy niż dostępne miejsce. Najbardziej niezawodne podejście: ResizeObserver na wrapperze main-content i porównanie jego scrollWidth do clientWidth (z debouncem).
2. Wprowadzić stan React: `hideColumn2` (bool). Kolumna 2 będzie miała dodatową klasę ukrywającą (obok istniejącego `max-lg:hidden`) gdy `hideColumn2 === true`.
3. Zapewnić, że zachowanie jest responsywne i nie powoduje „migotania” — użyj progu tolerancji np. 24px i debounce 150ms.
4. Dodać tests (unit/integration) dla komponentu layoutu: symulacja zmiany rozmiaru kontenera i sprawdzenie, czy Column 2 ukrywa/odkrywa się zgodnie z oczekiwaniami.
5. Ręczne testy z przykładowym szerokim kalendarzem tygodniowym i tabelami wielokolumnowymi.
6. Utworzyć lokalną gałąź `feat/layout-auto-hide-column2`, wykonać commity. Nie będę pushował ani otwierał PR bez potwierdzenia — potwierdź, jeśli ma być automatycznie wypchnięte i otwarty PR.

Ryzyka / decyzje do podjęcia:
- Jeśli projekt używa CSS container queries i Tailwind z włączonym pluginem, można by użyć container query zamiast JS; daj znać, jeśli preferujesz CSS-only implementację.

Zgłoszę kolejne aktualizacje po:
- stworzeniu gałęzi i pierwszym commicie (krótka lista zmienionych plików), albo
- jeśli napotkam blokadę (np. brak dostępu do centralnego layoutu lub niejednoznaczność API).
