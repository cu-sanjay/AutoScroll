// Auto Scroll - Background Service Worker

let tabStates = {};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'STATUS_UPDATE') {
    const tabId = sender.tab?.id;
    if (tabId) {
      tabStates[tabId] = {
        ...msg,
        timestamp: Date.now(),
      };
      // Update extension icon badge
      updateBadge(tabId, msg.status);
    }
  }
  return true;
});

function updateBadge(tabId, status) {
  if (status === 'scrolling') {
    chrome.action.setBadgeText({ text: '▶', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#000000', tabId }).catch(() => {});
  } else if (status === 'paused') {
    chrome.action.setBadgeText({ text: '⏸', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#555555', tabId }).catch(() => {});
  } else if (status === 'waiting') {
    chrome.action.setBadgeText({ text: '⋯', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#333333', tabId }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
}

// Clean up state when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStates[tabId];
});

// Inject content script on demand if not already present
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (e) {
    // Already injected or restricted page — ignore
  }
});
