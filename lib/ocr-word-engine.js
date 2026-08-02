import JSZip from "jszip";
import {
  AlignmentType,
  Document,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Math as WordMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableAnchorType,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalPositionRelativeFrom,
  WidthType,
  convertInchesToTwip,
} from "docx";

const MIN_CELL_GAP = 26;
const PAGE_MARGIN_TWIP = 48;

export const LANGUAGE_OPTIONS = [
  { code: "vie", label: "Tiếng Việt", short: "VI" },
  { code: "eng", label: "English", short: "EN" },
  { code: "chi_sim", label: "中文 (Giản thể)", short: "ZH" },
  { code: "jpn", label: "日本語", short: "JA" },
  { code: "kor", label: "한국어", short: "KO" },
  { code: "fra", label: "Français", short: "FR" },
  { code: "deu", label: "Deutsch", short: "DE" },
  { code: "spa", label: "Español", short: "ES" },
  { code: "rus", label: "Русский", short: "RU" },
  { code: "tha", label: "ภาษาไทย", short: "TH" },
];

export function parsePageRange(expression, totalPages) {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new Error("Tài liệu chưa có trang để xử lý.");
  }

  const value = String(expression || "").trim();
  if (!value || /^(tất cả|tat ca|all)$/i.test(value)) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set();
  const tokens = value.split(/[;,\n]/).map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) throw new Error("Hãy nhập khoảng trang, ví dụ 1-20, 25.");

  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`Khoảng “${token}” không hợp lệ.`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > totalPages) {
      throw new Error(`Khoảng “${token}” phải nằm trong 1-${totalPages}.`);
    }
    for (let page = start; page <= end; page += 1) pages.add(page);
  }

  return [...pages].sort((a, b) => a - b);
}

