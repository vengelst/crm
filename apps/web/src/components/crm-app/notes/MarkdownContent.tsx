"use client";

import { type ReactNode } from "react";

/**
 * Lightweight, safe markdown renderer for note content.
 * Supports: ## headings, **bold**, *italic*, bullet lists, numbered lists,
 * checkboxes (- [ ] / - [x]), line breaks and paragraphs.
 * No dangerouslySetInnerHTML — pure React elements.
 */
export function MarkdownContent({ content, className, clamp }: { content: string; className?: string; clamp?: boolean }) {
  const blocks = parseBlocks(content);
  return (
    <div className={className}>
      {blocks.map((block, i) => renderBlock(block, i, clamp))}
    </div>
  );
}

// ── Block-level parsing ─────────────────────────────────

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "bullet"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "checkbox"; items: { checked: boolean; text: string }[] };

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];

  function flushParagraph() {
    if (buffer.length > 0) {
      blocks.push({ type: "paragraph", lines: [...buffer] });
      buffer = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading: ## text
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      continue;
    }

    // Checkbox: - [ ] or - [x]
    const cbMatch = line.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (cbMatch) {
      flushParagraph();
      const checked = cbMatch[1].toLowerCase() === "x";
      const text = cbMatch[2];
      // Merge consecutive checkboxes
      const last = blocks[blocks.length - 1];
      if (last?.type === "checkbox") {
        last.items.push({ checked, text });
      } else {
        blocks.push({ type: "checkbox", items: [{ checked, text }] });
      }
      continue;
    }

    // Bullet: - text
    const bulletMatch = line.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last?.type === "bullet") {
        last.items.push(bulletMatch[1]);
      } else {
        blocks.push({ type: "bullet", items: [bulletMatch[1]] });
      }
      continue;
    }

    // Numbered: 1. text
    const numMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numMatch) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last?.type === "numbered") {
        last.items.push(numMatch[1]);
      } else {
        blocks.push({ type: "numbered", items: [numMatch[1]] });
      }
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Regular text
    buffer.push(line);
  }

  flushParagraph();
  return blocks;
}

function renderBlock(block: Block, key: number, clamp?: boolean): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = block.level <= 2 ? "h3" : block.level === 3 ? "h4" : "h5";
      const size = block.level <= 2 ? "text-base font-semibold mt-3 mb-1" : block.level === 3 ? "text-sm font-semibold mt-2 mb-0.5" : "text-sm font-medium mt-2 mb-0.5";
      return <Tag key={key} className={size}>{renderInline(block.text)}</Tag>;
    }
    case "paragraph":
      return (
        <p key={key} className={clamp ? "line-clamp-2" : undefined}>
          {block.lines.map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {renderInline(line)}
            </span>
          ))}
        </p>
      );
    case "bullet":
      return (
        <ul key={key} className="ml-4 list-disc space-y-0.5">
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
    case "numbered":
      return (
        <ol key={key} className="ml-4 list-decimal space-y-0.5">
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ol>
      );
    case "checkbox":
      return (
        <ul key={key} className="space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <input type="checkbox" checked={item.checked} readOnly className="mt-0.5 rounded border-slate-300 dark:border-slate-600" />
              <span className={item.checked ? "line-through text-slate-400" : ""}>{renderInline(item.text)}</span>
            </li>
          ))}
        </ul>
      );
  }
}

// ── Inline parsing ──────────────────────────────────────

function renderInline(text: string): ReactNode {
  // Process bold (**text**) and italic (*text*) patterns
  const parts: ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldIdx = remaining.indexOf("**");
    if (boldIdx !== -1) {
      const endIdx = remaining.indexOf("**", boldIdx + 2);
      if (endIdx !== -1) {
        if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
        parts.push(<strong key={keyIdx++}>{remaining.slice(boldIdx + 2, endIdx)}</strong>);
        remaining = remaining.slice(endIdx + 2);
        continue;
      }
    }

    // Italic: *text* (not **)
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    if (italicMatch && italicMatch.index !== undefined) {
      if (italicMatch.index > 0) parts.push(remaining.slice(0, italicMatch.index));
      parts.push(<em key={keyIdx++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
      continue;
    }

    // No more patterns
    parts.push(remaining);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ── HTML export for print ───────────────────────────────

/** Convert markdown content to safe HTML for print windows. All content is escaped. */
export function markdownToHtml(content: string): string {
  const blocks = parseBlocks(content);
  return blocks.map(blockToHtml).join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineToHtml(text: string): string {
  let result = esc(text);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic (not bold)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  return result;
}

function blockToHtml(block: Block): string {
  switch (block.type) {
    case "heading": {
      const tag = block.level <= 2 ? "h2" : "h3";
      return `<${tag}>${inlineToHtml(block.text)}</${tag}>`;
    }
    case "paragraph":
      return `<p>${block.lines.map((l) => inlineToHtml(l)).join("<br>")}</p>`;
    case "bullet":
      return `<ul>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("")}</ul>`;
    case "numbered":
      return `<ol>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("")}</ol>`;
    case "checkbox":
      return `<ul style="list-style:none;padding-left:0">${block.items.map((item) =>
        `<li>${item.checked ? "☑" : "☐"} ${item.checked ? `<s>${inlineToHtml(item.text)}</s>` : inlineToHtml(item.text)}</li>`
      ).join("")}</ul>`;
  }
}
