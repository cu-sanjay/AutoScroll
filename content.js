// Auto Scroll - Content Script
// Human-like, adaptive smooth scrolling engine

(function () {
  'use strict';

  let scrollState = {
    active: false,
    paused: false,
    speed: 3, // 1-10 scale
    direction: 'down',
    animationId: null,
    lastScrollY: 0,
    lastScrollTime: 0,
    stallTimer: null,
    waitingForLoad: false,
    targetElement: null,
    totalScrolled: 0,
    sessionStart: null,
  };

  // Easing function: smooth deceleration like human scroll
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Map speed 1-10 to pixels per frame (60fps)
  function speedToPxPerFrame(speed) {
    const map = {
      1: 0.8,
      2: 1.5,
      3: 2.5,
      4: 4,
      5: 6,
      6: 9,
      7: 13,
      8: 18,
      9: 25,
      10: 35,
    };
    return map[speed] || 2.5;
  }

  // Get the primary scrollable element on page
  function getScrollTarget() {
    // ChatGPT history sidebar
    if (window.location.hostname.includes('chatgpt.com') || window.location.hostname.includes('chat.openai.com')) {
      const sidebar = document.querySelector('nav[aria-label="Chat history"]') ||
        document.querySelector('[data-testid="conversation-list"]') ||
        document.querySelector('nav');
      if (sidebar && sidebar.scrollHeight > sidebar.clientHeight) return sidebar;
    }

    // YouTube - find video list container
    if (window.location.hostname.includes('youtube.com')) {
      const feed = document.querySelector('ytd-browse[page-subtype="home"]') ||
        document.querySelector('#contents.ytd-rich-grid-renderer') ||
        document.querySelector('ytd-app');
      if (feed) return document.documentElement;
    }

    // Instagram
    if (window.location.hostname.includes('instagram.com')) {
      return document.documentElement;
    }

    return document.documentElement;
  }

  // Add slight human randomness to scroll amount
  function humanize(base) {
    const jitter = (Math.random() - 0.5) * base * 0.15;
    return base + jitter;
  }

  // Check if page is loading more content (infinite scroll detection)
  function isLoadingContent() {
    const loaders = document.querySelectorAll(
      '[class*="spinner"], [class*="loading"], [class*="loader"], ' +
      '[aria-label*="loading"], [data-testid*="loading"], ' +
      'ytd-continuation-item-renderer, ' +
      '[class*="Loading"], [class*="Spinner"]'
    );
    return loaders.length > 0 && Array.from(loaders).some(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  }

  // Detect stall — we scrolled but position didn't change (end of page or blocked)
  function detectStall(el) {
    const current = el === document.documentElement ? window.scrollY : el.scrollTop;
    const now = Date.now();
    if (now - scrollState.lastScrollTime > 100) {
      if (Math.abs(current - scrollState.lastScrollY) < 1) {
        return true;
      }
      scrollState.lastScrollY = current;
      scrollState.lastScrollTime = now;
    }
    return false;
  }

  // Main scroll loop
  function scrollLoop() {
    if (!scrollState.active || scrollState.paused) return;

    const el = scrollState.targetElement || getScrollTarget();
    scrollState.targetElement = el;

    const isDocEl = el === document.documentElement;
    const currentY = isDocEl ? window.scrollY : el.scrollTop;
    const maxScroll = isDocEl
      ? document.body.scrollHeight - window.innerHeight
      : el.scrollHeight - el.clientHeight;

    // Check stall
    if (detectStall(el)) {
      if (isLoadingContent()) {
        // Wait for content to load, retry in 800ms
        scrollState.waitingForLoad = true;
        scrollState.animationId = setTimeout(() => {
          scrollState.waitingForLoad = false;
          scrollState.lastScrollY = -999; // reset stall detector
          scrollLoop();
        }, 800);
        notifyStatus('waiting');
        return;
      } else {
        // Truly at end
        if (scrollState.direction === 'down' && currentY >= maxScroll - 5) {
          stopScroll();
          notifyStatus('done');
          return;
        }
        if (scrollState.direction === 'up' && currentY <= 5) {
          stopScroll();
          notifyStatus('done');
          return;
        }
      }
    }

    const pxPerFrame = speedToPxPerFrame(scrollState.speed);
    const delta = humanize(pxPerFrame) * (scrollState.direction === 'down' ? 1 : -1);

    if (isDocEl) {
      window.scrollBy({ top: delta, behavior: 'instant' });
    } else {
      el.scrollTop += delta;
    }

    scrollState.totalScrolled += Math.abs(delta);

    // Schedule next frame
    scrollState.animationId = requestAnimationFrame(scrollLoop);
    notifyStatus('scrolling');
  }

  function startScroll(options = {}) {
    if (options.speed !== undefined) scrollState.speed = options.speed;
    if (options.direction !== undefined) scrollState.direction = options.direction;

    scrollState.active = true;
    scrollState.paused = false;
    scrollState.targetElement = getScrollTarget();
    scrollState.lastScrollY = window.scrollY;
    scrollState.lastScrollTime = Date.now();
    scrollState.sessionStart = Date.now();
    scrollState.totalScrolled = 0;

    if (scrollState.animationId) {
      cancelAnimationFrame(scrollState.animationId);
      clearTimeout(scrollState.animationId);
    }

    scrollState.animationId = requestAnimationFrame(scrollLoop);
    notifyStatus('scrolling');
  }

  function stopScroll() {
    scrollState.active = false;
    scrollState.paused = false;
    if (scrollState.animationId) {
      cancelAnimationFrame(scrollState.animationId);
      clearTimeout(scrollState.animationId);
      scrollState.animationId = null;
    }
    scrollState.targetElement = null;
    notifyStatus('stopped');
  }

  function pauseScroll() {
    scrollState.paused = true;
    if (scrollState.animationId) {
      cancelAnimationFrame(scrollState.animationId);
      clearTimeout(scrollState.animationId);
      scrollState.animationId = null;
    }
    notifyStatus('paused');
  }

  function resumeScroll() {
    if (!scrollState.active) return;
    scrollState.paused = false;
    scrollState.lastScrollY = window.scrollY;
    scrollState.lastScrollTime = Date.now();
    scrollState.animationId = requestAnimationFrame(scrollLoop);
    notifyStatus('scrolling');
  }

  function notifyStatus(status) {
    try {
      chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        status,
        scrollY: window.scrollY,
        maxScroll: document.body.scrollHeight - window.innerHeight,
        totalScrolled: scrollState.totalScrolled,
        speed: scrollState.speed,
        direction: scrollState.direction,
        elapsed: scrollState.sessionStart ? Date.now() - scrollState.sessionStart : 0,
      }).catch(() => {});
    } catch (e) {}
  }

  // Stop on user manual scroll
  let userScrollTimer = null;
  window.addEventListener('wheel', () => {
    if (scrollState.active && !scrollState.paused) {
      pauseScroll();
      clearTimeout(userScrollTimer);
      userScrollTimer = setTimeout(() => {
        // auto-resume after 2s if still active
      }, 2000);
    }
  }, { passive: true });

  // Stop on key press (arrow keys, space, page up/down)
  window.addEventListener('keydown', (e) => {
    const stopKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Space', ' ', 'Home', 'End'];
    if (stopKeys.includes(e.key) && scrollState.active) {
      stopScroll();
    }
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'START':
        startScroll(msg.options || {});
        sendResponse({ ok: true });
        break;
      case 'STOP':
        stopScroll();
        sendResponse({ ok: true });
        break;
      case 'PAUSE':
        pauseScroll();
        sendResponse({ ok: true });
        break;
      case 'RESUME':
        resumeScroll();
        sendResponse({ ok: true });
        break;
      case 'SET_SPEED':
        scrollState.speed = msg.speed;
        sendResponse({ ok: true });
        break;
      case 'GET_STATUS':
        sendResponse({
          active: scrollState.active,
          paused: scrollState.paused,
          speed: scrollState.speed,
          direction: scrollState.direction,
          scrollY: window.scrollY,
          maxScroll: document.body.scrollHeight - window.innerHeight,
          totalScrolled: scrollState.totalScrolled,
          elapsed: scrollState.sessionStart ? Date.now() - scrollState.sessionStart : 0,
        });
        break;
    }
    return true;
  });
})();
