import jsPDF from 'jspdf';
import { marked, type Token, type Tokens } from 'marked';
import type { ChatMessage } from '../stores/chatStore';

export interface ExportOptions {
  startFromMessageId?: string;
  includeThinking: boolean;
  includeTools: boolean;
  includeStats?: boolean;
}

export interface SessionMetadata {
  label: string;
  directory: string;
  createdAt: string;
  messageCount: number;
  stats?: {
    totalCost?: number;
    totalTokens?: number;
    duration?: number;
  };
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const CODE_INDENT = 4;

// Colors matching the UI
const COLORS = {
  text: [30, 30, 30] as [number, number, number],
  textLight: [100, 100, 100] as [number, number, number],
  textMuted: [140, 140, 140] as [number, number, number],
  userBlue: [59, 130, 246] as [number, number, number],
  userBlueBg: [239, 246, 255] as [number, number, number],
  assistantGray: [80, 80, 80] as [number, number, number],
  thinkingGray: [128, 128, 128] as [number, number, number],
  toolPurple: [139, 92, 246] as [number, number, number],
  errorRed: [220, 38, 38] as [number, number, number],
  errorRedBg: [254, 242, 242] as [number, number, number],
  codeBg: [243, 244, 246] as [number, number, number],
  codeText: [55, 65, 81] as [number, number, number],
  inlineCodeBg: [229, 231, 235] as [number, number, number],
  blockquoteBorder: [156, 163, 175] as [number, number, number],
  blockquoteText: [107, 114, 128] as [number, number, number],
  tableBorder: [209, 213, 219] as [number, number, number],
  tableHeaderBg: [243, 244, 246] as [number, number, number],
  linkBlue: [37, 99, 235] as [number, number, number],
  separator: [229, 231, 235] as [number, number, number],
  toolBg: [249, 250, 251] as [number, number, number],
  toolBorder: [229, 231, 235] as [number, number, number],
};

interface PDFContext {
  pdf: jsPDF;
  yPos: number;
  currentPage: number;
}

function checkPageBreak(ctx: PDFContext, requiredSpace: number): void {
  if (ctx.yPos + requiredSpace > PAGE_HEIGHT - MARGIN) {
    ctx.pdf.addPage();
    ctx.currentPage++;
    ctx.yPos = MARGIN;
  }
}

function setColor(pdf: jsPDF, color: [number, number, number]) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function setDrawColor(pdf: jsPDF, color: [number, number, number]) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function setFillColor(pdf: jsPDF, color: [number, number, number]) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

/**
 * Sanitize text for jsPDF's built-in fonts (Helvetica/Courier).
 * These fonts only support WinAnsiEncoding — Unicode chars outside that range
 * render as garbled glyphs. Replace common ones with ASCII equivalents.
 */
function sanitizeText(text: string): string {
  return text
    // Arrows
    .replace(/\u2192/g, '->')   // →
    .replace(/\u2190/g, '<-')   // ←
    .replace(/\u2194/g, '<->') // ↔
    .replace(/\u21D2/g, '=>')   // ⇒
    .replace(/\u2191/g, '^')    // ↑
    .replace(/\u2193/g, 'v')    // ↓
    // Check/cross marks
    .replace(/[\u2713\u2714\u2705]/g, '[x]')  // ✓ ✔ ✅
    .replace(/[\u2717\u2718\u274C]/g, '[ ]')  // ✗ ✘ ❌
    // Dashes (em/en dash are in WinAnsi, but just in case)
    .replace(/\u2015/g, '--')   // ― horizontal bar
    // Math/symbols
    .replace(/\u2260/g, '!=')   // ≠
    .replace(/\u2264/g, '<=')   // ≤
    .replace(/\u2265/g, '>=')   // ≥
    .replace(/\u00D7/g, 'x')    // ×
    .replace(/\u00F7/g, '/')    // ÷
    .replace(/\u221E/g, 'inf')  // ∞
    .replace(/\u2248/g, '~=')   // ≈
    // Misc
    .replace(/\u2026/g, '...')  // …
    .replace(/\u200B/g, '')     // zero-width space
    .replace(/\u200D/g, '')     // zero-width joiner
    .replace(/\uFEFF/g, '')     // BOM
    .replace(/\u00A0/g, ' ')    // non-breaking space
    // Stars/decorative
    .replace(/[\u2B50\u2605\u2606\u2728]/g, '*')  // ⭐ ★ ☆ ✨
    .replace(/[\u26A0\uFE0F]/g, '!')              // ⚠️
    .replace(/[\u2139\uFE0F]/g, '(i)')            // ℹ️
    // Strip remaining emoji and symbols outside Latin/WinAnsi range
    // Keep: basic ASCII (0x20-0x7E), Latin-1 Supplement (0xA0-0xFF), bullet (0x2022), dashes (0x2013-0x2014), quotes (0x2018-0x201D)
    .replace(/[\u0100-\u2012\u2015-\u2017\u201E-\u2021\u2023-\uFFFF]/g, (ch) => {
      // Log but don't crash — replace with ?
      return '';
    });
}

function wrapText(pdf: jsPDF, text: string, maxWidth: number): string[] {
  return pdf.splitTextToSize(sanitizeText(text), maxWidth) as string[];
}

// Strip markdown for simple inline rendering (bold/italic/code markers removed)
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Render rich inline text (bold, italic, code, links) on a single line.
 * We parse inline tokens and render each segment with appropriate styling.
 */
function renderInlineTokens(ctx: PDFContext, tokens: Token[], x: number, maxWidth: number, lineHeight: number, baseSize: number): void {
  const { pdf } = ctx;
  let curX = x;

  for (const token of tokens) {
    if (curX > x + maxWidth) {
      // Wrap
      ctx.yPos += lineHeight;
      checkPageBreak(ctx, lineHeight);
      curX = x;
    }

    switch (token.type) {
      case 'text':
      case 'escape': {
        const text = 'text' in token ? (token as any).text || '' : '';
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(baseSize);
        const lines = wrapText(pdf, text, maxWidth - (curX - x));
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            ctx.yPos += lineHeight;
            checkPageBreak(ctx, lineHeight);
            curX = x;
          }
          pdf.text(lines[i], curX, ctx.yPos);
          curX += pdf.getTextWidth(lines[i]);
        }
        break;
      }
      case 'strong': {
        const rawText = stripInlineMarkdown((token as any).text || '');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(baseSize);
        const lines = wrapText(pdf, rawText, maxWidth - (curX - x));
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            ctx.yPos += lineHeight;
            checkPageBreak(ctx, lineHeight);
            curX = x;
          }
          pdf.text(lines[i], curX, ctx.yPos);
          curX += pdf.getTextWidth(lines[i]);
        }
        pdf.setFont('helvetica', 'normal');
        break;
      }
      case 'em': {
        const rawText = stripInlineMarkdown((token as any).text || '');
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(baseSize);
        const lines = wrapText(pdf, rawText, maxWidth - (curX - x));
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            ctx.yPos += lineHeight;
            checkPageBreak(ctx, lineHeight);
            curX = x;
          }
          pdf.text(lines[i], curX, ctx.yPos);
          curX += pdf.getTextWidth(lines[i]);
        }
        pdf.setFont('helvetica', 'normal');
        break;
      }
      case 'codespan': {
        const code = sanitizeText((token as any).text || '');
        pdf.setFont('courier', 'normal');
        pdf.setFontSize(baseSize - 1);
        const codeWidth = pdf.getTextWidth(code);
        const padH = 1.2;
        const padV = 0.8;
        // Inline code bg
        setFillColor(pdf, COLORS.inlineCodeBg);
        pdf.roundedRect(curX - padH, ctx.yPos - 3.2, codeWidth + padH * 2, 4.5, 0.8, 0.8, 'F');
        setColor(pdf, COLORS.codeText);
        pdf.text(code, curX, ctx.yPos);
        curX += codeWidth + padH * 2 + 0.5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(baseSize);
        setColor(pdf, COLORS.text);
        break;
      }
      case 'link': {
        const linkText = stripInlineMarkdown((token as any).text || '');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(baseSize);
        setColor(pdf, COLORS.linkBlue);
        const lines = wrapText(pdf, linkText, maxWidth - (curX - x));
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            ctx.yPos += lineHeight;
            checkPageBreak(ctx, lineHeight);
            curX = x;
          }
          pdf.text(lines[i], curX, ctx.yPos);
          // Add underline
          const w = pdf.getTextWidth(lines[i]);
          setDrawColor(pdf, COLORS.linkBlue);
          pdf.line(curX, ctx.yPos + 0.5, curX + w, ctx.yPos + 0.5);
          curX += w;
        }
        setColor(pdf, COLORS.text);
        break;
      }
      case 'del': {
        // Strikethrough
        const rawText = stripInlineMarkdown((token as any).text || '');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(baseSize);
        setColor(pdf, COLORS.textLight);
        const lines = wrapText(pdf, rawText, maxWidth - (curX - x));
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            ctx.yPos += lineHeight;
            checkPageBreak(ctx, lineHeight);
            curX = x;
          }
          pdf.text(lines[i], curX, ctx.yPos);
          const w = pdf.getTextWidth(lines[i]);
          pdf.line(curX, ctx.yPos - 1.2, curX + w, ctx.yPos - 1.2);
          curX += w;
        }
        setColor(pdf, COLORS.text);
        break;
      }
      default: {
        // Fallback: render as plain text
        const fallbackText = 'text' in token ? (token as any).text || (token as any).raw || '' : (token as any).raw || '';
        if (fallbackText) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(baseSize);
          const lines = wrapText(pdf, fallbackText, maxWidth - (curX - x));
          for (let i = 0; i < lines.length; i++) {
            if (i > 0) {
              ctx.yPos += lineHeight;
              checkPageBreak(ctx, lineHeight);
              curX = x;
            }
            pdf.text(lines[i], curX, ctx.yPos);
            curX += pdf.getTextWidth(lines[i]);
          }
        }
      }
    }
  }
}

