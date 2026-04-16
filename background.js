// config.js is generated from .env by running: node build.js
importScripts('config.js');
const GROQ_API_KEY = WORDLENS_CONFIG.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ─── PDF Interception ─────────────────────────────────────────────────────────
// Register the redirect rule every time the service worker starts (not just on
// install) so reloading the extension in chrome://extensions keeps it active.

async function registerPdfRedirectRule() {
  const viewerBase = chrome.runtime.getURL('viewer.html');

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: `${viewerBase}?url=\\0`,
          },
        },
        condition: {
          // Match http/https URLs ending in .pdf (with optional query string)
          regexFilter: '^https?://.*\\.pdf(\\?[^#]*)?$',
          resourceTypes: ['main_frame'],
        },
      },
    ],
  });
}

registerPdfRedirectRule();

// ─── Word Definition ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DEFINE') {
    getDefinition(message.word, message.context)
      .then((definition) => sendResponse({ definition }))
      .catch((err) => {
        console.error('WordLens error:', err);
        sendResponse({ definition: null });
      });
    return true; // keep channel open for async response
  }
});

async function getDefinition(word, context) {
  const userPrompt = context
    ? `I am reading and selected the word or phrase: "${word}"\n\nHere is the surrounding text:\n"${context}"\n\nWhat does "${word}" mean here? Explain in 1-2 simple, clear sentences.`
    : `What does "${word}" mean? Explain in 1-2 simple, clear sentences.`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful reading assistant. When given a word or phrase and its context, explain its meaning in 1-2 short, simple sentences. Give the explanation directly without any label or prefix.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 120,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