export function safeWordFileName(name) {
  const clean = String(name || "tai-lieu-ocr")
    .replace(/\.(pdf|docx|zip)$/i, "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");
  return clean || "tai-lieu-ocr";
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unionBox(items) {
  return items.reduce((box, item) => ({
    x0: Math.min(box.x0, item.bbox.x0),
    y0: Math.min(box.y0, item.bbox.y0),
    x1: Math.max(box.x1, item.bbox.x1),
    y1: Math.max(box.y1, item.bbox.y1),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
}

export function groupPdfTextItems(items, viewport) {
  const tokens = items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .map((item) => {
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const point = viewport.convertToViewportPoint(transform[4], transform[5]);
      const height = Math.max(5, Math.hypot(transform[2], transform[3]) * viewport.scale);
      const width = Math.max(2, Number(item.width || item.str.length * height * 0.48) * viewport.scale);
      return {
        text: item.str.trim(),
        confidence: 100,
        bbox: {
          x0: point[0],
          y0: point[1] - height * 0.82,
          x1: point[0] + width,
          y1: point[1] + height * 0.18,
        },
      };
    })
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  const lines = [];
  for (const token of tokens) {
    const tokenHeight = token.bbox.y1 - token.bbox.y0;
    let line = lines.find((candidate) => {
      const lineHeight = candidate.bbox.y1 - candidate.bbox.y0;
      const centerDelta = Math.abs(
        (candidate.bbox.y0 + candidate.bbox.y1) / 2 - (token.bbox.y0 + token.bbox.y1) / 2,
      );
      return centerDelta <= Math.max(3, Math.min(tokenHeight, lineHeight) * 0.58);
    });
    if (!line) {
      line = { words: [], text: "", confidence: 100, bbox: { ...token.bbox } };
      lines.push(line);
    }
    line.words.push(token);
    line.bbox = unionBox(line.words);
  }

  for (const line of lines) {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const averageHeight = median(line.words.map((word) => word.bbox.y1 - word.bbox.y0)) || 10;
    line.text = line.words.map((word, index) => {
      if (!index) return word.text;
      const gap = word.bbox.x0 - line.words[index - 1].bbox.x1;
      return `${gap > averageHeight * 0.18 ? " " : ""}${word.text}`;
    }).join("");
  }

  return lines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
}

export function flattenTesseractLines(data) {
  const lines = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const words = (line.words || []).filter((word) => word.text?.trim()).map((word) => ({
          text: word.text.trim(),
          confidence: Number(word.confidence || line.confidence || data.confidence || 0),
          bbox: { ...word.bbox },
        }));
        if (!words.length) continue;
        lines.push({
          text: line.text?.trim() || words.map((word) => word.text).join(" "),
          confidence: Number(line.confidence || data.confidence || 0),
          bbox: { ...line.bbox },
          words,
        });
      }
    }
  }
  return lines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
}

function splitLineIntoCells(line) {
  if (!line.words?.length) return [{ text: line.text, bbox: line.bbox, words: line.words || [] }];
  const height = median(line.words.map((word) => word.bbox.y1 - word.bbox.y0)) || 12;
  const threshold = Math.max(MIN_CELL_GAP, height * 1.7);
  const cells = [];
  let current = [];
  for (const word of line.words) {
    if (current.length && word.bbox.x0 - current.at(-1).bbox.x1 > threshold) {
      cells.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) cells.push(current);
  return cells.map((words) => ({
    text: words.map((word) => word.text).join(" "),
    bbox: unionBox(words),
    words,
  }));
}

function columnsAreCompatible(previous, next) {
  if (Math.abs(previous.length - next.length) > 1) return false;
  const compareCount = Math.min(previous.length, next.length);
  if (compareCount < 2) return false;
  const tolerance = Math.max(24, median([...previous, ...next].map((cell) => cell.bbox.y1 - cell.bbox.y0)) * 2.1);
  let matches = 0;
  for (let index = 0; index < compareCount; index += 1) {
    if (Math.abs(previous[index].bbox.x0 - next[index].bbox.x0) <= tolerance) matches += 1;
  }
  return matches >= compareCount - 1;
}

export function analyzeLayout(lines) {
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const blocks = [];
  let index = 0;
  while (index < sorted.length) {
    const firstCells = splitLineIntoCells(sorted[index]);
    if (firstCells.length >= 2) {
      const rows = [{ line: sorted[index], cells: firstCells }];
      let cursor = index + 1;
      while (cursor < sorted.length) {
        const nextCells = splitLineIntoCells(sorted[cursor]);
        const previous = rows.at(-1);
        const verticalGap = sorted[cursor].bbox.y0 - previous.line.bbox.y1;
        const rowHeight = Math.max(8, previous.line.bbox.y1 - previous.line.bbox.y0);
        if (nextCells.length < 2 || verticalGap > rowHeight * 2.6 || !columnsAreCompatible(previous.cells, nextCells)) break;
        rows.push({ line: sorted[cursor], cells: nextCells });
        cursor += 1;
      }
      const maxCells = Math.max(...rows.map((row) => row.cells.length));
      if (rows.length >= 3 || (rows.length >= 2 && maxCells >= 3)) {
        blocks.push({ type: "table", rows, bbox: unionBox(rows.map((row) => ({ bbox: row.line.bbox }))) });
        index = cursor;
        continue;
      }
    }
    blocks.push({ type: "line", line: sorted[index], bbox: sorted[index].bbox });
    index += 1;
  }
  return blocks;
}

export function isFormulaText(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 240) return false;
  const mathSymbols = value.match(/[=±×÷√∑∫∞≈≠≤≥∂∆∇α-ωΑ-Ω^_{}\/]/g)?.length || 0;
  const mathWords = /(?:sin|cos|tan|log|ln|lim|sqrt|frac|exp)\s*\(?/i.test(value);
  const variableExpression = /\b[a-z]\s*(?:[=+\-*/^_]|≤|≥)\s*[a-z0-9(]/i.test(value);
  const numberExpression = /\d\s*(?:[=+\-*/^]|×|÷|±)\s*\d/.test(value);
  return mathWords || variableExpression || numberExpression || mathSymbols >= 2;
}

function normalizeFormula(text) {
  return String(text || "")
    .replace(/\bDelta\b/gi, "Δ")
    .replace(/\btheta\b/gi, "θ")
    .replace(/\balpha\b/gi, "α")
    .replace(/\bbeta\b/gi, "β")
    .replace(/\bpi\b/gi, "π")
    .replace(/\binfinity\b/gi, "∞")
    .replace(/\bsqrt\s*/gi, "√")
    .replace(/\s+/g, " ")
    .trim();
}

function formulaComponents(text) {
  const value = normalizeFormula(text);
  const squareRoot = value.match(/^√\s*\(?([^()]+)\)?$/);
  if (squareRoot) return [new MathRadical({ children: [new MathRun(squareRoot[1].trim())] })];

  const fraction = value.match(/^\s*([^/=]{1,48})\s*\/\s*([^/=]{1,48})\s*$/);
  if (fraction) {
    return [new MathFraction({
      numerator: [new MathRun(fraction[1].trim())],
      denominator: [new MathRun(fraction[2].trim())],
    })];
  }

  const subSuper = value.match(/^(.+?)_\{?([^{}^]+)\}?\^\{?([^{}]+)\}?$/);
  if (subSuper) {
    return [new MathSubSuperScript({
      children: [new MathRun(subSuper[1])],
      subScript: [new MathRun(subSuper[2])],
      superScript: [new MathRun(subSuper[3])],
    })];
  }

  const superScript = value.match(/^(.+?)\^\{?([^{}]+)\}?$/);
  if (superScript) {
    return [new MathSuperScript({ children: [new MathRun(superScript[1])], superScript: [new MathRun(superScript[2])] })];
  }

  const subScript = value.match(/^(.+?)_\{?([^{}]+)\}?$/);
  if (subScript) {
    return [new MathSubScript({ children: [new MathRun(subScript[1])], subScript: [new MathRun(subScript[2])] })];
  }

  return [new MathRun(value)];
}

function lineFontSize(line) {
  const height = Math.max(7, line.bbox.y1 - line.bbox.y0);
  return Math.max(15, Math.min(44, Math.round(height * 1.42)));
}

function paragraphForText(text, line, options = {}) {
  const fontSize = lineFontSize(line);
  const formula = options.formulas !== false && isFormulaText(text);
  return new Paragraph({
    children: formula
      ? [new WordMath({ children: formulaComponents(text) })]
      : [new TextRun({ text, size: fontSize, font: options.font || "Arial" })],
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: { before: 0, after: 0, line: Math.max(180, Math.round(fontSize * 10.5)) },
    run: { size: fontSize, font: options.font || "Arial" },
  });
}

function twipsFromPixel(value, pixelSize, pageTwips) {
  return Math.max(0, Math.round((value / Math.max(1, pixelSize)) * pageTwips));
}

function floatingOptions(bbox, page) {
  const pageWidth = convertInchesToTwip(page.pageWidthPt / 72);
  const pageHeight = convertInchesToTwip(page.pageHeightPt / 72);
  return {
    x: twipsFromPixel(bbox.x0, page.pixelWidth, pageWidth),
    y: twipsFromPixel(bbox.y0, page.pixelHeight, pageHeight),
    width: Math.max(160, twipsFromPixel(bbox.x1 - bbox.x0, page.pixelWidth, pageWidth)),
    height: Math.max(120, twipsFromPixel(bbox.y1 - bbox.y0, page.pixelHeight, pageHeight)),
  };
}

function cellOptions(text, line, width, options) {
  return new TableCell({
    width: { size: Math.max(120, width), type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 22, right: 22 },
    borders: options.showBorders ? undefined : TableBorders.NONE,
    children: [paragraphForText(text, line, options)],
  });
}

function preciseLineTable(block, page, options) {
  const position = floatingOptions(block.bbox, page);
  return new Table({
    width: { size: position.width, type: WidthType.DXA },
    columnWidths: [position.width],
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    float: {
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: position.x,
      absoluteVerticalPosition: position.y,
      leftFromText: 0,
      rightFromText: 0,
      topFromText: 0,
      bottomFromText: 0,
      overlap: "overlap",
    },
    rows: [new TableRow({
      height: { value: position.height, rule: HeightRule.ATLEAST },
      children: [cellOptions(block.line.text, block.line, position.width, options)],
    })],
  });
}

function tableColumnStarts(block) {
  const count = Math.max(...block.rows.map((row) => row.cells.length));
  const starts = [];
  for (let index = 0; index < count; index += 1) {
    const values = block.rows.map((row) => row.cells[index]?.bbox.x0).filter(Number.isFinite);
    starts.push(median(values));
  }
  return starts;
}

function preciseDataTable(block, page, options) {
  const position = floatingOptions(block.bbox, page);
  const starts = tableColumnStarts(block);
  const pageWidthTwip = convertInchesToTwip(page.pageWidthPt / 72);
  const widths = starts.map((start, index) => {
    const next = starts[index + 1] ?? block.bbox.x1;
    return Math.max(160, twipsFromPixel(next - start, page.pixelWidth, pageWidthTwip));
  });
  const widthTotal = widths.reduce((sum, width) => sum + width, 0);

  return new Table({
    width: { size: Math.max(position.width, widthTotal), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: options.hasBackground ? TableBorders.NONE : undefined,
    float: {
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: position.x,
      absoluteVerticalPosition: position.y,
      leftFromText: 0,
      rightFromText: 0,
      topFromText: 0,
      bottomFromText: 0,
      overlap: "overlap",
    },
    rows: block.rows.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0 && block.rows.length >= 3,
      cantSplit: true,
      children: widths.map((width, cellIndex) => {
        const cell = row.cells[cellIndex];
        return cellOptions(cell?.text || "", cell ? { ...row.line, bbox: cell.bbox } : row.line, width, {
          ...options,
          showBorders: !options.hasBackground,
        });
      }),
    })),
  });
}

function flowChildren(page, options) {
  const children = [];
  let previousBottom = 0;
  for (const block of page.blocks) {
    const gap = Math.max(0, block.bbox.y0 - previousBottom);
    if (block.type === "table") {
      const starts = tableColumnStarts(block);
      const tableWidth = convertInchesToTwip(Math.max(5.8, page.pageWidthPt / 72 - 1));
      const rawWidths = starts.map((start, index) => (starts[index + 1] ?? block.bbox.x1) - start);
      const rawTotal = rawWidths.reduce((sum, width) => sum + Math.max(width, 1), 0);
      const widths = rawWidths.map((width) => Math.max(320, Math.round((Math.max(width, 1) / rawTotal) * tableWidth)));
      children.push(new Paragraph({ spacing: { before: Math.min(360, Math.round(gap * 8)), after: 0 }, children: [] }));
      children.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        rows: block.rows.map((row, rowIndex) => new TableRow({
          tableHeader: rowIndex === 0 && block.rows.length >= 3,
          cantSplit: true,
          children: widths.map((width, cellIndex) => {
            const cell = row.cells[cellIndex];
            return cellOptions(cell?.text || "", cell ? { ...row.line, bbox: cell.bbox } : row.line, width, { ...options, showBorders: true });
          }),
        })),
      }));
    } else {
      children.push(new Paragraph({
        children: paragraphForText(block.line.text, block.line, options).options?.children,
        text: block.line.text,
        spacing: { before: Math.min(420, Math.round(gap * 7)), after: 40 },
        indent: { left: Math.max(0, Math.round((block.bbox.x0 / page.pixelWidth) * 700)) },
        run: { size: lineFontSize(block.line), font: options.font || "Arial" },
      }));
      if (options.formulas !== false && isFormulaText(block.line.text)) {
        children.pop();
        children.push(new Paragraph({
          children: [new WordMath({ children: formulaComponents(block.line.text) })],
          spacing: { before: Math.min(420, Math.round(gap * 7)), after: 40 },
          indent: { left: Math.max(0, Math.round((block.bbox.x0 / page.pixelWidth) * 700)) },
          run: { size: lineFontSize(block.line), font: options.font || "Arial" },
        }));
      }
    }
    previousBottom = block.bbox.y1;
  }
  return children.length ? children : [new Paragraph({ text: "[Trang không có nội dung nhận diện được]" })];
}