/**
 * Render a single paragraph as text with inline formatting.
 * Falls back to simple text rendering for plain paragraphs (the common case).
 */
function renderParagraph(ctx: PDFContext, token: Tokens.Paragraph, x: number, maxWidth: number, fontSize: number = 10): void {
  const { pdf } = ctx;
  const lineHeight = fontSize * 0.45 + 1.5;

  // Check if it has any inline tokens worth rich rendering
  const hasRichContent = token.tokens?.some((t: any) =>
    t.type === 'strong' || t.type === 'em' || t.type === 'codespan' ||
    t.type === 'link' || t.type === 'del'
  );

  if (!hasRichContent || !token.tokens) {
    // Simple text rendering — most common case
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fontSize);
    setColor(pdf, COLORS.text);
    const plainText = stripInlineMarkdown(token.text || '');
    const lines = wrapText(pdf, plainText, maxWidth);
    for (const line of lines) {
      checkPageBreak(ctx, lineHeight);
      pdf.text(line, x, ctx.yPos);
      ctx.yPos += lineHeight;
    }
  } else {
    // Rich inline rendering
    checkPageBreak(ctx, lineHeight);
    setColor(pdf, COLORS.text);
    renderInlineTokens(ctx, token.tokens, x, maxWidth, lineHeight, fontSize);
    ctx.yPos += lineHeight;
  }
}

