let popup = null;
let debounceTimer = null;

document.addEventListener('mouseup', (e) => {
  // Don't trigger inside our own popup
  if (popup && popup.contains(e.target)) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => handleSelection(e), 300);
});

// Close popup when clicking outside
document.addEventListener('mousedown', (e) => {
  if (popup && !popup.contains(e.target)) {
    removePopup();
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') removePopup();
});

function handleSelection(e) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  removePopup();

  // Only proceed for 1–60 character selections (word or short phrase)
  if (!selectedText || selectedText.length < 1 || selectedText.length > 60) return;
  // Skip if it's just numbers or punctuation
  if (!/[a-zA-Z]/.test(selectedText)) return;

  const context = getSurroundingContext(selection);
  const rect = selection.getRangeAt(0).getBoundingClientRect();

  createPopup(selectedText, context, rect);
}

function getSurroundingContext(selection) {
  try {
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return '';

    const nodeText = node.textContent || '';

    // For regular webpages: the text node is large enough on its own
    if (nodeText.length > 60) {
      const start = Math.max(0, range.startOffset - 120);
      const end = Math.min(nodeText.length, range.endOffset + 120);
      return nodeText.slice(start, end).trim();
    }

    // For PDF text layers: text is split across many small <span> elements.
    // Walk sibling spans within the same parent (textLayer div) to gather context.
    const parent = node.parentElement?.parentElement; // textLayer div
    if (!parent) return nodeText;

    const spans = Array.from(parent.querySelectorAll('span'));
    const texts = spans.map((s) => s.textContent || '').join(' ');
    const selectedText = selection.toString().trim();
    const idx = texts.indexOf(selectedText);

    if (idx === -1) return texts.slice(0, 200).trim();

    const start = Math.max(0, idx - 120);
    const end = Math.min(texts.length, idx + selectedText.length + 120);
    return texts.slice(start, end).trim();
  } catch {
    return '';
  }
}

function createPopup(word, context, rect) {
  popup = document.createElement('div');
  popup.id = 'wordlens-popup';
  popup.setAttribute('role', 'tooltip');
  popup.innerHTML = `
    <div class="wl-header">
      <span class="wl-word">${escapeHtml(word)}</span>
      <button class="wl-close" title="Close">&#x2715;</button>
    </div>
    <div class="wl-body">
      <div class="wl-loading">
        <span class="wl-spinner"></span>
        <span>Looking up...</span>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  positionPopup(rect);

  popup.querySelector('.wl-close').addEventListener('click', removePopup);

  // Request definition from background
  chrome.runtime.sendMessage({ type: 'DEFINE', word, context }, (response) => {
    if (!popup) return;

    const body = popup.querySelector('.wl-body');
    if (chrome.runtime.lastError || !response || !response.definition) {
      body.innerHTML = `<p class="wl-error">Could not fetch definition. Check your connection.</p>`;
      return;
    }

    body.innerHTML = `<p class="wl-definition">${escapeHtml(response.definition)}</p>`;
  });
}

function positionPopup(rect) {
  const POPUP_WIDTH = 300;
  const OFFSET = 10;

  let top = rect.bottom + window.scrollY + OFFSET;
  let left = rect.left + window.scrollX;

  // Prevent overflow on the right
  if (left + POPUP_WIDTH + 16 > window.innerWidth) {
    left = window.innerWidth - POPUP_WIDTH - 16;
  }

  // Prevent overflow on the left
  if (left < 8) left = 8;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

function removePopup() {
  if (popup) {
    popup.remove();
    popup = null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
