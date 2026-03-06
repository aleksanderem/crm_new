# Task 8755766c - Zmiana wizualna: zróżnicowane kolory UI

Status: started (by Felix)

Action log:
- 2026-03-06 17:44 Europe/Warsaw — Otwieram zadanie i zaczynam prace nad wprowadzeniem zróżnicowanej, ale spójnej palety kolorów dla elementów UI na stronie wizyty.

Szybka diagnoza:
- Strona pod adresem `http://localhost:5173/dashboard/gabinet/appointments/ps79ymjx3ah4t7ba7yxpp4arx182835b` wygląda płasko — elementy mają zbliżone tony i słabą separację wizualną.
- Kod importuje wiele ikon i komponentów (np. `FeaturedCardMessage`) które najpewniej korzystają z globalnych klas Tailwind/utility CSS.

Plan pracy (kolejne kroki):
1. Audyt kolorów: zebrać aktualne zmienne/kolory z `tailwind.config.js`, `styles` i ewentualnych theme tokens. Zidentyfikować miejsca o niskiej kontrastowości i elementy wymagające wyróżnienia (karty, CTA, nagłówki, badges).
2. Zaproponować szybkie, spójne palety 3 wariantów (neutralny, akcentowy, success/warning) do wyboru. Każdy wariant będzie zawierać 5-6 tonów (50..900) kompatybilnych z Tailwind.
3. Implementacja: dodać tokeny kolorów do `tailwind.config.js` (extend.colors) oraz zastąpić bezpośrednie klasy kolorów (np. `bg-gray-100`) globalnymi tokenami (np. `bg-brand-50`, `text-accent-600`).
4. Zastosować różnicowanie: karty z delikatnym cieniem/odstępem, CTA w kolorze akcentowym, badges/ikonki w kontrastowych odcieniach, separatory i tła sekcji neutralne, linki i hovery wyraźniejsze.
5. Accessibility: sprawdzić kontrast najważniejszych kombinacji (tekst na tle) i poprawić do WCAG AA (min 4.5:1 dla tekstu normalnego) tam, gdzie to krytyczne.
6. Wizualne testy local: uruchomić stronę dev, porównać before/after, i zebrać screenshoty. Jeśli repo używa Storybook, dodać lub zaktualizować stories dla kluczowych komponentów.
7. Komity: utworzyć gałąź `feat/ui-color-variants`, wprowadzić zmiany i przygotować PR (push/PR po Twoim potwierdzeniu).

Pytania / decyzje do podjęcia:
- Czy macie preferowaną paletę marki (primary color) do której powinienem dopasować akcenty? Jeśli tak — podaj wartość HEX lub plik ze stylem.
- Czy wolisz CSS-only (Tailwind tokens + container classes) czy częściowo z wykorzystaniem zmiennych CSS (CSS custom properties) dla runtime theme switching? Jeśli nie masz preferencji, zastosuję rozszerzenie Tailwind + CSS variables dla łatwej zmiany w przyszłości.

Następna aktualizacja:
- Po zakończeniu audytu kolorów (lista aktualnych tokenów) — załączę propozycje palet i zrzuty ekranu.

Nie wykonuję push/PR bez potwierdzenia. Jeśli potwierdzasz, wypchnę gałąź i otworzę PR z opisem zmian.