/**
 * Render a fenced code block with background and monospace font.
 */
function renderCodeBlock(ctx: PDFContext, code: string, lang: string, x: number, maxWidth: number): void {
  const { pdf } = ctx;
  const fontSize = 8;
  const lineHeight = 3.8;
  const padding = 3;

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(fontSize);

  const codeLines = code.split('\n');
  const wrappedLines: string[] = [];
  for (const codeLine of codeLines) {
    if (codeLine === '') {
      wrappedLines.push('');
    } else {
      const wrapped = wrapText(pdf, codeLine, maxWidth - CODE_INDENT * 2 - padding * 2);
      wrappedLines.push(...wrapped);
    }
  }

  // Language label
  let labelHeight = 0;
  if (lang) {
    labelHeight = 6;
  }

  const blockHeight = labelHeight + padding * 2 + wrappedLines.length * lineHeight;

  // Check if we need a page break for at least a few lines
  checkPageBreak(ctx, Math.min(blockHeight, 30));

  const startY = ctx.yPos;

  // Language label bar
  if (lang) {
    setFillColor(pdf, [233, 235, 238]);
    pdf.roundedRect(x, ctx.yPos - 3, maxWidth, labelHeight, 1.5, 1.5, 'F');
    // Cover bottom corners so code block continues seamlessly
    setFillColor(pdf, [233, 235, 238]);
    pdf.rect(x, ctx.yPos - 3 + labelHeight - 1.5, maxWidth, 1.5, 'F');
    pdf.setFontSize(7.5);
    setColor(pdf, COLORS.textMuted);
    pdf.setFont('helvetica', 'normal');
    pdf.text(sanitizeText(lang), x + padding, ctx.yPos);
    ctx.yPos += labelHeight;
  }

  // Code background
  const codeBgStartY = ctx.yPos - 3;
  const codeBgHeight = padding * 2 + wrappedLines.length * lineHeight;

  // Draw bg per page chunk
  let remainingLines = [...wrappedLines];
  let bgY = codeBgStartY;

  while (remainingLines.length > 0) {
    const availableHeight = PAGE_HEIGHT - MARGIN - bgY;
    const linesOnPage = Math.floor((availableHeight - padding * 2) / lineHeight);
    const chunk = remainingLines.splice(0, Math.max(1, linesOnPage));

    const chunkHeight = padding * 2 + chunk.length * lineHeight;
    setFillColor(pdf, COLORS.codeBg);

    if (lang && bgY === codeBgStartY) {
      // First chunk, no top rounding (connected to label)
      pdf.rect(x, bgY, maxWidth, chunkHeight, 'F');
      // Bottom rounded corners
      pdf.roundedRect(x, bgY + chunkHeight - 2, maxWidth, 2, 1, 1, 'F');
    } else if (remainingLines.length === 0) {
      pdf.roundedRect(x, bgY, maxWidth, chunkHeight, 1.5, 1.5, 'F');
    } else {
      pdf.rect(x, bgY, maxWidth, chunkHeight, 'F');
    }

    // Render lines
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(fontSize);
    setColor(pdf, COLORS.codeText);
    let lineY = bgY + padding + 3;
    for (const line of chunk) {
      pdf.text(line, x + padding, lineY);
      lineY += lineHeight;
    }

    ctx.yPos = lineY + padding - lineHeight + 1;

    if (remainingLines.length > 0) {
      ctx.pdf.addPage();
      ctx.currentPage++;
      ctx.yPos = MARGIN;
      bgY = MARGIN - 3;
    }
  }

  ctx.yPos += 2;
}

