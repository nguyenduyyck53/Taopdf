"use client";

import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  Files,
  GripVertical,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  ShieldCheck,
  Trash2,
  Undo2,
  UploadCloud,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import {
  PAGE_SIZES,
  buildPdf,
  parseSplitRanges,
  splitPdfToZip,
} from "@/lib/pdf-engine";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SourceFile = {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
  color: string;
};

type SourcePage = {
  id: string;
  kind: "source";
  sourceId: string;
  sourceName: string;
  sourcePageIndex: number;
  width: number;
  height: number;
  rotation: number;
};

type BlankPage = {
  id: string;
  kind: "blank";
  sourceName: string;
  width: number;
  height: number;
  background: string;
  rotation: number;
};

type ProjectPage = SourcePage | BlankPage;
type Toast = { type: "success" | "error"; message: string } | null;

const SOURCE_COLORS = ["#2d6a5a", "#d97745", "#496d9b", "#8a5a8f", "#8a793f"];
const DEFAULT_FILE_NAME = "tai-lieu-moi";

let pdfJsLoader: Promise<typeof import("pdfjs-dist/build/pdf.mjs")> | null = null;

function getPdfJs() {
  if (!pdfJsLoader) {
    pdfJsLoader = import("pdfjs-dist/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
  }
  return pdfJsLoader;
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function safeFileName(name: string) {
  const cleaned = name
    .trim()
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return cleaned || DEFAULT_FILE_NAME;
}

function downloadBytes(bytes: Uint8Array, fileName: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PageThumbnail({
  item,
  index,
  selected,
  dragging,
  sourceColor,
  onSelect,
  onDelete,
  onRotate,
  onMove,
  onDragStart,
  onDrop,
  getRenderDocument,
}: {
  item: ProjectPage;
  index: number;
  selected: boolean;
  dragging: boolean;
  sourceColor: string;
  onSelect: (extend: boolean) => void;
  onDelete: () => void;
  onRotate: (angle: number) => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDrop: () => void;
  getRenderDocument: (sourceId: string) => Promise<PDFDocumentProxy>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "error">(
    item.kind === "blank" ? "ready" : "loading",
  );

  useEffect(() => {
    if (item.kind === "blank") return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    async function renderPreview() {
      setPreviewState("loading");
      try {
        const document = await getRenderDocument(item.sourceId);
        const page = await document.getPage(item.sourcePageIndex + 1);
        if (cancelled || !canvasRef.current) return;

        const rotation = ((page.rotate + item.rotation) % 360 + 360) % 360;
        const naturalViewport = page.getViewport({ scale: 1, rotation });
        const cssScale = Math.min(184 / naturalViewport.width, 238 / naturalViewport.height);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: cssScale * pixelRatio, rotation });
        const canvas = canvasRef.current;
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));
        canvas.style.width = `${Math.floor(renderViewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.floor(renderViewport.height / pixelRatio)}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Không thể tạo bản xem trước.");
        renderTask = page.render({ canvas, canvasContext: context, viewport: renderViewport });
        await renderTask.promise;
        if (!cancelled) setPreviewState("ready");
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setPreviewState("error");
        }
      }
    }

    void renderPreview();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [getRenderDocument, item]);

  const isLandscape = (item.rotation / 90) % 2 !== 0
    ? item.height > item.width
    : item.width > item.height;

  return (
    <article
      className={`page-card ${selected ? "is-selected" : ""} ${dragging ? "is-dragging" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <button
        className="page-select-surface"
        type="button"
        aria-label={`Chọn trang ${index + 1}`}
        aria-pressed={selected}
        onClick={(event) => onSelect(event.shiftKey)}
      >
        <span className="selection-check" aria-hidden="true">
          {selected ? <Check size={14} strokeWidth={3} /> : index + 1}
        </span>
        <span className="page-grip" aria-hidden="true"><GripVertical size={16} /></span>
        <span
          className={`page-paper ${isLandscape ? "is-landscape" : ""}`}
          style={{ borderTopColor: sourceColor }}
        >
          {item.kind === "source" ? (
            <>
              <canvas ref={canvasRef} className={previewState === "ready" ? "is-ready" : ""} />
              {previewState === "loading" && (
                <span className="preview-loader"><LoaderCircle size={20} /></span>
              )}
              {previewState === "error" && <span className="preview-error">Không thể xem trước</span>}
            </>
          ) : (
            <span className="blank-preview" style={{ background: item.background }}>
              <Plus size={20} />
              <small>Trang trắng</small>
            </span>
          )}
        </span>
      </button>

      <div className="page-meta">
        <div>
          <strong>Trang {index + 1}</strong>
          <span title={item.sourceName}>
            {item.kind === "source" ? `${item.sourceName} · ${item.sourcePageIndex + 1}` : item.sourceName}
          </span>
        </div>
        <div className="page-actions" aria-label={`Thao tác trang ${index + 1}`}>
          <button type="button" onClick={() => onMove(-1)} title="Đưa sang trái" aria-label="Đưa sang trái">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => onRotate(90)} title="Xoay phải" aria-label="Xoay phải">
            <RotateCw size={15} />
          </button>
          <button type="button" onClick={onDelete} title="Xoá trang" aria-label="Xoá trang">
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={() => onMove(1)} title="Đưa sang phải" aria-label="Đưa sang phải">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [sources, setSources] = useState<Map<string, SourceFile>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState(DEFAULT_FILE_NAME);
  const [busyMessage, setBusyMessage] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [blankDialogOpen, setBlankDialogOpen] = useState(false);
  const [blankFormat, setBlankFormat] = useState<keyof typeof PAGE_SIZES>("a4Portrait");
  const [blankCount, setBlankCount] = useState(1);
  const [blankBackground, setBlankBackground] = useState("#ffffff");
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<"every" | "ranges">("every");
  const [splitExpression, setSplitExpression] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<ProjectPage[]>([]);
  const sourcesRef = useRef<Map<string, SourceFile>>(new Map());
  const renderDocumentsRef = useRef<Map<string, Promise<PDFDocumentProxy>>>(new Map());
  const historyRef = useRef<ProjectPage[][]>([]);
  const futureRef = useRef<ProjectPage[][]>([]);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const selectedCount = selectedIds.size;
  const usedSourceIds = new Set(pages.filter((page): page is SourcePage => page.kind === "source").map((page) => page.sourceId));
  const sourceFiles = Array.from(sources.values()).filter((source) => usedSourceIds.has(source.id));
  const sourceCount = sourceFiles.length;
  const totalSize = sourceFiles.reduce((sum, file) => sum + file.size, 0);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const commitPages = useCallback((nextPages: ProjectPage[]) => {
    if (nextPages === pagesRef.current) return;
    historyRef.current.push(pagesRef.current);
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
    pagesRef.current = nextPages;
    setPages(nextPages);
    setHistoryState({ undo: historyRef.current.length, redo: 0 });
  }, []);

  const getRenderDocument = useCallback((sourceId: string) => {
    const cached = renderDocumentsRef.current.get(sourceId);
    if (cached) return cached;
    const source = sourcesRef.current.get(sourceId);
    if (!source) return Promise.reject(new Error("Không tìm thấy PDF nguồn."));
    const promise = getPdfJs().then((pdfjs) => pdfjs.getDocument({ data: source.bytes.slice() }).promise);
    renderDocumentsRef.current.set(sourceId, promise);
    return promise;
  }, []);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(pagesRef.current);
    pagesRef.current = previous;
    setPages(previous);
    setSelectedIds(new Set());
    setHistoryState({ undo: historyRef.current.length, redo: futureRef.current.length });
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(pagesRef.current);
    pagesRef.current = next;
    setPages(next);
    setSelectedIds(new Set());
    setHistoryState({ undo: historyRef.current.length, redo: futureRef.current.length });
  }, []);

  const deletePages = useCallback((ids: Set<string>) => {
    if (!ids.size) return;
    const next = pagesRef.current.filter((page) => !ids.has(page.id));
    commitPages(next);
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
    notify(`Đã xoá ${ids.size} trang.`);
  }, [commitPages, notify]);

  const rotatePages = useCallback((ids: Set<string>, angle: number) => {
    if (!ids.size) return;
    commitPages(pagesRef.current.map((page) => ids.has(page.id)
      ? { ...page, rotation: (page.rotation + angle + 360) % 360 }
      : page));
  }, [commitPages]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "Escape") {
        setBlankDialogOpen(false);
        setSplitDialogOpen(false);
        setSelectedIds(new Set());
        return;
      }
      if (isTyping) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "a" && pagesRef.current.length) {
        event.preventDefault();
        setSelectedIds(new Set(pagesRef.current.map((page) => page.id)));
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.size) {
        event.preventDefault();
        deletePages(selectedIds);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deletePages, redo, selectedIds, undo]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (!files.length) {
      notify("Vui lòng chọn file PDF hợp lệ.", "error");
      return;
    }

    setBusyMessage(files.length > 1 ? `Đang đọc ${files.length} file PDF…` : `Đang đọc ${files[0].name}…`);
    const importedPages: ProjectPage[] = [];
    const errors: string[] = [];

    try {
      for (const file of files) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const document = await PDFDocument.load(bytes, { updateMetadata: false });
          const sourceId = makeId("source");
          const pageCount = document.getPageCount();
          const color = SOURCE_COLORS[sourcesRef.current.size % SOURCE_COLORS.length];
          sourcesRef.current.set(sourceId, {
            id: sourceId,
            name: file.name,
            size: file.size,
            bytes,
            pageCount,
            color,
          });

          document.getPages().forEach((page, sourcePageIndex) => {
            const { width, height } = page.getSize();
            importedPages.push({
              id: makeId("page"),
              kind: "source",
              sourceId,
              sourceName: file.name,
              sourcePageIndex,
              width,
              height,
              rotation: 0,
            });
          });
        } catch {
          errors.push(file.name);
        }
      }

      if (importedPages.length) {
        setSources(new Map(sourcesRef.current));
        commitPages([...pagesRef.current, ...importedPages]);
        if (fileName === DEFAULT_FILE_NAME && files[0]) {
          setFileName(files[0].name.replace(/\.pdf$/i, "") || DEFAULT_FILE_NAME);
        }
        notify(`Đã thêm ${importedPages.length} trang từ ${files.length - errors.length} file.`);
      }
      if (errors.length) {
        notify(`Không thể mở: ${errors.join(", ")}. File có thể bị khoá hoặc hỏng.`, "error");
      }
    } finally {
      setBusyMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function selectPage(id: string, index: number, extend: boolean) {
    setSelectedIds((current) => {
      if (extend && lastSelectedIndexRef.current !== null) {
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        return new Set(pages.slice(start, end + 1).map((page) => page.id));
      }
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      lastSelectedIndexRef.current = index;
      return next;
    });
  }

  function movePage(id: string, direction: -1 | 1) {
    const from = pagesRef.current.findIndex((page) => page.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= pagesRef.current.length) return;
    const next = [...pagesRef.current];
    [next[from], next[to]] = [next[to], next[from]];
    commitPages(next);
  }

  function dropPage(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const next = [...pagesRef.current];
    const from = next.findIndex((page) => page.id === draggingId);
    const to = next.findIndex((page) => page.id === targetId);
    if (from >= 0 && to >= 0) {
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      commitPages(next);
    }
    setDraggingId(null);
  }

  function addBlankPages() {
    const format = PAGE_SIZES[blankFormat];
    const count = Math.min(50, Math.max(1, Number(blankCount) || 1));
    const newPages: BlankPage[] = Array.from({ length: count }, () => ({
      id: makeId("blank"),
      kind: "blank",
      sourceName: format.label,
      width: format.width,
      height: format.height,
      background: blankBackground,
      rotation: 0,
    }));
    const selectedIndices = pagesRef.current
      .map((page, index) => selectedIds.has(page.id) ? index : -1)
      .filter((index) => index >= 0);
    const insertAt = selectedIndices.length ? Math.max(...selectedIndices) + 1 : pagesRef.current.length;
    const next = [...pagesRef.current];
    next.splice(insertAt, 0, ...newPages);
    commitPages(next);
    setBlankDialogOpen(false);
    notify(`Đã thêm ${count} trang ${format.label}.`);
  }

  async function exportMergedPdf() {
    if (!pagesRef.current.length) return;
    setBusyMessage("Đang tạo file PDF hoàn chỉnh…");
    try {
      const outputName = safeFileName(fileName);
      const bytes = await buildPdf(pagesRef.current, sourcesRef.current, { title: fileName });
      downloadBytes(bytes, `${outputName}.pdf`, "application/pdf");
      notify(`Đã xuất ${pagesRef.current.length} trang thành ${outputName}.pdf.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể xuất PDF.", "error");
    } finally {
      setBusyMessage("");
    }
  }

  async function exportSplitPdf() {
    setBusyMessage("Đang đóng gói các file PDF…");
    try {
      const groups = splitMode === "every"
        ? pagesRef.current.map((_, index) => [index])
        : parseSplitRanges(splitExpression, pagesRef.current.length);
      const outputName = safeFileName(fileName);
      const bytes = await splitPdfToZip(pagesRef.current, sourcesRef.current, groups, {
        baseName: outputName,
        title: fileName,
      });
      downloadBytes(bytes, `${outputName}-da-tach.zip`, "application/zip");
      setSplitDialogOpen(false);
      notify(`Đã tách thành ${groups.length} file PDF trong một gói ZIP.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tách PDF.", "error");
    } finally {
      setBusyMessage("");
    }
  }

  function clearProject() {
    if (!window.confirm("Xoá toàn bộ tài liệu khỏi vùng làm việc? File gốc trên máy sẽ không bị ảnh hưởng.")) return;
    for (const documentPromise of renderDocumentsRef.current.values()) {
      void documentPromise.then((document) => document.destroy()).catch(() => undefined);
    }
    renderDocumentsRef.current.clear();
    sourcesRef.current.clear();
    setSources(new Map());
    historyRef.current = [];
    futureRef.current = [];
    pagesRef.current = [];
    setPages([]);
    setSelectedIds(new Set());
    setFileName(DEFAULT_FILE_NAME);
    setHistoryState({ undo: 0, redo: 0 });
  }

  const rangePreview = useMemo(() => {
    if (splitMode === "every") return pages.length ? `${pages.length} file PDF` : "0 file PDF";
    try {
      return `${parseSplitRanges(splitExpression, pages.length).length} file PDF`;
    } catch {
      return "Kiểm tra lại khoảng trang";
    }
  }, [pages.length, splitExpression, splitMode]);

  const hasHistory = historyState.undo > 0;
  const hasFuture = historyState.redo > 0;

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PDF Gọn - trang chủ">
          <span className="brand-mark" aria-hidden="true"><Files size={21} /></span>
          <span><strong>PDF Gọn</strong><small>Chỉnh PDF ngay trên máy</small></span>
        </a>
        <div className="privacy-pill"><LockKeyhole size={14} /> File không rời khỏi thiết bị</div>
        <a className="help-link" href="#huong-dan">Hướng dẫn</a>
      </header>

      <main id="top" className={pages.length ? "workspace" : "welcome-workspace"}>
        {!pages.length ? (
          <section className="welcome-panel">
            <div className="welcome-copy">
              <span className="eyebrow"><SparklesIcon /> Miễn phí · Không cần đăng nhập</span>
              <h1>Chỉnh PDF gọn gàng,<br />ngay trong trình duyệt.</h1>
              <p>Gộp nhiều file, tách theo khoảng, thêm trang, xoá hoặc sắp xếp lại — nhanh và riêng tư.</p>
              <div className="trust-row">
                <span><ShieldCheck size={17} /> Xử lý cục bộ</span>
                <span><Archive size={17} /> Không lưu file</span>
                <span><Layers3 size={17} /> Không giới hạn trang</span>
              </div>
            </div>
            <div
              className={`hero-dropzone ${isDropActive ? "is-active" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDropActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDropActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDropActive(false);
                void addFiles(event.dataTransfer.files);
              }}
            >
              <span className="upload-illustration"><UploadCloud size={30} /></span>
              <h2>Thả PDF vào đây</h2>
              <p>Kéo một hoặc nhiều file để bắt đầu</p>
              <button className="primary-button large" type="button" onClick={() => fileInputRef.current?.click()}>
                <Plus size={18} /> Chọn file PDF
              </button>
              <small>Hỗ trợ nhiều file · PDF được xử lý trên thiết bị của bạn</small>
            </div>
          </section>
        ) : (
          <div className="editor-layout">
            <section className="editor-panel">
              <div className="editor-toolbar">
                <div className="toolbar-group">
                  <button className="tool-button emphasis" type="button" onClick={() => fileInputRef.current?.click()}>
                    <FilePlus2 size={17} /> Thêm PDF
                  </button>
                  <button className="tool-button" type="button" onClick={() => setBlankDialogOpen(true)}>
                    <Plus size={17} /> Trang mới
                  </button>
                </div>
                <span className="toolbar-divider" />
                <div className="toolbar-group compact">
                  <button className="icon-tool" type="button" onClick={undo} disabled={!hasHistory} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">
                    <Undo2 size={17} />
                  </button>
                  <button className="icon-tool" type="button" onClick={redo} disabled={!hasFuture} title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại">
                    <Redo2 size={17} />
                  </button>
                </div>
                <span className="toolbar-divider hide-mobile" />
                <div className="toolbar-group selection-tools">
                  <button className="tool-button subtle" type="button" onClick={() => setSelectedIds(new Set(pages.map((page) => page.id)))}>
                    Chọn tất cả
                  </button>
                  {selectedCount > 0 && (
                    <>
                      <button className="icon-tool" type="button" onClick={() => rotatePages(selectedIds, -90)} title="Xoay trái" aria-label="Xoay trang đã chọn sang trái">
                        <RotateCcw size={17} />
                      </button>
                      <button className="icon-tool" type="button" onClick={() => rotatePages(selectedIds, 90)} title="Xoay phải" aria-label="Xoay trang đã chọn sang phải">
                        <RotateCw size={17} />
                      </button>
                      <button className="icon-tool danger" type="button" onClick={() => deletePages(selectedIds)} title="Xoá trang đã chọn" aria-label="Xoá trang đã chọn">
                        <Trash2 size={17} />
                      </button>
                    </>
                  )}
                </div>
                <div className="page-counter">
                  {selectedCount ? <strong>{selectedCount} đã chọn</strong> : <span>Giữ Shift để chọn một dải</span>}
                  <b>{pages.length} trang</b>
                </div>
              </div>

              <div
                className={`page-canvas ${isDropActive ? "is-drop-active" : ""}`}
                onDragEnter={(event) => {
                  if (event.dataTransfer.types.includes("Files")) setIsDropActive(true);
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("Files")) event.preventDefault();
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDropActive(false);
                }}
                onDrop={(event) => {
                  if (event.dataTransfer.files.length) {
                    event.preventDefault();
                    setIsDropActive(false);
                    void addFiles(event.dataTransfer.files);
                  }
                }}
              >
                {isDropActive && (
                  <div className="drop-overlay"><UploadCloud size={30} /><strong>Thả để thêm PDF</strong></div>
                )}
                <div className="page-grid">
                  {pages.map((page, index) => {
                    const sourceColor = page.kind === "source"
                      ? sources.get(page.sourceId)?.color || "#2d6a5a"
                      : "#bdc5bf";
                    return (
                      <PageThumbnail
                        key={page.id}
                        item={page}
                        index={index}
                        selected={selectedIds.has(page.id)}
                        dragging={draggingId === page.id}
                        sourceColor={sourceColor}
                        onSelect={(extend) => selectPage(page.id, index, extend)}
                        onDelete={() => deletePages(new Set([page.id]))}
                        onRotate={(angle) => rotatePages(new Set([page.id]), angle)}
                        onMove={(direction) => movePage(page.id, direction)}
                        onDragStart={() => setDraggingId(page.id)}
                        onDrop={() => dropPage(page.id)}
                        getRenderDocument={getRenderDocument}
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="export-panel">
              <div className="export-heading">
                <span className="export-icon"><Download size={19} /></span>
                <div><h2>Xuất tài liệu</h2><p>Sẵn sàng khi bạn hoàn tất.</p></div>
              </div>

              <div className="document-summary">
                <div><span>Trang</span><strong>{pages.length}</strong></div>
                <div><span>File nguồn</span><strong>{sourceCount}</strong></div>
                <div><span>Dung lượng gốc</span><strong>{formatBytes(totalSize)}</strong></div>
              </div>

              <label className="field-label" htmlFor="output-name">Tên file kết quả</label>
              <div className="file-name-field">
                <input id="output-name" value={fileName} onChange={(event) => setFileName(event.target.value)} spellCheck="false" />
                <span>.pdf</span>
              </div>

              <button className="primary-button export-button" type="button" onClick={() => void exportMergedPdf()}>
                <Download size={18} /> Tải PDF đã gộp
              </button>
              <button
                className="secondary-button split-button"
                type="button"
                onClick={() => {
                  setSplitExpression(pages.length ? `1-${pages.length}` : "");
                  setSplitDialogOpen(true);
                }}
              >
                <Scissors size={17} /> Tách thành nhiều PDF
              </button>

              <div className="privacy-card">
                <ShieldCheck size={20} />
                <div><strong>Riêng tư theo thiết kế</strong><p>Không có file nào được gửi lên máy chủ. Đóng tab là dữ liệu biến mất.</p></div>
              </div>

              <div className="source-list">
                <div className="source-list-title"><span>File đang dùng</span><button type="button" onClick={clearProject}>Xoá tất cả</button></div>
                {sourceFiles.map((source) => (
                  <div className="source-item" key={source.id}>
                    <span className="source-dot" style={{ background: source.color }} />
                    <div><strong title={source.name}>{source.name}</strong><small>{source.pageCount} trang · {formatBytes(source.size)}</small></div>
                  </div>
                ))}
                {pages.some((page) => page.kind === "blank") && (
                  <div className="source-item"><span className="source-dot blank" /><div><strong>Trang tạo mới</strong><small>Được thêm trong PDF Gọn</small></div></div>
                )}
              </div>
            </aside>
          </div>
        )}

        <section id="huong-dan" className="how-it-works">
          <div><span>01</span><strong>Chọn file</strong><p>Thả một hoặc nhiều PDF vào vùng làm việc.</p></div>
          <div><span>02</span><strong>Sắp xếp</strong><p>Kéo trang để đổi chỗ, xoay, thêm hoặc xoá.</p></div>
          <div><span>03</span><strong>Tải xuống</strong><p>Gộp thành một PDF hoặc tách thành gói ZIP.</p></div>
        </section>
      </main>

      <footer><span>PDF Gọn · Công cụ PDF riêng tư</span><span>Miễn phí, không quảng cáo, không tải file lên server.</span></footer>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(event) => event.target.files && void addFiles(event.target.files)}
      />

      {blankDialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setBlankDialogOpen(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="blank-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setBlankDialogOpen(false)} aria-label="Đóng"><X size={18} /></button>
            <span className="modal-icon"><FilePlus2 size={22} /></span>
            <h2 id="blank-dialog-title">Thêm trang mới</h2>
            <p>Trang sẽ được chèn sau vùng đang chọn, hoặc ở cuối tài liệu.</p>
            <label className="field-label" htmlFor="blank-format">Khổ giấy</label>
            <select id="blank-format" value={blankFormat} onChange={(event) => setBlankFormat(event.target.value as keyof typeof PAGE_SIZES)}>
              {Object.entries(PAGE_SIZES).map(([key, size]) => <option key={key} value={key}>{size.label}</option>)}
            </select>
            <div className="modal-field-row">
              <label><span className="field-label">Số trang</span><input type="number" min="1" max="50" value={blankCount} onChange={(event) => setBlankCount(Number(event.target.value))} /></label>
              <label><span className="field-label">Màu nền</span><span className="color-field"><input type="color" value={blankBackground} onChange={(event) => setBlankBackground(event.target.value)} /><b>{blankBackground.toUpperCase()}</b></span></label>
            </div>
            <button className="primary-button modal-primary" type="button" onClick={addBlankPages}><Plus size={18} /> Thêm vào tài liệu</button>
          </section>
        </div>
      )}

      {splitDialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSplitDialogOpen(false)}>
          <section className="modal-card split-modal" role="dialog" aria-modal="true" aria-labelledby="split-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setSplitDialogOpen(false)} aria-label="Đóng"><X size={18} /></button>
            <span className="modal-icon orange"><Scissors size={22} /></span>
            <h2 id="split-dialog-title">Tách tài liệu PDF</h2>
            <p>Các file kết quả sẽ được gom vào một gói ZIP để tải xuống một lần.</p>
            <div className="segmented-control" role="group" aria-label="Cách tách PDF">
              <button type="button" className={splitMode === "every" ? "is-active" : ""} onClick={() => setSplitMode("every")}>Mỗi trang một file</button>
              <button type="button" className={splitMode === "ranges" ? "is-active" : ""} onClick={() => setSplitMode("ranges")}>Theo khoảng trang</button>
            </div>
            {splitMode === "ranges" && (
              <label className="split-range-field">
                <span className="field-label">Các khoảng cần tách</span>
                <input value={splitExpression} onChange={(event) => setSplitExpression(event.target.value)} placeholder="Ví dụ: 1-3, 4-6, 8" autoFocus />
                <small>Mỗi khoảng cách nhau bằng dấu phẩy. Ví dụ trên tạo 3 file PDF.</small>
              </label>
            )}
            <div className="split-result"><Archive size={18} /><span>Kết quả dự kiến</span><strong>{rangePreview}</strong></div>
            <button className="primary-button modal-primary orange" type="button" onClick={() => void exportSplitPdf()}><Scissors size={18} /> Tách và tải ZIP</button>
          </section>
        </div>
      )}

      {busyMessage && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <div><LoaderCircle size={28} /><strong>{busyMessage}</strong><span>Vui lòng giữ tab này mở.</span></div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "success" ? <Check size={18} /> : <X size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

function SparklesIcon() {
  return <span className="sparkles-icon" aria-hidden="true">✦</span>;
}
