// ── Field map: storage key → DOM input id ──────────────────────────────────
const FIELDS = {
  name:      'f-name',
  email:     'f-email',
  phone:     'f-phone',
  address:   'f-address',
  instagram: 'f-instagram',
  followers: 'f-followers',
  niche:     'f-niche',
  mediakit:  'f-mediakit',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function showToast(id, type, message, durationMs = 2800) {
  const el = document.getElementById(id);
  el.className = `toast ${type}`;
  el.textContent = message;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.className = 'toast';
    el.textContent = '';
  }, durationMs);
}

// ── Load saved data into inputs ────────────────────────────────────────────
function loadData() {
  const keys = Object.keys(FIELDS);
  chrome.storage.local.get(keys, (data) => {
    for (const key of keys) {
      const el = document.getElementById(FIELDS[key]);
      if (el && data[key]) el.value = data[key];
    }
  });
}

// ── Save inputs to storage ─────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', () => {
  const payload = {};
  let hasAny = false;

  for (const [key, inputId] of Object.entries(FIELDS)) {
    const val = document.getElementById(inputId).value.trim();
    if (val) { payload[key] = val; hasAny = true; }
  }

  if (!hasAny) {
    showToast('save-toast', 'error', 'Fill in at least one field before saving.');
    return;
  }

  chrome.storage.local.set(payload, () => {
    showToast('save-toast', 'success', '✓ Details saved successfully.');
  });
});

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ── Check if current tab is a Google Form ─────────────────────────────────
async function checkCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hint = document.getElementById('status-hint');
  const btn  = document.getElementById('btn-autofill');

  if (tab && tab.url && tab.url.includes('docs.google.com/forms')) {
    hint.textContent = `Ready — ${tab.title.split(' -')[0].trim()}`;
    hint.style.color = 'var(--success)';
    btn.disabled = false;
  } else {
    hint.textContent = 'Navigate to a Google Form first';
    hint.style.color = '';
    btn.disabled = true;
  }
}

// ── Trigger content script ─────────────────────────────────────────────────
document.getElementById('btn-autofill').addEventListener('click', async () => {
  const keys = Object.keys(FIELDS);
  chrome.storage.local.get(keys, async (data) => {
    const hasData = keys.some(k => data[k]);
    if (!hasData) {
      showToast('fill-toast', 'error', 'Save your details on the Profile tab first.');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runAutofill,
        args: [data],
      });

      const { filled, skipped } = result.result ?? { filled: 0, skipped: 0 };

      if (filled === 0) {
        showToast('fill-toast', 'error', `No matching fields found. Check keyword list.`);
      } else {
        const msg = skipped > 0
          ? `✓ Filled ${filled} field${filled !== 1 ? 's' : ''} (${skipped} already had values)`
          : `✓ Filled ${filled} field${filled !== 1 ? 's' : ''} successfully`;
        showToast('fill-toast', 'success', msg, 4000);
      }
    } catch (err) {
      showToast('fill-toast', 'error', 'Could not run on this page. Reload the form and try again.');
      console.error('[CreatorAutofill] Error:', err);
    }
  });
});

// ── The autofill function injected into the page ───────────────────────────
// NOTE: This function runs in the page's context — no closure access.
function runAutofill(data) {
  // ── Keyword → storage key mapping ────────────────────────────────────────
  const KEYWORD_MAP = [
    { key: 'name',      words: ['full name', 'your name', 'name'] },
    { key: 'email',     words: ['email', 'e-mail', 'mail id'] },
    { key: 'phone',     words: ['phone', 'mobile', 'contact number', 'whatsapp', 'cell'] },
    { key: 'address',   words: ['address', 'shipping', 'deliver', 'postal', 'location'] },
    { key: 'instagram', words: ['instagram', 'insta link', 'ig link', 'ig handle', 'instagram link', 'instagram url', 'social media link', 'profile link', 'handle'] },
    { key: 'followers', words: ['follower count', 'follower', 'audience size', 'reach', 'subscriber'] },
    { key: 'niche',     words: ['niche', 'content category', 'content type', 'genre', 'category'] },
    { key: 'mediakit',  words: ['media kit', 'mediakit', 'portfolio', 'kit link'] },
  ];

  // ── Simulate native React/Angular-compatible input event ─────────────────
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown',  { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup',    { bubbles: true }));
  }

  // ── Get the question text from a container ────────────────────────────────
  function getLabelText(container) {
    // Google Forms uses several different structures across versions
    const LABEL_SELECTORS = [
      '[role="heading"] span',
      '[role="heading"]',
      '.freebirdFormviewerComponentsQuestionBaseTitle',
      '.M7eMe',          // older Forms class
      '.HoXoMd',         // alt class
      'label',
    ];
    for (const sel of LABEL_SELECTORS) {
      const el = container.querySelector(sel);
      if (el?.textContent?.trim()) {
        return el.textContent.trim().toLowerCase();
      }
    }
    // Fallback: aria-label on the input itself
    const input = container.querySelector('input, textarea');
    if (input) {
      const ariaLabel = input.getAttribute('aria-label') || '';
      if (ariaLabel) return ariaLabel.toLowerCase();

      // aria-labelledby: find the element and read its text
      const labelledBy = input.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent.trim().toLowerCase();
      }
    }
    return '';
  }

  // ── Get the fillable input from a container ───────────────────────────────
  function getInput(container) {
    return (
      container.querySelector('input[type="text"]') ||
      container.querySelector('input[type="email"]') ||
      container.querySelector('input[type="tel"]') ||
      container.querySelector('input:not([type="submit"]):not([type="hidden"]):not([type="radio"]):not([type="checkbox"])') ||
      container.querySelector('textarea')
    );
  }

  // ── Find all question containers ──────────────────────────────────────────
  function getQuestionContainers() {
    const CONTAINER_SELECTORS = [
      '[role="listitem"]',
      '.freebirdFormviewerComponentsQuestionBaseRoot',
      '.geS5n',
      '.Qr7Oae',
    ];
    for (const sel of CONTAINER_SELECTORS) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }
    // Fallback: any div containing a visible input
    return Array.from(document.querySelectorAll('div'))
      .filter(div => div.querySelector('input[type="text"], textarea'));
  }

  // ── Match a label string to a data key ────────────────────────────────────
  function matchKey(labelText) {
    // Sort by word length descending so longer/more-specific phrases match first
    const sorted = [...KEYWORD_MAP].sort((a, b) => {
      const maxA = Math.max(...a.words.map(w => w.length));
      const maxB = Math.max(...b.words.map(w => w.length));
      return maxB - maxA;
    });
    for (const { key, words } of sorted) {
      if (words.some(word => labelText.includes(word))) {
        return key;
      }
    }
    return null;
  }

  // ── Main fill loop ─────────────────────────────────────────────────────────
  let filled  = 0;
  let skipped = 0;

  const containers = getQuestionContainers();

  for (const container of containers) {
    const labelText = getLabelText(container);
    if (!labelText) continue;

    const key = matchKey(labelText);
    if (!key || !data[key]) continue;

    const input = getInput(container);
    if (!input) continue;

    if (input.value?.trim()) {
      skipped++;
      continue; // Don't overwrite fields the user already filled
    }

    input.focus();
    setNativeValue(input, data[key]);
    input.blur();
    filled++;
  }

  return { filled, skipped };
}

// ── Init ───────────────────────────────────────────────────────────────────
loadData();
checkCurrentTab();
