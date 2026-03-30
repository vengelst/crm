"use client";

type SpeechLang = "de" | "en";

const COMMAND_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(neuer absatz|neue absatz|new paragraph)\b/gi, replacement: "\n\n" },
  { pattern: /\b(neue zeile|new line)\b/gi, replacement: "\n" },
  { pattern: /\b(aufzaehlung|aufzählung|stichpunkt|bullet point|bullet list|bullet)\b/gi, replacement: "\n- " },
  { pattern: /\b(naechster punkt|nächster punkt|next bullet|next point)\b/gi, replacement: "\n- " },
  { pattern: /\b(checkbox|check box|kontrollkaestchen|kontrollkästchen|todo)\b/gi, replacement: "\n- [ ] " },
  { pattern: /\b(gedankenstrich|bindestrich|dash|hyphen)\b/gi, replacement: " - " },
  { pattern: /\b(doppelpunkt setzen|colon)\b/gi, replacement: ": " },
  { pattern: /\b(strichpunkt setzen|semicolon)\b/gi, replacement: "; " },
  { pattern: /\b(komma setzen|comma)\b/gi, replacement: ", " },
  { pattern: /\b(fragezeichen setzen|question mark)\b/gi, replacement: "? " },
  { pattern: /\b(ausrufezeichen setzen|exclamation mark)\b/gi, replacement: "! " },
  { pattern: /\b(punkt setzen|period|full stop)\b/gi, replacement: ". " },
];

export function appendSpeechTranscript(
  previous: string,
  transcript: string,
  lang: SpeechLang,
) {
  let formatted = normalizeCommandAliases(transcript.trim());

  formatted = applyInlineMarkdownCommands(formatted);
  formatted = applyBlockMarkdownCommands(formatted, previous, lang);

  for (const command of COMMAND_REPLACEMENTS) {
    formatted = formatted.replace(command.pattern, command.replacement);
  }

  formatted = formatted
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?![\s\n]|$)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/g, "");

  if (!formatted) {
    return previous;
  }

  if (!previous.trim()) {
    return formatted.replace(/^\n+/, "");
  }

  const joinWithoutSpace =
    formatted.startsWith("\n") ||
    formatted.startsWith(",") ||
    formatted.startsWith(".") ||
    formatted.startsWith(":") ||
    formatted.startsWith(";") ||
    formatted.startsWith("!") ||
    formatted.startsWith("?") ||
    previous.endsWith("\n");

  return `${previous}${joinWithoutSpace ? "" : " "}${formatted}`;
}

function applyInlineMarkdownCommands(text: string) {
  return text
    .replace(/\b(fett|bold)\s+(.+?)\s+(fett|bold)\b/gi, (_, _start, content: string) => `**${content.trim()}**`)
    .replace(/\b(kursiv|italic)\s+(.+?)\s+(kursiv|italic)\b/gi, (_, _start, content: string) => `*${content.trim()}*`);
}

function normalizeCommandAliases(text: string) {
  return text
    .replace(/überschrift/gi, "ueberschrift")
    .replace(/aufzählung/gi, "aufzaehlung")
    .replace(/nächster/gi, "naechster")
    .replace(/kontrollkästchen/gi, "kontrollkaestchen");
}

function applyBlockMarkdownCommands(
  text: string,
  previous: string,
  lang: SpeechLang,
) {
  let result = text;

  result = result.replace(
    /\b(ueberschrift|überschrift|heading)\s+(.+)/i,
    (_, _command, content: string) => `\n## ${content.trim()}`,
  );

  result = result.replace(
    /\b(nummerierte liste|nummerierte aufzaehlung|nummerierte aufzählung|numbered list)\b/gi,
    () => `\n${getNextListNumber(previous, lang)}. `,
  );

  result = result.replace(
    /\b(naechster nummerierter punkt|nächster nummerierter punkt|next numbered point|next numbered item)\b/gi,
    () => `\n${getNextListNumber(previous, lang)}. `,
  );

  return result;
}

function getNextListNumber(previous: string, lang: SpeechLang) {
  void lang;
  const matches = [...previous.matchAll(/(^|\n)(\d+)\.\s/g)];
  const last = matches.at(-1);
  return last ? Number(last[2]) + 1 : 1;
}
