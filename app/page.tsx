"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  FileText,
  HardDrive,
  Languages,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ScanText,
  Settings2,
  ShieldCheck,
  Sigma,
  Sparkles,
  Square,
  Table2,
  UploadCloud,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  LANGUAGE_OPTIONS,
  analyzeLayout,
  createWordOutput,
  flattenTesseractLines,
  groupPdfTextItems,
  isFormulaText,
  parsePageRange,
  safeWordFileName,
  summarizePages,
} from "@/lib/ocr-word-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Phase = "empty" | "loading" | "ready" | "processing" | "done" | "error";
type LayoutMode = "precise" | "balanced" | "flow";
type OcrMode = "smart" | "always" | "text";
type PageState = "waiting" | "text" | "ocr" | "done" | "error";

type LoadedPdf = {
  file: File;
  url: string;
  pdf: PDFDocumentProxy;
  pageCount: number;
};

type PageProgress = {
  state: PageState;
  confidence?: number;
  tables?: number;
  formulas?: number;
};

type ResultFile = {
  url: string;
  blob: Blob;
  fileName: string;
  partCount: number;
  summary: ReturnType<typeof summarizePages>;
};

type Toast = { type: "success" | "error"; text: string } | null;

let pdfJsLoader: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfJs() {
  if (!pdfJsLoader) {
    pdfJsLoader = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
  }
  return pdfJsLoader;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function secondsLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "đang tính…";
  if (seconds < 60) return `khoảng ${Math.ceil(seconds)} giây`;
  const minutes = Math.ceil(seconds / 60);
  return `khoảng ${minutes} phút`;
}

