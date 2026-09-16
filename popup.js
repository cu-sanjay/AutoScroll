// Auto Scroll - Popup JS

(function () {
  'use strict';

  // ── State ──────────────────────────────────────
  let state = {
    active: false,
    paused: false,
    speed: 3,
    direction: 'down',
    status: 'stopped',
    scrollY: 0,
    maxScroll: 0,
    totalScrolled: 0,
    elapsed: 0,
    tabId: null,
    hostname: '',
  };

  let timerInterval = null;
  let elapsedBase = 0;
  let elapsedStart = null;

  // ── DOM refs ───────────────────────────────────
  const btnToggle = document.getElementById('btnToggle');
  const btnIcon = document.getElementById('btnIcon');
  const btnLabel = document.getElementById('btnLabel');
  const btnDown = document.getElementById('btnDown');
  const btnUp = document.getElementById('btnUp');
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusTime = document.getElementById('statusTime');
  const progressFill = document.getElementById('progressFill');
  const scrollPct = document.getElementById('scrollPct');
  const scrollPos = document.getElementById('scrollPos');
  const statScrolled = document.getElementById('statScrolled');
  const statTime = document.getElementById('statTime');
  const statSite = document.getElementById('statSite');
  const themeToggle = document.getElementById('themeToggle');
  const iconSun = document.getElementById('iconSun');
  const iconMoon = document.getElementById('iconMoon');
  const presetBtns = document.querySelectorAll('.preset-btn');

  // ── Theme ──────────────────────────────────────
  function applyTheme(theme) {
    document.body.className = theme;
    if (theme === 'dark') {
      iconSun.classList.remove('hidden');
      iconMoon.classList.add('hidden');
    } else {
      iconSun.classList.add('hidden');
      iconMoon.classList.remove('hidden');
    }
    chrome.storage.local.set({ theme });
  }

  themeToggle.addEventListener('click', () => {
    const current = document.body.classList.contains('dark') ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ── UI update ──────────────────────────────────
  function updateUI() {
    // Button state
    if (state.active && !state.paused) {
      btnToggle.className = 'btn-main active';
      btnIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      btnLabel.textContent = 'STOP';
    } else if (state.paused) {
      btnToggle.className = 'btn-main paused';
      btnIcon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
      btnLabel.textContent = 'RESUME';
    } else {
      btnToggle.className = 'btn-main';
      btnIcon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
      btnLabel.textContent = 'START';
    }

    // Status dot & text
    const s = state.status;
    statusDot.className = 'status-dot';
    statusText.className = 'status-text';

    if (s === 'scrolling') {
      statusDot.classList.add('active');
      statusText.classList.add('active');
      statusText.textContent = 'SCROLLING';
    } else if (s === 'paused') {
      statusDot.classList.add('paused');
      statusText.classList.add('paused');
      statusText.textContent = 'PAUSED';
    } else if (s === 'waiting') {
      statusDot.classList.add('waiting');
      statusText.classList.add('waiting');
      statusText.textContent = 'LOADING…';
    } else if (s === 'done') {
      statusDot.classList.add('done');
      statusText.classList.add('done');
      statusText.textContent = 'COMPLETE';
    } else {
      statusText.textContent = 'READY';
    }

    // Progress
    const pct = state.maxScroll > 0 ? Math.min(100, (state.scrollY / state.maxScroll) * 100) : 0;
    progressFill.style.width = pct.toFixed(1) + '%';
    scrollPct.textContent = pct.toFixed(0) + '%';
    scrollPos.textContent = formatPx(state.scrollY);

    // Stats
    statScrolled.textContent = formatPx(state.totalScrolled);
    statSite.textContent = state.hostname ? state.hostname.replace('www.', '').slice(0, 12) : '—';

    // Speed
    speedVal.textContent = state.speed;
    speedSlider.value = state.speed;
  }

  function formatPx(px) {
    if (px >= 10000) return (px / 1000).toFixed(1) + 'k';
    return Math.round(px) + 'px';
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return m + 'm' + (rs > 0 ? rs + 's' : '');
  }

  // ── Timer ──────────────────────────────────────
  function startTimer() {
    elapsedStart = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (state.active && !state.paused) {
        const total = elapsedBase + (Date.now() - elapsedStart);
        statTime.textContent = formatTime(total);
        statusTime.textContent = formatTime(total);
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function resetTimer() {
    elapsedBase = 0;
    elapsedStart = null;
    statTime.textContent = '0s';
    statusTime.textContent = '';
    stopTimer();
  }

  // ── Message to content ─────────────────────────
  function sendToContent(msg, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      state.tabId = tabs[0].id;
      try {
        chrome.tabs.sendMessage(tabs[0].id, msg, (resp) => {
          if (chrome.runtime.lastError) {
            // Content script might not be loaded — try injecting
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['content.js'],
            }, () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabs[0].id, msg, callback || (() => {}));
              }, 300);
            });
            return;
          }
          if (callback) callback(resp);
        });
      } catch (e) {}
    });
  }

  function getStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      state.tabId = tabs[0].id;
      // Get hostname
      try {
        const url = new URL(tabs[0].url);
        state.hostname = url.hostname;
      } catch (e) {}

      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (resp) => {
        if (chrome.runtime.lastError || !resp) return;
        state.active = resp.active;
        state.paused = resp.paused;
        state.speed = resp.speed;
        state.direction = resp.direction;
        state.scrollY = resp.scrollY;
        state.maxScroll = resp.maxScroll;
        state.totalScrolled = resp.totalScrolled;
        if (resp.active && !resp.paused) {
          state.status = 'scrolling';
        } else if (resp.paused) {
          state.status = 'paused';
        } else {
          state.status = 'stopped';
        }
        updateUI();
      });
    });
  }

  // ── Button handlers ────────────────────────────
  btnToggle.addEventListener('click', () => {
    if (!state.active) {
      // Start
      state.active = true;
      state.paused = false;
      state.status = 'scrolling';
      sendToContent({
        type: 'START',
        options: { speed: state.speed, direction: state.direction }
      });
      resetTimer();
      startTimer();
      chrome.storage.local.set({ lastSpeed: state.speed, lastDirection: state.direction });
    } else if (state.paused) {
      // Resume
      state.paused = false;
      state.status = 'scrolling';
      sendToContent({ type: 'RESUME' });
      elapsedStart = Date.now();
      startTimer();
    } else {
      // Stop
      state.active = false;
      state.paused = false;
      state.status = 'stopped';
      sendToContent({ type: 'STOP' });
      stopTimer();
    }
    updateUI();
  });

  // Direction
  [btnDown, btnUp].forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir;
      state.direction = dir;
      btnDown.classList.toggle('active', dir === 'down');
      btnUp.classList.toggle('active', dir === 'up');
      if (state.active) {
        sendToContent({ type: 'STOP' });
        sendToContent({ type: 'START', options: { speed: state.speed, direction: dir } });
      }
    });
  });

  // Speed slider
  speedSlider.addEventListener('input', (e) => {
    state.speed = parseInt(e.target.value);
    speedVal.textContent = state.speed;
    // Update preset active state
    presetBtns.forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.speed) === state.speed);
    });
    sendToContent({ type: 'SET_SPEED', speed: state.speed });
  });

  // Preset buttons
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.speed = parseInt(btn.dataset.speed);
      speedSlider.value = state.speed;
      speedVal.textContent = state.speed;
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sendToContent({ type: 'SET_SPEED', speed: state.speed });
    });
  });

  // ── Listen for status updates ──────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATUS_UPDATE') {
      state.status = msg.status;
      state.scrollY = msg.scrollY || state.scrollY;
      state.maxScroll = msg.maxScroll || state.maxScroll;
      state.totalScrolled = msg.totalScrolled || state.totalScrolled;

      if (msg.status === 'done' || msg.status === 'stopped') {
        state.active = false;
        state.paused = false;
        stopTimer();
      } else if (msg.status === 'paused') {
        state.paused = true;
        if (elapsedStart) {
          elapsedBase += Date.now() - elapsedStart;
          elapsedStart = null;
        }
        stopTimer();
      } else if (msg.status === 'scrolling') {
        state.active = true;
        state.paused = false;
      }
      updateUI();
    }
  });

  // ── Init ───────────────────────────────────────
  function init() {
    // Load saved prefs
    chrome.storage.local.get(['theme', 'lastSpeed', 'lastDirection'], (data) => {
      applyTheme(data.theme || 'dark');

      if (data.lastSpeed) {
        state.speed = data.lastSpeed;
        speedSlider.value = state.speed;
        speedVal.textContent = state.speed;
      }

      if (data.lastDirection) {
        state.direction = data.lastDirection;
        btnDown.classList.toggle('active', state.direction === 'down');
        btnUp.classList.toggle('active', state.direction === 'up');
      }

      // Set default active preset
      presetBtns.forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.speed) === state.speed);
      });

      // Get current tab status
      getStatus();
      updateUI();
    });
  }

  init();
})();