/**
 * Render a list (ordered or unordered).
 */
function renderList(ctx: PDFContext, token: Tokens.List, x: number, maxWidth: number, depth: number = 0): void {
  const { pdf } = ctx;
  const lineHeight = 5.5;
  const indent = 5;
  const bulletIndent = x + depth * indent;
  const textX = bulletIndent + 5;
  const textWidth = maxWidth - (textX - x);

  token.items.forEach((item: any, idx: number) => {
    checkPageBreak(ctx, lineHeight);

    // Bullet or number
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setColor(pdf, COLORS.text);

    const bullet = token.ordered ? `${(token.start || 1) + idx}.` : '-';
    pdf.text(bullet, bulletIndent, ctx.yPos);

    // Item text — render inline tokens if available
    if (item.tokens && item.tokens.length > 0) {
      for (const subToken of item.tokens) {
        if (subToken.type === 'text') {
          const hasInlineTokens = (subToken as any).tokens?.length > 0;
          if (hasInlineTokens) {
            renderInlineTokens(ctx, (subToken as any).tokens, textX, textWidth, lineHeight, 10);
            ctx.yPos += lineHeight;
          } else {
            const lines = wrapText(pdf, stripInlineMarkdown((subToken as any).text || ''), textWidth);
            for (const line of lines) {
              checkPageBreak(ctx, lineHeight);
              pdf.text(line, textX, ctx.yPos);
              ctx.yPos += lineHeight;
            }
          }
        } else if (subToken.type === 'paragraph') {
          renderParagraph(ctx, subToken as Tokens.Paragraph, textX, textWidth);
        } else if (subToken.type === 'list') {
          renderList(ctx, subToken as Tokens.List, textX, textWidth, depth + 1);
        } else if (subToken.type === 'code') {
          renderCodeBlock(ctx, (subToken as any).text || '', (subToken as any).lang || '', textX, textWidth);
        }
      }
    } else {
      const plainText = stripInlineMarkdown(item.text || '');
      const lines = wrapText(pdf, plainText, textWidth);
      for (const line of lines) {
        checkPageBreak(ctx, lineHeight);
        pdf.text(line, textX, ctx.yPos);
        ctx.yPos += lineHeight;
      }
    }
  });
}

/**
 * Render a table.
 */
function renderTable(ctx: PDFContext, token: Tokens.Table, x: number, maxWidth: number): void {
  const { pdf } = ctx;
  const fontSize = 8.5;
  const cellPadding = 2.5;
  const lineHeight = 4;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(fontSize);

  const numCols = token.header.length;
  const colWidth = maxWidth / numCols;

  // Header row
  checkPageBreak(ctx, 10);
  const headerY = ctx.yPos;

  // Header background
  setFillColor(pdf, COLORS.tableHeaderBg);
  pdf.rect(x, headerY - 3.5, maxWidth, 7, 'F');

  // Header border
  setDrawColor(pdf, COLORS.tableBorder);
  pdf.setLineWidth(0.3);
  pdf.rect(x, headerY - 3.5, maxWidth, 7);

  // Header text
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(fontSize);
  setColor(pdf, COLORS.text);

  token.header.forEach((cell: any, i: number) => {
    const cellText = stripInlineMarkdown(cell.text || '');
    const truncated = cellText.length > 30 ? cellText.slice(0, 28) + '...' : cellText;
    pdf.text(truncated, x + i * colWidth + cellPadding, headerY);
  });

  // Vertical lines for header
  for (let i = 1; i < numCols; i++) {
    pdf.line(x + i * colWidth, headerY - 3.5, x + i * colWidth, headerY + 3.5);
  }

  ctx.yPos = headerY + 3.5;

  // Body rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(fontSize);

  for (const row of token.rows) {
    const rowHeight = 6.5;
    checkPageBreak(ctx, rowHeight);
    const rowY = ctx.yPos;

    // Row border
    setDrawColor(pdf, COLORS.tableBorder);
    pdf.rect(x, rowY, maxWidth, rowHeight);

    // Cell text
    setColor(pdf, COLORS.text);
    row.forEach((cell: any, i: number) => {
      const cellText = stripInlineMarkdown(cell.text || '');
      const truncated = cellText.length > 30 ? cellText.slice(0, 28) + '...' : cellText;
      pdf.text(truncated, x + i * colWidth + cellPadding, rowY + 4.5);
    });

    // Vertical lines
    for (let i = 1; i < numCols; i++) {
      pdf.line(x + i * colWidth, rowY, x + i * colWidth, rowY + rowHeight);
    }

    ctx.yPos = rowY + rowHeight;
  }

  ctx.yPos += 2;
}

