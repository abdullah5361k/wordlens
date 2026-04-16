// Set worker path to the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.min.js');

const params = new URLSearchParams(window.location.search);
const pdfUrl = params.get('url');

let pdfDoc = null;
let currentScale = 1.5;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

// ─── Init ────────────────────────────────────────────────────────────────────

if (!pdfUrl) {
  showError('No PDF URL specified.');
} else {
  document.getElementById('pdf-title').textContent = decodeURIComponent(
    pdfUrl.split('/').pop().split('?')[0] || 'document.pdf'
  );
  loadPDF(pdfUrl);
}

document.getElementById('zoom-in').addEventListener('click', () => adjustZoom(SCALE_STEP));
document.getElementById('zoom-out').addEventListener('click', () => adjustZoom(-SCALE_STEP));

// ─── PDF Loading ─────────────────────────────────────────────────────────────

async function loadPDF(url) {
  try {
    const loadingTask = pdfjsLib.getDocument({ url, cMapUrl: null, cMapPacked: true });
    pdfDoc = await loadingTask.promise;

    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('page-indicator').textContent = `1 / ${pdfDoc.numPages}`;

    await setupPages();
    setupScrollTracker();
  } catch (err) {
    showError(`Could not load PDF.\n\n${err.message}`);
  }
}

// ─── Page Setup (lazy rendering) ─────────────────────────────────────────────

async function setupPages() {
  const container = document.getElementById('pages-container');
  container.innerHTML = '';

  const pageData = [];

  // First pass: create placeholders with correct dimensions
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: currentScale });

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.pageNum = i;
    wrapper.dataset.rendered = 'false';
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    container.appendChild(wrapper);
    pageData.push({ wrapper, page });
  }

  // Second pass: observe and render lazily
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const wrapper = entry.target;
          if (wrapper.dataset.rendered === 'false') {
            wrapper.dataset.rendered = 'true';
            const idx = parseInt(wrapper.dataset.pageNum, 10) - 1;
            renderPage(pageData[idx].page, wrapper);
          }
        }
      });
    },
    { rootMargin: '300px 0px' } // pre-render 300px before entering view
  );

  pageData.forEach(({ wrapper }) => observer.observe(wrapper));
}

// ─── Page Rendering ──────────────────────────────────────────────────────────

async function renderPage(page, wrapper) {
  const viewport = page.getViewport({ scale: currentScale });

  // Canvas layer
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  // Text layer (transparent, selectable text on top of canvas)
  const textLayerDiv = document.createElement('div');
  textLayerDiv.className = 'textLayer';
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;

  wrapper.appendChild(canvas);
  wrapper.appendChild(textLayerDiv);

  // Render canvas
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Render text layer
  const textContent = await page.getTextContent();
  const renderTask = pdfjsLib.renderTextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport,
    textDivs: [],
  });

  if (renderTask && renderTask.promise) {
    await renderTask.promise;
  }
}

// ─── Zoom ────────────────────────────────────────────────────────────────────

async function adjustZoom(delta) {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + delta));
  if (newScale === currentScale) return;

  currentScale = newScale;
  document.getElementById('zoom-level').textContent = `${Math.round(currentScale * 100)}%`;

  // Re-setup all pages at new scale
  await setupPages();
  setupScrollTracker();
}

// ─── Scroll-based page indicator ─────────────────────────────────────────────

function setupScrollTracker() {
  const container = document.getElementById('viewer-container');
  const total = pdfDoc ? pdfDoc.numPages : 0;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageNum = entry.target.dataset.pageNum;
          document.getElementById('page-indicator').textContent = `${pageNum} / ${total}`;
        }
      });
    },
    { root: container, threshold: 0.3 }
  );

  document.querySelectorAll('.page-wrapper').forEach((el) => observer.observe(el));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('loading-screen').classList.add('hidden');
  const screen = document.getElementById('error-screen');
  document.getElementById('error-message').textContent = message;
  screen.classList.remove('hidden');
}
