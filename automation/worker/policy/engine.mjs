// automation/worker/policy/engine.mjs
import { detectPressure, detectMultiAccount } from "./detect.mjs";
import { addStrike, isBanned, STRIKE_BAN_THRESHOLD } from "./strikes.mjs";
import {
  pressureComment, strikeComment, banComment, collaboratorRemovalRecommendation,
} from "./tone.mjs";

// PRE-gate: merit-independent abuse, checked before the LLM evaluator.
// Order is fixed — multi-account first so an already-banned repeat offender
// still accrues the 6th strike + collaborator-removal recommendation.
export function evaluatePolicyPre(db, issue, { priorIssues = [], now }) {
  const login = issue.login || "";
  const ts = now();

  const multi = detectMultiAccount(issue, { priorIssues });
  if (multi.hit) {
    const reason = `duplikat zadania zgłoszony z powiązanego konta (${multi.relatedLogin})`;
    const strike = addStrike(db, login, { reason, issue: issue.url, ts });
    let comment = strikeComment({ login, count: strike.count, threshold: STRIKE_BAN_THRESHOLD, reason });
    if (strike.count >= STRIKE_BAN_THRESHOLD) {
      comment += "\n\n" + banComment({ login, reason, threshold: STRIKE_BAN_THRESHOLD });
    }
    if (strike.count > STRIKE_BAN_THRESHOLD) {
      comment += collaboratorRemovalRecommendation({ login, repo: issue.repo });
    }
    return { blocked: true, flags: ["multi-account"], comment, recordedStrike: true, banned: strike.count >= STRIKE_BAN_THRESHOLD };
  }

  if (isBanned(db, login)) {
    return {
      blocked: true, flags: ["banned"],
      comment: banComment({ login, reason: "konto jest permanentnie zbanowane", threshold: STRIKE_BAN_THRESHOLD }),
      recordedStrike: false, banned: true,
    };
  }

  return { blocked: false, flags: [], comment: null, recordedStrike: false, banned: false };
}

// Post-verdict override: pressure rejects ONLY a non-fitting issue. A fitting
// verdict is never touched, so pressure never influences the fit/priority
// decision — it only makes a junk (non-fit) submission a stern rejection
// instead of an ordinary polite backlog.
export function pressureOverride(verdict, issue) {
  if (verdict.fits === false && detectPressure(issue).hit) {
    return { reject: true, comment: pressureComment({ login: issue.login || "" }) };
  }
  return { reject: false, comment: null };
}
