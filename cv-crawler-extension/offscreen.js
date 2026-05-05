chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXPORT_DOWNLOAD') {
    try {
      const blob = new Blob([message.content], { type: message.mimeType });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: message.filename,
        saveAs: true
      }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, filename: message.filename });
        }
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      });
      return true;
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  }
});
