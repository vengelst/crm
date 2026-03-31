"use client";

type SpeechLang = "de" | "en";

const COMMAND_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(absatzumbruch|neuer absatz|neue absatz|new paragraph)\b/gi, replacement: "\n\n" },
  { pattern: /\b(zeilenumbruch|neue zeile|new line)\b/gi, replacement: "\n" },
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
  const normalizedTranscript = normalizeCommandAliases(transcript.trim());
  if (!normalizedTranscript) {
    return previous;
  }

  const pendingCommand = extractPendingCommandLine(previous);
  if (pendingCommand) {
    const mergedTranscript = `${pendingCommand.line}${needsJoinSpace(pendingCommand.line, normalizedTranscript) ? " " : ""}${normalizedTranscript}`;
    const formattedPending = formatSpeechChunk(mergedTranscript, pendingCommand.prefix, lang);
    return appendFormattedText(pendingCommand.prefix, formattedPending);
  }

  const formatted = formatSpeechChunk(normalizedTranscript, previous, lang);
  return appendFormattedText(previous, formatted);
}

function formatSpeechChunk(text: string, previous: string, lang: SpeechLang) {
  let formatted = text;

  formatted = applyInlineMarkdownCommands(formatted);
  formatted = applyBlockMarkdownCommands(formatted, previous, lang);

  for (const command of COMMAND_REPLACEMENTS) {
    formatted = formatted.replace(command.pattern, command.replacement);
  }

  return formatted
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?![\s\n]|$)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/g, "");
}

function appendFormattedText(previous: string, formatted: string) {
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

function extractPendingCommandLine(previous: string) {
  if (!previous.trim()) {
    return null;
  }

  const lineStart = previous.lastIndexOf("\n") + 1;
  const prefix = previous.slice(0, lineStart);
  const normalizedLine = normalizeCommandAliases(previous.slice(lineStart).trim());

  if (!normalizedLine) {
    return null;
  }

  if (isPendingInlineCommand(normalizedLine) || isPendingHeadingCommand(normalizedLine)) {
    return { prefix, line: normalizedLine };
  }

  return null;
}

function isPendingInlineCommand(line: string) {
  const isBold = /^(fett|bold)\b/i.test(line) && !/\s+(fett|bold)\s*$/i.test(line);
  const isItalic = /^(kursiv|italic)\b/i.test(line) && !/\s+(kursiv|italic)\s*$/i.test(line);
  return isBold || isItalic;
}

function isPendingHeadingCommand(line: string) {
  return /^(ueberschrift|heading)\b/i.test(line) && !/^##\s/.test(line);
}

function needsJoinSpace(previousPart: string, nextPart: string) {
  return !/[ \n]$/.test(previousPart) && !/^[,.;:!?]/.test(nextPart);
}

function applyInlineMarkdownCommands(text: string) {
  return text
    .replace(/(^|\n)\s*(fett|bold)\s+(.+?)\s+(fett|bold)\s*(?=\n|$)/gi, (_match, prefix: string, _start, content: string) => `${prefix}**${content.trim()}**`)
    .replace(/(^|\n)\s*(kursiv|italic)\s+(.+?)\s+(kursiv|italic)\s*(?=\n|$)/gi, (_match, prefix: string, _start, content: string) => `${prefix}*${content.trim()}*`);
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
    /(^|\n)\s*(ueberschrift|heading)\s+(.+?)(?=\n|$)/gi,
    (_match, prefix: string, _command, content: string) => `${prefix || "\n"}## ${content.trim()}`,
  );

  result = result.replace(
    /(^|\n)\s*(nummerierte liste|nummerierte aufzaehlung|numbered list)\b/gi,
    (match, prefix: string) => `${prefix || "\n"}${getNextListNumber(previous + match, lang)}. `,
  );

  result = result.replace(
    /(^|\n)\s*(naechster nummerierter punkt|next numbered point|next numbered item)\b/gi,
    (match, prefix: string) => `${prefix || "\n"}${getNextListNumber(previous + match, lang)}. `,
  );

  return result;
}

function getNextListNumber(previous: string, lang: SpeechLang) {
  void lang;
  const matches = [...previous.matchAll(/(^|\n)(\d+)\.\s/g)];
  const last = matches.at(-1);
  return last ? Number(last[2]) + 1 : 1;
}