/**
 * Render a blockquote with left border.
 */
function renderBlockquote(ctx: PDFContext, token: Tokens.Blockquote, x: number, maxWidth: number): void {
  const { pdf } = ctx;
  const borderX = x;
  const textX = x + 4;
  const textWidth = maxWidth - 4;

  // Draw left border
  setDrawColor(pdf, COLORS.blockquoteBorder);
  pdf.setLineWidth(0.8);

  const startY = ctx.yPos - 3;

  // Render inner tokens
  pdf.setFont('helvetica', 'italic');
  setColor(pdf, COLORS.blockquoteText);

  if (token.tokens) {
    for (const subToken of token.tokens) {
      if (subToken.type === 'paragraph') {
        const lines = wrapText(pdf, stripInlineMarkdown((subToken as any).text || ''), textWidth);
        for (const line of lines) {
          checkPageBreak(ctx, 5.5);
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(10);
          setColor(pdf, COLORS.blockquoteText);
          pdf.text(line, textX, ctx.yPos);
          ctx.yPos += 5.5;
        }
      }
    }
  }

  // Draw the left border line
  const endY = ctx.yPos - 2;
  setDrawColor(pdf, COLORS.blockquoteBorder);
  pdf.setLineWidth(0.8);
  pdf.line(borderX, startY, borderX, endY);

  ctx.yPos += 1;

  // Reset
  pdf.setFont('helvetica', 'normal');
  setColor(pdf, COLORS.text);
}

/**
 * Render a horizontal rule.
 */
function renderHr(ctx: PDFContext, x: number, maxWidth: number): void {
  checkPageBreak(ctx, 8);
  ctx.yPos += 3;
  setDrawColor(ctx.pdf, COLORS.separator);
  ctx.pdf.setLineWidth(0.3);
  ctx.pdf.line(x, ctx.yPos, x + maxWidth, ctx.yPos);
  ctx.yPos += 5;
}

/**
 * Main markdown renderer — parses markdown and renders each block.
 */
function renderMarkdown(ctx: PDFContext, markdown: string, x: number, maxWidth: number, fontSize: number = 10): void {
  const { pdf } = ctx;
  const tokens = marked.lexer(markdown);

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const headingSizes: Record<number, number> = { 1: 15, 2: 13, 3: 11.5, 4: 11, 5: 10.5, 6: 10 };
        const size = headingSizes[token.depth] || 10;
        const spaceBefore = token.depth <= 2 ? 6 : 4;
        const spaceAfter = 3;

        ctx.yPos += spaceBefore;
        checkPageBreak(ctx, size * 0.5 + spaceAfter);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(size);
        setColor(pdf, COLORS.text);

        const headingText = stripInlineMarkdown(token.text || '');
        const lines = wrapText(pdf, headingText, maxWidth);
        for (const line of lines) {
          checkPageBreak(ctx, size * 0.5);
          pdf.text(line, x, ctx.yPos);
          ctx.yPos += size * 0.5;
        }

        // Underline for h1/h2
        if (token.depth <= 2) {
          setDrawColor(pdf, COLORS.separator);
          pdf.setLineWidth(0.2);
          pdf.line(x, ctx.yPos, x + maxWidth, ctx.yPos);
          ctx.yPos += 1;
        }

        ctx.yPos += spaceAfter;
        pdf.setFont('helvetica', 'normal');
        break;
      }

      case 'paragraph': {
        renderParagraph(ctx, token as Tokens.Paragraph, x, maxWidth, fontSize);
        ctx.yPos += 2;
        break;
      }

      case 'code': {
        renderCodeBlock(ctx, token.text || '', token.lang || '', x, maxWidth);
        break;
      }

      case 'list': {
        renderList(ctx, token as Tokens.List, x, maxWidth);
        ctx.yPos += 2;
        break;
      }

      case 'table': {
        renderTable(ctx, token as Tokens.Table, x, maxWidth);
        break;
      }

      case 'blockquote': {
        renderBlockquote(ctx, token as Tokens.Blockquote, x, maxWidth);
        break;
      }

      case 'hr': {
        renderHr(ctx, x, maxWidth);
        break;
      }

      case 'space': {
        ctx.yPos += 2;
        break;
      }

      case 'html': {
        // Render HTML as plain text
        const text = (token as any).text || '';
        if (text.trim()) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(fontSize);
          setColor(pdf, COLORS.textLight);
          const lines = wrapText(pdf, text, maxWidth);
          for (const line of lines) {
            checkPageBreak(ctx, 5.5);
            pdf.text(line, x, ctx.yPos);
            ctx.yPos += 5.5;
          }
        }
        break;
      }

      default: {
        // Fallback: render raw text
        const rawText = (token as any).text || (token as any).raw || '';
        if (rawText.trim()) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(fontSize);
          setColor(pdf, COLORS.text);
          const lines = wrapText(pdf, stripInlineMarkdown(rawText), maxWidth);
          for (const line of lines) {
            checkPageBreak(ctx, 5.5);
            pdf.text(line, x, ctx.yPos);
            ctx.yPos += 5.5;
          }
          ctx.yPos += 2;
        }
      }
    }
  }
}