function preciseChildren(page, options) {
  const children = [];
  if (page.background?.length) {
    children.push(new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({
        type: "jpg",
        data: page.background,
        transformation: {
          width: (page.pageWidthPt / 72) * 96,
          height: (page.pageHeightPt / 72) * 96,
        },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
          behindDocument: true,
          allowOverlap: true,
          lockAnchor: true,
          // OOXML requires wp:anchor/@relativeHeight to be an unsigned integer.
          // Do not use a negative zIndex here: docx maps it to relativeHeight,
          // which makes Word reject the document even when the ZIP/XML is valid.
        },
        altText: { title: `Nền trang ${page.pageNumber}`, description: "Hình và đường kẻ giữ từ PDF gốc", name: `page-${page.pageNumber}` },
      })],
    }));
  }

  for (const block of page.blocks) {
    children.push(block.type === "table"
      ? preciseDataTable(block, page, { ...options, hasBackground: Boolean(page.background?.length) })
      : preciseLineTable(block, page, options));
  }
  children.push(new Paragraph({ text: "", spacing: { before: 0, after: 0 } }));
  return children;
}

function createDocument(pages, options) {
  return new Document({
    title: options.title,
    subject: "PDF OCR sang Word có thể chỉnh sửa",
    creator: "VietOCR Studio",
    description: "Tài liệu được dựng lại từ PDF với bảng và công thức Word có thể chỉnh sửa.",
    styles: {
      default: {
        document: { run: { font: options.font || "Arial", size: 22 }, paragraph: { spacing: { line: 276 } } },
      },
    },
    sections: pages.map((page) => ({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: {
            width: convertInchesToTwip(page.pageWidthPt / 72),
            height: convertInchesToTwip(page.pageHeightPt / 72),
          },
          margin: page.precise
            ? { top: PAGE_MARGIN_TWIP, right: PAGE_MARGIN_TWIP, bottom: PAGE_MARGIN_TWIP, left: PAGE_MARGIN_TWIP }
            : { top: 540, right: 620, bottom: 540, left: 620 },
        },
      },
      children: page.precise ? preciseChildren(page, options) : flowChildren(page, options),
    })),
  });
}