function downloadResult(result: ResultFile) {
  const anchor = document.createElement("a");
  anchor.href = result.url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function renderPageToCanvas(page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>>, scale: number, maxPixels: number) {
  const base = page.getViewport({ scale: 1 });
  const limitedScale = Math.min(scale, Math.sqrt(maxPixels / Math.max(1, base.width * base.height)));
  const viewport = page.getViewport({ scale: Math.max(0.8, limitedScale) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Không thể tạo vùng ảnh để nhận diện.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { canvas, viewport };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể nén ảnh trang PDF.")), "image/jpeg", quality);
  });
}

async function makeCleanBackground(canvas: HTMLCanvasElement, lines: Array<{ words?: Array<{ bbox: { x0: number; y0: number; x1: number; y1: number } }> }>, quality: number) {
  const cleaned = document.createElement("canvas");
  cleaned.width = canvas.width;
  cleaned.height = canvas.height;
  const context = cleaned.getContext("2d", { alpha: false });
  if (!context) throw new Error("Không thể dựng nền trang Word.");
  context.drawImage(canvas, 0, 0);
  context.fillStyle = "#ffffff";
  for (const line of lines) {
    for (const word of line.words || []) {
      const width = word.bbox.x1 - word.bbox.x0;
      const height = word.bbox.y1 - word.bbox.y0;
      const padX = Math.max(1, height * 0.06);
      const padY = Math.max(1, height * 0.08);
      context.fillRect(
        Math.max(0, word.bbox.x0 - padX),
        Math.max(0, word.bbox.y0 - padY),
        Math.min(cleaned.width, width + padX * 2),
        Math.min(cleaned.height, height + padY * 2),
      );
    }
  }
  return new Uint8Array(await (await canvasBlob(cleaned, quality)).arrayBuffer());
}

function visiblePages(total: number, current: number) {
  if (total <= 80) return Array.from({ length: total }, (_, index) => index + 1);
  const values = new Set([1, 2, total - 1, total]);
  for (let page = Math.max(1, current - 14); page <= Math.min(total, current + 14); page += 1) values.add(page);
  return [...values].sort((a, b) => a - b);
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [documentFile, setDocumentFile] = useState<LoadedPdf | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageProgress, setPageProgress] = useState<Map<number, PageProgress>>(new Map());
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["vie", "eng"]);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("precise");
  const [ocrMode, setOcrMode] = useState<OcrMode>("smart");
  const [pageRange, setPageRange] = useState("Tất cả");
  const [fileName, setFileName] = useState("tai-lieu-ocr");
  const [splitEvery, setSplitEvery] = useState(0);
  const [preserveTables, setPreserveTables] = useState(true);
  const [editableFormulas, setEditableFormulas] = useState(true);
  const [largeDocumentMode, setLargeDocumentMode] = useState(true);
  const [isDropActive, setIsDropActive] = useState(false);
  const [processing, setProcessing] = useState({ done: 0, total: 0, page: 0, ocr: 0, elapsed: 0 });
  const [result, setResult] = useState<ResultFile | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const previewTaskRef = useRef<RenderTask | null>(null);
  const cancelRef = useRef(false);
  const tesseractWorkerRef = useRef<Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback((text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const resetOutput = useCallback(() => {
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    setResult(null);
  }, []);

  const closeDocument = useCallback(() => {
    cancelRef.current = true;
    void tesseractWorkerRef.current?.terminate();
    tesseractWorkerRef.current = null;
    previewTaskRef.current?.cancel();
    if (documentFile) {
      void documentFile.pdf.destroy();
      URL.revokeObjectURL(documentFile.url);
    }
    resetOutput();
    setDocumentFile(null);
    setPageProgress(new Map());
    setCurrentPage(1);
    setPhase("empty");
    setErrorMessage("");
  }, [documentFile, resetOutput]);

  useEffect(() => () => {
    previewTaskRef.current?.cancel();
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    void tesseractWorkerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (!documentFile || !previewCanvasRef.current) return;
    let cancelled = false;
    const canvas = previewCanvasRef.current;
    previewTaskRef.current?.cancel();

    async function renderPreview() {
      try {
        const page = await documentFile!.pdf.getPage(currentPage);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(320, Math.min(820, previewWrapRef.current?.clientWidth || 720) - 68);
        const cssScale = Math.min(1.2, available / base.width);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        canvas.style.width = `${Math.round(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.round(viewport.height / pixelRatio)}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        previewTaskRef.current = page.render({ canvas, canvasContext: context, viewport });
        await previewTaskRef.current.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          notify("Không thể hiển thị bản xem trước trang này.", "error");
        }
      }
    }

    void renderPreview();
    return () => {
      cancelled = true;
      previewTaskRef.current?.cancel();
    };
  }, [currentPage, documentFile, notify]);

  async function loadPdf(file: File) {
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      notify("Vui lòng chọn đúng file PDF.", "error");
      return;
    }
    if (phase === "processing") return;

    if (documentFile) {
      void documentFile.pdf.destroy();
      URL.revokeObjectURL(documentFile.url);
    }
    resetOutput();
    setPhase("loading");
    setErrorMessage("");
    setPageProgress(new Map());
    const url = URL.createObjectURL(file);

    try {
      const pdfjs = await getPdfJs();
      const pdf = await pdfjs.getDocument({ url, cMapPacked: true, useWorkerFetch: true }).promise;
      const loaded = { file, url, pdf, pageCount: pdf.numPages };
      setDocumentFile(loaded);
      setCurrentPage(1);
      setPageRange("Tất cả");
      setFileName(safeWordFileName(file.name));
      setSplitEvery(pdf.numPages > 500 ? 200 : 0);
      setPageProgress(new Map(Array.from({ length: pdf.numPages }, (_, index) => [index + 1, { state: "waiting" as PageState }])));
      setPhase("ready");
      notify(`Đã đọc ${pdf.numPages.toLocaleString("vi-VN")} trang PDF.`);
    } catch (error) {
      URL.revokeObjectURL(url);
      setPhase("empty");
      const message = error instanceof Error && /password/i.test(error.message)
        ? "PDF đang có mật khẩu. Hãy mở khóa file rồi thử lại."
        : "Không thể mở PDF. File có thể bị hỏng hoặc dùng định dạng không được hỗ trợ.";
      setErrorMessage(message);
      notify(message, "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleLanguage(code: string) {
    setSelectedLanguages((current) => {
      if (current.includes(code)) {
        if (current.length === 1) {
          notify("Cần giữ ít nhất một ngôn ngữ nhận diện.", "error");
          return current;
        }
        return current.filter((item) => item !== code);
      }
      if (current.length >= 4) {
        notify("Chọn tối đa 4 ngôn ngữ để tốc độ và độ chính xác ổn định.", "error");
        return current;
      }
      return [...current, code];
    });
  }

  async function startConversion() {
    if (!documentFile || phase === "processing") return;
    let pages: number[];
    try {
      pages = parsePageRange(pageRange, documentFile.pageCount);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Khoảng trang không hợp lệ.", "error");
      return;
    }
    if (!selectedLanguages.length) {
      notify("Hãy chọn ít nhất một ngôn ngữ OCR.", "error");
      return;
    }

    cancelRef.current = false;
    resetOutput();
    setPhase("processing");
    setErrorMessage("");
    setProcessing({ done: 0, total: pages.length, page: pages[0], ocr: 0, elapsed: 0 });
    setPageProgress((current) => {
      const next = new Map(current);
      pages.forEach((page) => next.set(page, { state: "waiting" }));
      return next;
    });

    const startedAt = performance.now();
    const pageModels: Array<Record<string, unknown>> = [];
    let activePage = pages[0];

    const ensureOcrWorker = async () => {
      if (tesseractWorkerRef.current) return tesseractWorkerRef.current;
      const tesseract = await import("tesseract.js");
      const worker = await tesseract.createWorker(selectedLanguages.join("+"), tesseract.OEM.LSTM_ONLY, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setProcessing((current) => ({ ...current, page: activePage, ocr: Math.round((message.progress || 0) * 100) }));
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      tesseractWorkerRef.current = worker;
      return worker;
    };

    try {
      for (let index = 0; index < pages.length; index += 1) {
        if (cancelRef.current) break;
        const pageNumber = pages[index];
        activePage = pageNumber;
        setCurrentPage(pageNumber);
        setProcessing((current) => ({ ...current, page: pageNumber, ocr: 0 }));

        const page = await documentFile.pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const nativeCharacterCount = textContent.items.reduce((total, item) => total + ("str" in item ? item.str.trim().length : 0), 0);
        const useNativeText = ocrMode === "text" || (ocrMode === "smart" && nativeCharacterCount >= 36);
        const isLarge = largeDocumentMode && pages.length >= 100;
        const targetScale = layoutMode === "precise" ? 2.05 : layoutMode === "balanced" ? 1.75 : 1.45;
        const maxPixels = isLarge ? 3_600_000 : layoutMode === "precise" ? 7_200_000 : 5_200_000;
        const needsBackground = layoutMode === "precise" || (!useNativeText && layoutMode === "balanced");
        let rendered: Awaited<ReturnType<typeof renderPageToCanvas>> | null = null;
        let lines: ReturnType<typeof groupPdfTextItems>;
        let confidence = 99;
        let method: "text" | "ocr" = "text";

        setPageProgress((current) => new Map(current).set(pageNumber, { state: useNativeText ? "text" : "ocr" }));

        if (useNativeText) {
          const viewport = page.getViewport({ scale: Math.max(1.2, Math.min(targetScale, 1.75)) });
          lines = groupPdfTextItems(textContent.items, viewport);
          if (needsBackground) rendered = await renderPageToCanvas(page, viewport.scale, maxPixels);
          if (rendered && Math.abs(rendered.viewport.scale - viewport.scale) > 0.01) {
            lines = groupPdfTextItems(textContent.items, rendered.viewport);
          }
        } else {
          method = "ocr";
          rendered = await renderPageToCanvas(page, targetScale, maxPixels);
          const worker = await ensureOcrWorker();
          const recognized = await worker.recognize(rendered.canvas, { rotateAuto: true }, { text: true, blocks: true });
          lines = flattenTesseractLines(recognized.data);
          confidence = Number(recognized.data.confidence || 0);
        }

        if (cancelRef.current) break;
        const viewport = rendered?.viewport || page.getViewport({ scale: Math.max(1.2, Math.min(targetScale, 1.75)) });
        const blocks = preserveTables ? analyzeLayout(lines) : lines.map((line) => ({ type: "line", line, bbox: line.bbox }));
        let background: Uint8Array | undefined;
        if (needsBackground) {
          if (!rendered) rendered = await renderPageToCanvas(page, targetScale, maxPixels);
          const jpegQuality = isLarge ? 0.56 : layoutMode === "precise" ? 0.68 : 0.61;
          background = await makeCleanBackground(rendered.canvas, lines, jpegQuality);
        }

        const model = {
          pageNumber,
          pageWidthPt: page.view[2] - page.view[0],
          pageHeightPt: page.view[3] - page.view[1],
          pixelWidth: viewport.width,
          pixelHeight: viewport.height,
          precise: layoutMode !== "flow",
          method,
          confidence,
          lines,
          blocks,
          background,
        };
        pageModels.push(model);
        const tables = blocks.filter((block) => block.type === "table").length;
        const formulas = editableFormulas ? lines.filter((line) => isFormulaText(line.text)).length : 0;
        setPageProgress((current) => new Map(current).set(pageNumber, { state: "done", confidence, tables, formulas }));
        const elapsed = (performance.now() - startedAt) / 1000;
        setProcessing({ done: index + 1, total: pages.length, page: pageNumber, ocr: 100, elapsed });
        rendered = null;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }

      if (cancelRef.current) {
        setPhase("ready");
        notify("Đã dừng. Các thay đổi chưa được xuất.", "error");
        return;
      }

      setProcessing((current) => ({ ...current, done: pages.length, ocr: 100 }));
      const output = await createWordOutput(pageModels, {
        fileName,
        title: safeWordFileName(fileName),
        splitEvery,
        formulas: editableFormulas,
        font: "Arial",
      });
      const url = URL.createObjectURL(output.blob);
      outputUrlRef.current = url;
      const summary = summarizePages(pageModels);
      setResult({ url, blob: output.blob, fileName: output.fileName, partCount: output.partCount, summary });
      setPhase("done");
      notify("Word đã sẵn sàng để tải xuống.");
    } catch (error) {
      if (cancelRef.current) {
        setPhase("ready");
        return;
      }
      const message = error instanceof Error ? error.message : "Không thể hoàn tất nhận diện.";
      setErrorMessage(message);
      setPhase("error");
      notify(message, "error");
      setPageProgress((current) => new Map(current).set(activePage, { state: "error" }));
    } finally {
      await tesseractWorkerRef.current?.terminate();
      tesseractWorkerRef.current = null;
    }
  }

  function cancelConversion() {
    cancelRef.current = true;
    void tesseractWorkerRef.current?.terminate();
    tesseractWorkerRef.current = null;
  }

  const progressPercent = processing.total ? Math.round((processing.done / processing.total) * 100) : 0;
  const remainingSeconds = processing.done > 0
    ? (processing.elapsed / processing.done) * (processing.total - processing.done)
    : 0;
  const pageNumbers = useMemo(
    () => documentFile ? visiblePages(documentFile.pageCount, currentPage) : [],
    [currentPage, documentFile],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => documentFile ? closeDocument() : window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="brand-mark"><ScanText size={22} strokeWidth={2.2} /></span>
          <span><strong>VietOCR</strong><small>PDF → Word Studio</small></span>
        </button>
        <div className="topbar-center"><LockKeyhole size={13} /> Xử lý cục bộ · File không rời thiết bị</div>
        <a className="topbar-help" href="#cach-hoat-dong">Cách hoạt động</a>
      </header>

      {phase === "empty" || phase === "loading" ? (
        <main className="landing">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={15} /> OCR chuyên cho tài liệu có cấu trúc</div>
              <h1>Biến PDF thành Word <em>thật sự</em> chỉnh sửa được.</h1>
              <p>Nhận diện tiếng Việt và đa ngôn ngữ, dựng lại bảng biểu, giữ bố cục trang và chuyển công thức sang Equation của Word.</p>
              <div className="feature-row">
                <span><Table2 size={16} /> Bảng Word thật</span>
                <span><Sigma size={16} /> Công thức OMML</span>
                <span><Layers3 size={16} /> Hàng trăm trang</span>
              </div>
              <div className="quality-note"><ShieldCheck size={18} /><div><strong>Ưu tiên tiếng Việt có dấu</strong><small>Tự dùng lớp text sẵn có; chỉ OCR những trang dạng ảnh để tăng độ chính xác.</small></div></div>
            </div>

            <div
              className={`upload-card ${isDropActive ? "is-active" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDropActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDropActive(false); }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDropActive(false);
                if (event.dataTransfer.files[0]) void loadPdf(event.dataTransfer.files[0]);
              }}
            >
              <div className="upload-grid" aria-hidden="true" />
              <div className="upload-icon">{phase === "loading" ? <LoaderCircle className="spin" size={29} /> : <UploadCloud size={29} />}</div>
              <h2>{phase === "loading" ? "Đang đọc cấu trúc PDF…" : "Thả PDF vào đây"}</h2>
              <p>{phase === "loading" ? "Vui lòng giữ trang này mở" : "hoặc chọn file từ máy tính"}</p>
              <button className="primary-button large" type="button" disabled={phase === "loading"} onClick={() => fileInputRef.current?.click()}>
                <FileText size={18} /> Chọn file PDF
              </button>
              <div className="upload-limits"><span>PDF ảnh & PDF text</span><i /> <span>Không giới hạn số trang</span></div>
            </div>
          </section>

          <section className="capability-strip" id="cach-hoat-dong">
            <article><span>01</span><div><strong>Phân loại từng trang</strong><p>Trang có text được lấy trực tiếp; trang scan mới chạy OCR.</p></div></article>
            <article><span>02</span><div><strong>Dựng cấu trúc</strong><p>Hàng, cột, đoạn văn và công thức được tạo thành đối tượng Word.</p></div></article>
            <article><span>03</span><div><strong>Xuất an toàn</strong><p>Xử lý lần lượt từng trang, có thể chia Word cho hồ sơ rất lớn.</p></div></article>
          </section>
          {errorMessage && <div className="landing-error"><AlertTriangle size={18} />{errorMessage}</div>}
        </main>
      ) : (
        <main className="studio">
          <section className="document-bar">
            <div className="document-identity">
              <span className="pdf-badge">PDF</span>
              <div><strong title={documentFile?.file.name}>{documentFile?.file.name}</strong><small>{documentFile?.pageCount.toLocaleString("vi-VN")} trang · {formatBytes(documentFile?.file.size || 0)}</small></div>
            </div>
            <div className="document-status"><span className={`status-dot ${phase}`} />{phase === "processing" ? `Đang xử lý trang ${processing.page}` : phase === "done" ? "Đã chuyển đổi xong" : phase === "error" ? "Cần kiểm tra" : "Sẵn sàng chuyển đổi"}</div>
            <button className="replace-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={phase === "processing"}><RefreshCw size={15} /> Đổi file</button>
            <button className="close-document" type="button" onClick={closeDocument} disabled={phase === "processing"} aria-label="Đóng tài liệu"><X size={17} /></button>
          </section>

          <div className="studio-grid">
            <aside className="page-sidebar">
              <div className="panel-kicker"><Layers3 size={14} /> Trang tài liệu <b>{documentFile?.pageCount}</b></div>
              <div className="page-list">
                {pageNumbers.map((page, index) => {
                  const previous = pageNumbers[index - 1];
                  const info = pageProgress.get(page);
                  return (
                    <div key={page} className="page-list-unit">
                      {previous && page - previous > 1 && <span className="page-gap">•••</span>}
                      <button className={`page-row ${currentPage === page ? "is-current" : ""}`} type="button" onClick={() => setCurrentPage(page)}>
                        <span className={`page-state ${info?.state || "waiting"}`}>{info?.state === "done" ? <Check size={11} strokeWidth={3} /> : page}</span>
                        <span><strong>Trang {page}</strong><small>{info?.state === "ocr" ? "Đang OCR…" : info?.state === "text" ? "Đọc lớp text…" : info?.state === "done" ? `${Math.round(info.confidence || 0)}% · ${info.tables || 0} bảng` : info?.state === "error" ? "Có lỗi" : "Chờ xử lý"}</small></span>
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="sidebar-legend"><span><i className="native" /> Text gốc</span><span><i className="ocr" /> OCR ảnh</span></div>
            </aside>

            <section className="preview-panel" ref={previewWrapRef}>
              <div className="preview-toolbar">
                <div><Eye size={16} /><strong>Bản gốc</strong><span>Trang {currentPage}/{documentFile?.pageCount}</span></div>
                <div className="page-nav">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} aria-label="Trang trước"><ChevronLeft size={17} /></button>
                  <label><span>Trang</span><input value={currentPage} type="number" min="1" max={documentFile?.pageCount} onChange={(event) => setCurrentPage(Math.min(documentFile?.pageCount || 1, Math.max(1, Number(event.target.value) || 1)))} /></label>
                  <button type="button" disabled={currentPage >= (documentFile?.pageCount || 1)} onClick={() => setCurrentPage((page) => Math.min(documentFile?.pageCount || 1, page + 1))} aria-label="Trang sau"><ChevronRight size={17} /></button>
                </div>
              </div>
              <div className="preview-stage">
                <div className="paper-wrap">
                  <canvas ref={previewCanvasRef} />
                  {pageProgress.get(currentPage)?.state === "done" && (
                    <div className="recognized-badge"><CheckCircle2 size={14} /> Đã nhận diện · {Math.round(pageProgress.get(currentPage)?.confidence || 0)}%</div>
                  )}
                  {phase === "processing" && processing.page === currentPage && (
                    <div className="scan-line" aria-hidden="true" />
                  )}
                </div>
              </div>
              <div className="preview-foot"><ShieldCheck size={14} /> Bản xem trước được tạo trên thiết bị của bạn.</div>
            </section>

            <aside className="settings-panel">
              <div className="settings-heading"><span><Settings2 size={18} /></span><div><h2>Thiết lập xuất Word</h2><p>Cấu hình nhận diện và bố cục</p></div></div>

              {phase === "done" && result ? (
                <div className="result-card">
                  <div className="result-check"><FileCheck2 size={28} /></div>
                  <h3>Word đã sẵn sàng</h3>
                  <p>{result.partCount > 1 ? `${result.partCount} tệp Word được đóng trong ZIP` : "Một tệp Word có thể chỉnh sửa"} · {formatBytes(result.blob.size)}</p>
                  <div className="result-stats">
                    <div><strong>{result.summary.pages}</strong><span>trang</span></div>
                    <div><strong>{result.summary.tables}</strong><span>bảng</span></div>
                    <div><strong>{result.summary.formulas}</strong><span>công thức</span></div>
                  </div>
                  <button className="download-button" type="button" onClick={() => downloadResult(result)}><Download size={18} /> Tải {result.fileName.endsWith(".zip") ? "gói Word" : "file Word"}</button>
                  <button className="start-over-button" type="button" onClick={() => setPhase("ready")}><RefreshCw size={14} /> Chuyển đổi lại với thiết lập khác</button>
                  <div className="result-note"><CheckCircle2 size={15} /><span>Bảng và Equation có thể chọn, sửa trực tiếp trong Microsoft Word.</span></div>
                </div>
              ) : (
                <div className="settings-scroll">
                  <label className="field-label" htmlFor="output-name">Tên file kết quả</label>
                  <div className="name-field"><input id="output-name" value={fileName} onChange={(event) => setFileName(event.target.value)} /><span>.{splitEvery ? "zip" : "docx"}</span></div>

                  <label className="field-label" htmlFor="page-range">Trang cần chuyển</label>
                  <div className="range-field"><input id="page-range" value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="Tất cả hoặc 1-20, 25" /><span>{documentFile?.pageCount} trang</span></div>

                  <div className="setting-section">
                    <div className="section-label"><Languages size={15} /><span>Ngôn ngữ OCR</span><small>tối đa 4</small></div>
                    <div className="language-grid">
                      {LANGUAGE_OPTIONS.map((language) => (
                        <button key={language.code} className={selectedLanguages.includes(language.code) ? "is-selected" : ""} type="button" onClick={() => toggleLanguage(language.code)} disabled={phase === "processing"}>
                          <b>{language.short}</b><span>{language.label}</span>{selectedLanguages.includes(language.code) && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="section-label"><ScanText size={15} /><span>Cách đọc PDF</span></div>
                    <div className="segmented three">
                      <button className={ocrMode === "smart" ? "is-active" : ""} type="button" onClick={() => setOcrMode("smart")}><Sparkles size={13} /> Tự động</button>
                      <button className={ocrMode === "always" ? "is-active" : ""} type="button" onClick={() => setOcrMode("always")}>Luôn OCR</button>
                      <button className={ocrMode === "text" ? "is-active" : ""} type="button" onClick={() => setOcrMode("text")}>Chỉ text</button>
                    </div>
                    <p className="setting-help">Tự động cho kết quả tốt nhất với PDF vừa có text vừa có trang scan.</p>
                  </div>

                  <div className="setting-section">
                    <div className="section-label"><Layers3 size={15} /><span>Độ bám bố cục</span></div>
                    <div className="layout-options">
                      <button className={layoutMode === "precise" ? "is-active" : ""} type="button" onClick={() => setLayoutMode("precise")}><span className="radio" /><div><strong>Bám sát bản gốc</strong><small>Giữ hình, đường kẻ và vị trí · file lớn hơn</small></div></button>
                      <button className={layoutMode === "balanced" ? "is-active" : ""} type="button" onClick={() => setLayoutMode("balanced")}><span className="radio" /><div><strong>Cân bằng</strong><small>Giữ nền cho trang scan, tối ưu dung lượng</small></div></button>
                      <button className={layoutMode === "flow" ? "is-active" : ""} type="button" onClick={() => setLayoutMode("flow")}><span className="radio" /><div><strong>Word gọn nhẹ</strong><small>Ưu tiên nội dung chảy và dễ biên tập</small></div></button>
                    </div>
                  </div>

                  <div className="toggle-list">
                    <label><span className="toggle-icon table"><Table2 size={16} /></span><span><strong>Dựng lại bảng</strong><small>Tạo hàng và ô Word thật</small></span><input type="checkbox" checked={preserveTables} onChange={(event) => setPreserveTables(event.target.checked)} /><i /></label>
                    <label><span className="toggle-icon math"><Sigma size={17} /></span><span><strong>Công thức chỉnh sửa</strong><small>Chuyển sang Word Equation (OMML)</small></span><input type="checkbox" checked={editableFormulas} onChange={(event) => setEditableFormulas(event.target.checked)} /><i /></label>
                    <label><span className="toggle-icon disk"><HardDrive size={16} /></span><span><strong>Tối ưu tài liệu lớn</strong><small>Giảm RAM, xử lý lần lượt từng trang</small></span><input type="checkbox" checked={largeDocumentMode} onChange={(event) => setLargeDocumentMode(event.target.checked)} /><i /></label>
                  </div>

                  <label className="field-label split-label" htmlFor="split-output"><FileArchive size={14} /> Chia file khi tài liệu lớn</label>
                  <select id="split-output" className="split-select" value={splitEvery} onChange={(event) => setSplitEvery(Number(event.target.value))}>
                    <option value={0}>Một file Word duy nhất</option>
                    <option value={100}>Mỗi 100 trang / tệp</option>
                    <option value={200}>Mỗi 200 trang / tệp</option>
                    <option value={500}>Mỗi 500 trang / tệp</option>
                  </select>

                  {phase === "processing" ? (
                    <div className="processing-card">
                      <div className="processing-top"><span><LoaderCircle className="spin" size={17} /> Đang dựng Word</span><strong>{progressPercent}%</strong></div>
                      <div className="progress-track"><i style={{ width: `${progressPercent}%` }} /></div>
                      <div className="processing-meta"><span>{processing.done}/{processing.total} trang</span><span>Còn {secondsLabel(remainingSeconds)}</span></div>
                      <div className="current-task"><ScanText size={15} /><div><strong>Trang {processing.page}</strong><small>{processing.ocr > 0 && processing.ocr < 100 ? `OCR ${processing.ocr}%` : "Đang phân tích bố cục…"}</small></div></div>
                      <button className="cancel-button" type="button" onClick={cancelConversion}><Square size={13} fill="currentColor" /> Dừng xử lý</button>
                    </div>
                  ) : (
                    <button className="convert-button" type="button" onClick={() => void startConversion()}><ScanText size={19} /> Nhận diện & xuất Word</button>
                  )}

                  <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Không tải tài liệu lên máy chủ</strong><small>Mô hình ngôn ngữ chỉ được tải về trình duyệt khi cần OCR.</small></span></div>
                  {phase === "error" && <div className="settings-error"><AlertTriangle size={15} />{errorMessage}</div>}
                </div>
              )}
            </aside>
          </div>
        </main>
      )}

      <footer><span>VietOCR Studio · PDF sang Word có cấu trúc</span><span>Tiếng Việt · Đa ngôn ngữ · Bảng · Công thức</span></footer>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => event.target.files?.[0] && void loadPdf(event.target.files[0])}
      />

      {toast && <div className={`toast ${toast.type}`} role="status">{toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<span>{toast.text}</span></div>}
    </div>
  );
}