/**
 * Draw a rounded-rect role badge.
 */
function drawRoleBadge(ctx: PDFContext, label: string, bgColor: [number, number, number], textColor: [number, number, number], x: number): number {
  const { pdf } = ctx;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  const textWidth = pdf.getTextWidth(label);
  const badgeW = textWidth + 6;
  const badgeH = 5;

  setFillColor(pdf, bgColor);
  pdf.roundedRect(x, ctx.yPos - 3.5, badgeW, badgeH, 1.2, 1.2, 'F');

  setColor(pdf, textColor);
  pdf.text(label, x + 3, ctx.yPos);

  return badgeW;
}

function renderToolBlock(ctx: PDFContext, msg: ChatMessage & { role: 'tool' }): void {
  const { pdf } = ctx;
  const lineHeight = 4.5;

  // Tool header with badge
  checkPageBreak(ctx, 15);
  drawRoleBadge(ctx, `Tool: ${msg.toolName}`, [245, 240, 255], COLORS.toolPurple, MARGIN);
  ctx.yPos += 6;

  // Tool content area with subtle background
  const contentX = MARGIN + 2;
  const contentW = CONTENT_WIDTH - 4;

  // Input
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7.5);
  setColor(pdf, COLORS.codeText);

  const inputStr = typeof msg.input === 'string'
    ? msg.input
    : JSON.stringify(msg.input, null, 2);

  const inputLines = wrapText(pdf, inputStr, contentW - 4);
  const displayLines = inputLines.slice(0, 12);

  // Background for input
  const inputBlockHeight = displayLines.length * lineHeight + 6;
  checkPageBreak(ctx, Math.min(inputBlockHeight, 30));

  setFillColor(pdf, COLORS.toolBg);
  setDrawColor(pdf, COLORS.toolBorder);
  pdf.setLineWidth(0.2);
  const inputStartY = ctx.yPos - 3;
  pdf.roundedRect(contentX, inputStartY, contentW, Math.min(inputBlockHeight, PAGE_HEIGHT - MARGIN - inputStartY), 1, 1, 'FD');

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7.5);
  setColor(pdf, COLORS.codeText);

  for (const line of displayLines) {
    checkPageBreak(ctx, lineHeight);
    pdf.text(line, contentX + 3, ctx.yPos);
    ctx.yPos += lineHeight;
  }

  if (inputLines.length > 12) {
    setColor(pdf, COLORS.textMuted);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    checkPageBreak(ctx, lineHeight);
    pdf.text(`... (${inputLines.length - 12} more lines)`, contentX + 3, ctx.yPos);
    ctx.yPos += lineHeight;
  }

  ctx.yPos += 2;

  // Output
  if (msg.output) {
    ctx.yPos += 1;
    const outputLabel = msg.isError ? 'Error:' : 'Output:';
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    setColor(pdf, msg.isError ? COLORS.errorRed : COLORS.textMuted);
    checkPageBreak(ctx, 5);
    pdf.text(outputLabel, contentX, ctx.yPos);
    ctx.yPos += 4;

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7.5);
    setColor(pdf, msg.isError ? COLORS.errorRed : COLORS.codeText);

    const outputLines = wrapText(pdf, msg.output, contentW - 4);
    const displayOutputLines = outputLines.slice(0, 15);

    const outputBlockHeight = displayOutputLines.length * lineHeight + 6;
    checkPageBreak(ctx, Math.min(outputBlockHeight, 30));

    const bgColor: [number, number, number] = msg.isError ? COLORS.errorRedBg : COLORS.toolBg;
    setFillColor(pdf, bgColor);
    setDrawColor(pdf, msg.isError ? COLORS.errorRed : COLORS.toolBorder);
    pdf.setLineWidth(0.2);
    const outputStartY = ctx.yPos - 3;
    pdf.roundedRect(contentX, outputStartY, contentW, Math.min(outputBlockHeight, PAGE_HEIGHT - MARGIN - outputStartY), 1, 1, 'FD');

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7.5);
    setColor(pdf, msg.isError ? COLORS.errorRed : COLORS.codeText);

    for (const line of displayOutputLines) {
      checkPageBreak(ctx, lineHeight);
      pdf.text(line, contentX + 3, ctx.yPos);
      ctx.yPos += lineHeight;
    }

    if (outputLines.length > 15) {
      setColor(pdf, COLORS.textMuted);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      checkPageBreak(ctx, lineHeight);
      pdf.text(`... (${outputLines.length - 15} more lines)`, contentX + 3, ctx.yPos);
      ctx.yPos += lineHeight;
    }
  }
}

