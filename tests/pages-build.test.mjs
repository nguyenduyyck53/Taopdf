import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../pages-dist/", import.meta.url);

test("builds a GitHub Pages artifact with the repository base path", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /<html[^>]+lang="vi"/i);
  assert.match(html, /PDF Gọn - Gộp, tách và chỉnh sửa PDF miễn phí/);
  assert.match(html, /(?:src|href)="\/Taopdf\/assets\//);
  assert.match(html, /https:\/\/nguyenduyyck53\.github\.io\/Taopdf\/og\.png/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);

  await access(new URL("og.png", outputRoot));
  const assets = await readdir(new URL("assets/", outputRoot));
  assert.ok(assets.some((file) => file.endsWith(".js")), "expected a JavaScript bundle");
  assert.ok(assets.some((file) => file.endsWith(".css")), "expected a CSS bundle");
});
