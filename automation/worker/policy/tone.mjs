import { isHarshLogin } from "./detect.mjs";

// HARD BOUNDARY: harsh copy targets the behavior/violation, never the person.
// Pressure is rejected sternly for EVERYONE and always references that this is
// a repeatedly-established rule; harsh logins get an extra clause on top.
export function pressureComment({ login }) {
  const base =
    "⛔ **Odrzucone.** Presja nie jest argumentem — i nie mówimy tego po raz pierwszy. " +
    "To zasada ustalana wielokrotnie: priorytet wynika z planu, nie z tonu ani ponaglania. " +
    "To zgłoszenie nie realizuje żadnego zadania z planu, więc samym naciskiem nic nie wskórasz. " +
    "Opisz konkretny problem merytorycznie (co, gdzie, jak odtworzyć), a zostanie ocenione normalnie.";
  if (isHarshLogin(login)) {
    return base +
      "\n\nTo kolejne naruszenie tych samych, jasno zakomunikowanych ustaleń. " +
      "Ponaglanie zamiast treści to marnowanie kolejki — przestań tak zgłaszać.";
  }
  return base;
}

export function strikeComment({ login, count, threshold, reason }) {
  const emph = isHarshLogin(login) ? " To celowe obchodzenie zasad. " : " ";
  return `⚠️ **Strike ${count}/${threshold}** — ${reason}.${emph}Przy ${threshold} strike'ach następuje permanentny ban i żadne Twoje zgłoszenie nie będzie rozpatrywane.`;
}

export function banComment({ login, reason, threshold }) {
  return `⛔ **Permanentny ban (${login}).** ${reason}. Osiągnięto próg ${threshold} strike'ów — od tej chwili Twoje zgłoszenia nie są przetwarzane. Kolejne naruszenie = wniosek o odebranie dostępu do repozytorium.`;
}

export function collaboratorRemovalRecommendation({ login, repo }) {
  return `\n\n---\n**REKOMENDACJA (do wykonania przez człowieka):** usuń współpracownika \`${login}\` z repo:\n\n\`\`\`\ngh api -X DELETE repos/${repo}/collaborators/${login}\n\`\`\`\n\n(Agent nie wykonuje tej operacji automatycznie — konta GitHub nie da się usunąć.)`;
}