export async function generateSessionPDF(
  metadata: SessionMetadata,
  messages: ChatMessage[],
  options: ExportOptions
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const ctx: PDFContext = {
    pdf,
    yPos: MARGIN,
    currentPage: 1,
  };

  // === Title section ===
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  setColor(pdf, COLORS.text);
  const titleLines = wrapText(pdf, metadata.label, CONTENT_WIDTH);
  for (const line of titleLines) {
    pdf.text(line, MARGIN, ctx.yPos);
    ctx.yPos += 9;
  }

  ctx.yPos += 2;

  // Metadata line
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  setColor(pdf, COLORS.textLight);
  pdf.text(`Directory: ${metadata.directory}`, MARGIN, ctx.yPos);
  ctx.yPos += 5;

  const exportDate = new Date().toLocaleString();
  pdf.text(`Exported: ${exportDate}  |  Messages: ${metadata.messageCount}`, MARGIN, ctx.yPos);
  ctx.yPos += 5;

  // Separator
  setDrawColor(pdf, COLORS.separator);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, ctx.yPos, MARGIN + CONTENT_WIDTH, ctx.yPos);
  ctx.yPos += 8;

  // === Filter messages ===
  let filteredMessages = messages;

  if (options.startFromMessageId) {
    const startIndex = messages.findIndex(m => m.id === options.startFromMessageId);
    if (startIndex !== -1) {
      filteredMessages = messages.slice(startIndex);
    }
  }

  if (!options.includeThinking) {
    filteredMessages = filteredMessages.filter(m => m.role !== 'thinking');
  }

  if (!options.includeTools) {
    filteredMessages = filteredMessages.filter(m => m.role !== 'tool');
  }

  // === Render messages ===
  for (let i = 0; i < filteredMessages.length; i++) {
    const msg = filteredMessages[i];

    // Allow UI to breathe for large sessions
    if (i > 0 && i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    checkPageBreak(ctx, 15);

    switch (msg.role) {
      case 'user': {
        // User badge
        drawRoleBadge(ctx, 'You', [219, 234, 254], COLORS.userBlue, MARGIN);
        ctx.yPos += 7;

        // User text with light blue background
        const userText = msg.text || '';
        if (userText) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          setColor(pdf, COLORS.text);

          const userLines = wrapText(pdf, userText, CONTENT_WIDTH - 8);
          const blockHeight = userLines.length * 5.5 + 6;
          checkPageBreak(ctx, Math.min(blockHeight, 30));

          // Light blue background
          setFillColor(pdf, COLORS.userBlueBg);
          const bgStartY = ctx.yPos - 3.5;
          pdf.roundedRect(MARGIN, bgStartY, CONTENT_WIDTH, Math.min(blockHeight, PAGE_HEIGHT - MARGIN - bgStartY), 2, 2, 'F');

          setColor(pdf, COLORS.text);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          for (const line of userLines) {
            checkPageBreak(ctx, 5.5);
            pdf.text(line, MARGIN + 4, ctx.yPos);
            ctx.yPos += 5.5;
          }
          ctx.yPos += 2;
        }

        if (msg.images && msg.images.length > 0) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(8.5);
          setColor(pdf, COLORS.textMuted);
          checkPageBreak(ctx, 5);
          pdf.text(`[${msg.images.length} image(s) attached]`, MARGIN + 4, ctx.yPos);
          ctx.yPos += 5;
        }
        break;
      }

      case 'assistant': {
        // Assistant badge
        drawRoleBadge(ctx, 'Claude', [240, 240, 240], COLORS.assistantGray, MARGIN);
        ctx.yPos += 7;

        // Render markdown content
        const assistantText = msg.text || '';
        if (assistantText) {
          renderMarkdown(ctx, assistantText, MARGIN, CONTENT_WIDTH);
        }
        break;
      }

      case 'thinking': {
        if (options.includeThinking) {
          drawRoleBadge(ctx, 'Thinking', [240, 240, 240], COLORS.thinkingGray, MARGIN);
          ctx.yPos += 6;

          // Thinking with left border + indented text
          const thinkingText = msg.text || '';
          const thinkingX = MARGIN + 4;
          const thinkingWidth = CONTENT_WIDTH - 8;
          const startY = ctx.yPos - 2;

          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(9);
          setColor(pdf, COLORS.blockquoteText);

          const thinkingLines = wrapText(pdf, thinkingText, thinkingWidth);
          for (const line of thinkingLines) {
            checkPageBreak(ctx, 5);
            pdf.text(line, thinkingX, ctx.yPos);
            ctx.yPos += 4.5;
          }

          // Left border
          setDrawColor(pdf, COLORS.thinkingGray);
          pdf.setLineWidth(0.5);
          pdf.line(MARGIN + 1, startY, MARGIN + 1, ctx.yPos - 2);
        }
        break;
      }

      case 'tool': {
        if (options.includeTools) {
          renderToolBlock(ctx, msg as ChatMessage & { role: 'tool' });
        }
        break;
      }

      case 'error': {
        drawRoleBadge(ctx, 'Error', COLORS.errorRedBg, COLORS.errorRed, MARGIN);
        ctx.yPos += 7;

        const errorText = msg.text || '';
        if (errorText) {
          // Error background
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          setColor(pdf, COLORS.errorRed);

          const errorLines = wrapText(pdf, errorText, CONTENT_WIDTH - 8);
          const blockHeight = errorLines.length * 5.5 + 6;
          checkPageBreak(ctx, Math.min(blockHeight, 20));

          setFillColor(pdf, COLORS.errorRedBg);
          const bgStartY = ctx.yPos - 3.5;
          pdf.roundedRect(MARGIN, bgStartY, CONTENT_WIDTH, Math.min(blockHeight, PAGE_HEIGHT - MARGIN - bgStartY), 2, 2, 'F');

          setColor(pdf, COLORS.errorRed);
          for (const line of errorLines) {
            checkPageBreak(ctx, 5.5);
            pdf.text(line, MARGIN + 4, ctx.yPos);
            ctx.yPos += 5.5;
          }
          ctx.yPos += 2;
        }
        break;
      }
    }

    // Message separator
    ctx.yPos += 4;
    setDrawColor(pdf, COLORS.separator);
    pdf.setLineWidth(0.15);
    checkPageBreak(ctx, 4);
    pdf.line(MARGIN + 20, ctx.yPos, MARGIN + CONTENT_WIDTH - 20, ctx.yPos);
    ctx.yPos += 6;
  }

  // === Session statistics ===
  if (options.includeStats && metadata.stats) {
    checkPageBreak(ctx, 30);
    ctx.yPos += 6;

    // Stats header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    setColor(pdf, COLORS.text);
    pdf.text('Session Statistics', MARGIN, ctx.yPos);
    ctx.yPos += 3;

    setDrawColor(pdf, COLORS.separator);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, ctx.yPos, MARGIN + 60, ctx.yPos);
    ctx.yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setColor(pdf, COLORS.textLight);

    if (metadata.stats.totalTokens !== undefined) {
      pdf.text(`Tokens: ${metadata.stats.totalTokens.toLocaleString()}`, MARGIN, ctx.yPos);
      ctx.yPos += 6;
    }

    if (metadata.stats.totalCost !== undefined) {
      pdf.text(`Cost: $${metadata.stats.totalCost.toFixed(4)}`, MARGIN, ctx.yPos);
      ctx.yPos += 6;
    }

    if (metadata.stats.duration !== undefined) {
      const durationSec = (metadata.stats.duration / 1000).toFixed(1);
      pdf.text(`Duration: ${durationSec}s`, MARGIN, ctx.yPos);
      ctx.yPos += 6;
    }
  }

  // === Page numbers ===
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    setColor(pdf, COLORS.textMuted);
    pdf.text(
      `Page ${i} of ${totalPages}`,
      PAGE_WIDTH / 2,
      PAGE_HEIGHT - 8,
      { align: 'center' }
    );
  }

  return pdf.output('blob');
}

export function generateFilename(sessionLabel: string): string {
  const date = new Date().toISOString().split('T')[0];
  const sanitized = sessionLabel
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .substring(0, 50);

  return `claude-session-${sanitized}-${date}.pdf`;
}
