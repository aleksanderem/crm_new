import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommentContent, postPlanNote, postPlanDraft } from "./wiki-note.mjs";

test("postPlanNote adds a full-document docx comment to the given doc", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "{}" }; };
  postPlanNote("https://wiki/doc-08", "Zadanie A domknięte", { exec });
  const [cmd, args] = calls[0];
  assert.equal(cmd, "lark-cli");
  assert.ok(args.includes("+add-comment"));
  assert.ok(args.includes("--doc") && args.includes("https://wiki/doc-08"));
  assert.ok(args.includes("--type") && args.includes("docx"));
  assert.ok(args.includes("--full-comment"));
  const content = args[args.indexOf("--content") + 1];
  assert.match(content, /Zadanie A domknięte/);
});

test("postPlanDraft marks the note as a human-approval proposal", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "{}" }; };
  postPlanDraft("doc", "nowy pakiet PK10", { exec });
  const content = calls[0][1][calls[0][1].indexOf("--content") + 1];
  assert.match(content, /PROPOZYCJA ZMIANY PLANU/);
  assert.match(content, /nowy pakiet PK10/);
});

test("buildCommentContent embeds the text", () => {
  assert.match(buildCommentContent("abc"), /abc/);
});
