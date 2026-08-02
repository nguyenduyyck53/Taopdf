import JSZip from "jszip";
import { PDFDocument, degrees, rgb } from "pdf-lib";

export const PAGE_SIZES = {
  a4Portrait: { label: "A4 dọc", width: 595.28, height: 841.89 },
  a4Landscape: { label: "A4 ngang", width: 841.89, height: 595.28 },
  letterPortrait: { label: "Letter dọc", width: 612, height: 792 },
};

export function parseSplitRanges(expression, totalPages) {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new Error("Tài liệu chưa có trang để tách.");
  }

  const tokens = String(expression)
    .split(/[;,\n]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("Hãy nhập ít nhất một khoảng trang, ví dụ: 1-3, 4-6.");
  }

  return tokens.map((token) => {
    const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) {
      throw new Error(`Khoảng “${token}” không hợp lệ.`);
    }

    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < 1 || start > end || end > totalPages) {
      throw new Error(`Khoảng “${token}” phải nằm trong 1-${totalPages}.`);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start - 1 + index);
  });
}

export function rangeLabel(indices) {
  const first = indices[0] + 1;
  const last = indices.at(-1) + 1;
  return first === last ? `trang-${String(first).padStart(3, "0")}` : `trang-${first}-${last}`;
}

function normalizeRotation(angle) {
  return ((angle % 360) + 360) % 360;
}

function colorFromHex(hex = "#ffffff") {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3
    ? clean.split("").map((digit) => digit + digit).join("")
    : clean, 16);
  if (Number.isNaN(value)) return rgb(1, 1, 1);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export async function buildPdf(projectPages, sources, metadata = {}) {
  if (!projectPages.length) throw new Error("Tài liệu chưa có trang để xuất.");

  const output = await PDFDocument.create();
  const sourceDocuments = new Map();

  for (const item of projectPages) {
    if (item.kind === "blank") {
      const page = output.addPage([item.width, item.height]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
        color: colorFromHex(item.background),
      });
      page.setRotation(degrees(normalizeRotation(item.rotation ?? 0)));
      continue;
    }

    const source = sources.get(item.sourceId);
    if (!source) throw new Error(`Không tìm thấy dữ liệu nguồn cho “${item.sourceName}”.`);

    let sourceDocument = sourceDocuments.get(item.sourceId);
    if (!sourceDocument) {
      sourceDocument = await PDFDocument.load(source.bytes, { updateMetadata: false });
      sourceDocuments.set(item.sourceId, sourceDocument);
    }

    const [copiedPage] = await output.copyPages(sourceDocument, [item.sourcePageIndex]);
    const currentAngle = copiedPage.getRotation().angle ?? 0;
    copiedPage.setRotation(degrees(normalizeRotation(currentAngle + (item.rotation ?? 0))));
    output.addPage(copiedPage);
  }

  output.setTitle(metadata.title || "Tài liệu PDF");
  output.setAuthor(metadata.author || "PDF Gọn");
  output.setCreator("PDF Gọn - xử lý riêng tư trong trình duyệt");
  output.setProducer("PDF Gọn");
  output.setCreationDate(new Date());
  output.setModificationDate(new Date());

  return output.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function splitPdfToZip(projectPages, sources, groups, options = {}) {
  const zip = new JSZip();
  const baseName = options.baseName || "tai-lieu";

  for (const indices of groups) {
    const selectedPages = indices.map((index) => projectPages[index]);
    const bytes = await buildPdf(selectedPages, sources, {
      title: `${options.title || baseName} - ${rangeLabel(indices)}`,
    });
    zip.file(`${baseName}-${rangeLabel(indices)}.pdf`, bytes);
  }

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
