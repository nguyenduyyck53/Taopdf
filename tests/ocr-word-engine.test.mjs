import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  analyzeLayout,
  createWordOutput,
  isFormulaText,
  parsePageRange,
  safeWordFileName,
} from "../lib/ocr-word-engine.js";

function line(text, x, y, columns = null) {
  const words = columns
    ? columns.map((column) => ({ text: column.text, confidence: 99, bbox: { x0: column.x, y0: y, x1: column.x + column.text.length * 7, y1: y + 14 } }))
    : text.split(" ").map((word, index) => ({ text: word, confidence: 99, bbox: { x0: x + index * 48, y0: y, x1: x + index * 48 + word.length * 7, y1: y + 14 } }));
  return {
    text,
    confidence: 99,
    words,
    bbox: {
      x0: Math.min(...words.map((word) => word.bbox.x0)),
      y0: y,
      x1: Math.max(...words.map((word) => word.bbox.x1)),
      y1: y + 14,
    },
  };
}

test("parses page ranges without duplicating pages", () => {
  assert.deepEqual(parsePageRange("1-3, 3, 5; 8-9", 10), [1, 2, 3, 5, 8, 9]);
  assert.deepEqual(parsePageRange("Tất cả", 4), [1, 2, 3, 4]);
  assert.throws(() => parsePageRange("9-12", 10), /phải nằm trong/);
  assert.equal(safeWordFileName("Hồ sơ: OCR?.pdf"), "Hồ sơ- OCR-");
});

test("detects aligned rows as an editable table", () => {
  const rows = [
    line("Chỉ tiêu Giá trị Đơn vị", 60, 100, [{ text: "Chỉ tiêu", x: 60 }, { text: "Giá trị", x: 250 }, { text: "Đơn vị", x: 390 }]),
    line("Khối lượng 125 kg", 60, 125, [{ text: "Khối lượng", x: 60 }, { text: "125", x: 250 }, { text: "kg", x: 390 }]),
    line("Gia tốc 9.81 m/s²", 60, 150, [{ text: "Gia tốc", x: 60 }, { text: "9.81", x: 250 }, { text: "m/s²", x: 390 }]),
  ];
  const blocks = analyzeLayout(rows);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "table");
  assert.equal(blocks[0].rows.length, 3);
});

test("exports Vietnamese text, tables, and editable OMML equations", async () => {
  const rows = [
    line("KẾT QUẢ THÍ NGHIỆM", 80, 75),
    line("Chỉ tiêu Giá trị Đơn vị", 60, 120, [{ text: "Chỉ tiêu", x: 60 }, { text: "Giá trị", x: 250 }, { text: "Đơn vị", x: 390 }]),
    line("Khối lượng 125 kg", 60, 145, [{ text: "Khối lượng", x: 60 }, { text: "125", x: 250 }, { text: "kg", x: 390 }]),
    line("Gia tốc 9.81 m/s²", 60, 170, [{ text: "Gia tốc", x: 60 }, { text: "9.81", x: 250 }, { text: "m/s²", x: 390 }]),
    line("E = mc^2", 190, 230),
  ];
  assert.equal(isFormulaText("E = mc^2"), true);
  assert.equal(isFormulaText("Hà Nội (2026)"), false);

  const page = {
    pageNumber: 1,
    pageWidthPt: 595.28,
    pageHeightPt: 841.89,
    pixelWidth: 1190,
    pixelHeight: 1684,
    precise: true,
    method: "text",
    confidence: 99,
    background: Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
      "base64",
    ),
    lines: rows,
    blocks: analyzeLayout(rows),
  };
  const output = await createWordOutput([page], { fileName: "kiem-thu-vietocr", formulas: true });
  const archive = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const xml = await archive.file("word/document.xml").async("string");

  assert.equal(output.fileName, "kiem-thu-vietocr.docx");
  assert.match(xml, /KẾT QUẢ THÍ NGHIỆM/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<m:oMath>/);
  assert.match(xml, /<wp:anchor[^>]*relativeHeight="\d+"/);
  assert.doesNotMatch(xml, /relativeHeight="-/);
});
