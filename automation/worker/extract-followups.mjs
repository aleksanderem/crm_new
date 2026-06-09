// extract-followups.mjs — read claude output from stdin, print follow-ups one per line
// Looks for section: "## Follow-ups" (case-insensitive, hyphen optional)
// Each item: line starting with "- " or "* " inside that section
import { readFileSync } from "node:fs";

const text = readFileSync(0, "utf8");
const lines = text.split("\n");
let inSection = false;
let buffer = [];

const flush = () => {
  if (buffer.length === 0) return null;
  const joined = buffer.join(" ").replace(/\s+/g, " ").trim();
  buffer = [];
  return joined;
};

const items = [];

for (const line of lines) {
  // Section header start
  if (/^#{2,4}\s+Follow[-\s]?ups?\s*$/i.test(line.trim())) {
    inSection = true;
    continue;
  }
  // Section ended (next ## or end of doc)
  if (inSection && /^#{1,4}\s/.test(line.trim()) && !/Follow[-\s]?ups?/i.test(line)) {
    const last = flush();
    if (last) items.push(last);
    inSection = false;
    continue;
  }
  if (!inSection) continue;

  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) {
    const last = flush();
    if (last) items.push(last);
    buffer.push(bullet[1].trim());
  } else if (buffer.length > 0 && /^\s+\S/.test(line)) {
    // continuation line (indented under previous bullet)
    buffer.push(line.trim());
  } else if (line.trim() === "") {
    // blank: end of current item
    const last = flush();
    if (last) items.push(last);
  }
}
const last = flush();
if (last) items.push(last);

// Filter out trivial / placeholder items
const cleaned = items
  .map((s) => s.replace(/^\[\s*\]\s*/, "")) // strip "[ ]" task box
  .filter((s) => s.length >= 10);

for (const item of cleaned) {
  console.log(item);
}