export async function createWordOutput(pages, options = {}) {
  if (!pages.length) throw new Error("Chưa có trang đã nhận diện để xuất Word.");
  const baseName = safeWordFileName(options.fileName || options.title || "tai-lieu-ocr");
  const splitEvery = Number(options.splitEvery || 0);
  const groups = [];
  if (splitEvery > 0 && pages.length > splitEvery) {
    for (let index = 0; index < pages.length; index += splitEvery) groups.push(pages.slice(index, index + splitEvery));
  } else {
    groups.push(pages);
  }

  if (groups.length === 1) {
    const blob = await Packer.toBlob(createDocument(groups[0], { ...options, title: options.title || baseName }));
    return { blob, extension: "docx", fileName: `${baseName}.docx`, partCount: 1 };
  }

  const zip = new JSZip();
  for (let index = 0; index < groups.length; index += 1) {
    const first = groups[index][0].pageNumber;
    const last = groups[index].at(-1).pageNumber;
    const document = createDocument(groups[index], { ...options, title: `${options.title || baseName} (${first}-${last})` });
    const blob = await Packer.toBlob(document);
    zip.file(`${baseName}-trang-${first}-${last}.docx`, blob);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });
  return { blob, extension: "zip", fileName: `${baseName}-word.zip`, partCount: groups.length };
}

export function summarizePages(pages) {
  return pages.reduce((summary, page) => {
    summary.pages += 1;
    summary.ocrPages += page.method === "ocr" ? 1 : 0;
    summary.textPages += page.method === "text" ? 1 : 0;
    summary.tables += page.blocks.filter((block) => block.type === "table").length;
    summary.formulas += page.lines.filter((line) => isFormulaText(line.text)).length;
    summary.confidence += Number(page.confidence || 0);
    return summary;
  }, { pages: 0, ocrPages: 0, textPages: 0, tables: 0, formulas: 0, confidence: 0 });
}
