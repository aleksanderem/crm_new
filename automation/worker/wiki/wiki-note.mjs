// A note on the plan Wiki doc via drive +add-comment (NON-destructive — never
// rewrites doc content). NOTE: confirm the reply_elements shape for --content
// with `drive +add-comment ... --dry-run` before enabling writes.
export function buildCommentContent(text) {
  return JSON.stringify([{ type: "text", text: text }]);
}

function addComment(doc, text, { exec }) {
  exec("lark-cli", ["drive", "+add-comment", "--doc", doc, "--type", "docx",
                    "--full-comment", "--content", buildCommentContent(text), "--format", "json"]);
}

export function postPlanNote(doc, text, { exec }) {
  addComment(doc, `✅ [triage] ${text}`, { exec });
}

export function postPlanDraft(doc, text, { exec }) {
  addComment(doc, `📝 PROPOZYCJA ZMIANY PLANU (do akceptacji człowieka): ${text}`, { exec });
}
