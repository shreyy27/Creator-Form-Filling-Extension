/**
 * content.js — Creator Autofill
 *
 * This script is injected into Google Forms pages. Its primary role is to
 * listen for messages from popup.js (via chrome.runtime.onMessage) so that
 * future iterations can trigger fills without re-injecting the function.
 *
 * The core autofill logic lives in popup.js (runAutofill), injected via
 * chrome.scripting.executeScript so it has direct access to chrome.storage
 * data passed as arguments — avoiding the async messaging overhead.
 *
 * This file adds:
 *  1. A MutationObserver to re-enable the popup button when the form
 *     DOM is dynamically updated (multi-page forms).
 *  2. A runtime message listener for optional future direct-messaging.
 */

(function () {
  'use strict';

  // Notify popup that this is a valid Google Form page
  chrome.runtime.sendMessage({ type: 'FORM_READY', url: location.href });

  // ── Optional: listen for direct fill messages (future use) ──────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ ok: true, url: location.href });
    }
    return false;
  });

  // ── Observe DOM changes for multi-page / conditional forms ───────────────
  // When a Google Form navigates to the next page, the DOM is replaced.
  // This notifies the extension so it knows the form is still active.
  const observer = new MutationObserver(() => {
    chrome.runtime.sendMessage({ type: 'FORM_UPDATED', url: location.href }).catch(() => {
      // Popup may be closed; safe to ignore
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree:   true,
  });

  // Disconnect on unload to be clean
  window.addEventListener('unload', () => observer.disconnect());
})();
