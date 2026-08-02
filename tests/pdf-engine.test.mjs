import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { buildPdf, parseSplitRanges, splitPdfToZip } from "../lib/pdf-engine.js";

async function createFixture() {
  const document = await PDFDocument.create();
  document.addPage([200, 300]);
  document.addPage([300, 200]);
  return new Uint8Array(await document.save());
}

function fixtureProject(bytes) {
  const sources = new Map([
    ["source-1", { id: "source-1", name: "nguon.pdf", bytes, pageCount: 2, size: bytes.length }],
  ]);
  const pages = [
    { id: "p2", kind: "source", sourceId: "source-1", sourceName: "nguon.pdf", sourcePageIndex: 1, width: 300, height: 200, rotation: 90 },
    { id: "blank", kind: "blank", sourceName: "A4 dọc", width: 595.28, height: 841.89, background: "#fffdf8", rotation: 0 },
    { id: "p1", kind: "source", sourceId: "source-1", sourceName: "nguon.pdf", sourcePageIndex: 0, width: 200, height: 300, rotation: 0 },
  ];
  return { sources, pages };
}

test("validates and expands split ranges", () => {
  assert.deepEqual(parseSplitRanges("1-3, 5; 7-8", 8), [[0, 1, 2], [4], [6, 7]]);
  assert.throws(() => parseSplitRanges("3-1", 5), /phải nằm trong/);
  assert.throws(() => parseSplitRanges("1-6", 5), /phải nằm trong/);
  assert.throws(() => parseSplitRanges("một", 5), /không hợp lệ/);
});

test("merges reordered source pages, adds a blank page, and preserves rotation", async () => {
  const bytes = await createFixture();
  const { sources, pages } = fixtureProject(bytes);
  const output = await buildPdf(pages, sources, { title: "Bản kiểm thử" });
  const document = await PDFDocument.load(output);

  assert.equal(document.getPageCount(), 3);
  assert.equal(document.getPage(0).getRotation().angle, 90);
  assert.equal(Math.round(document.getPage(1).getWidth()), 595);
  assert.equal(document.getTitle(), "Bản kiểm thử");
});

test("splits selected ranges into readable PDFs inside a ZIP", async () => {
  const bytes = await createFixture();
  const { sources, pages } = fixtureProject(bytes);
  const groups = parseSplitRanges("1-2, 3", pages.length);
  const archiveBytes = await splitPdfToZip(pages, sources, groups, { baseName: "ho-so" });
  const archive = await JSZip.loadAsync(archiveBytes);
  const names = Object.keys(archive.files).sort();

  assert.deepEqual(names, ["ho-so-trang-003.pdf", "ho-so-trang-1-2.pdf"]);
  const firstPdf = await PDFDocument.load(await archive.file("ho-so-trang-1-2.pdf").async("uint8array"));
  const secondPdf = await PDFDocument.load(await archive.file("ho-so-trang-003.pdf").async("uint8array"));
  assert.equal(firstPdf.getPageCount(), 2);
  assert.equal(secondPdf.getPageCount(), 1);
});
