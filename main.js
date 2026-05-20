// App Configuration & Constants
const MOOD_DATA = {
  1: { emoji: '😡', label: 'Enojado', colorClass: 'mood-1' },
  2: { emoji: '🙁', label: 'Triste', colorClass: 'mood-2' },
  3: { emoji: '😐', label: 'Neutral', colorClass: 'mood-3' },
  4: { emoji: '🙂', label: 'Bien', colorClass: 'mood-4' },
  5: { emoji: '😁', label: 'Excelente', colorClass: 'mood-5' }
};

// Dynamic Backend URL Selector
// Detects if running locally or in production. Adjust the production URL as needed.
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://diario-emociones-back.onrender.com'; // <-- REPLACE with actual backend production URL after deployment

// Global App State
let currentSelectedMood = null;
let swRegistration = null;
let isSubscribed = false;

// DOM Elements
const views = {
  select: document.getElementById('view-select'),
  diary: document.getElementById('view-diary'),
  history: document.getElementById('view-history'),
  settings: document.getElementById('view-settings')
};

const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
const toastEl = document.getElementById('app-toast');
const loadingEl = document.getElementById('loading-overlay');

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// App Initialization
function initApp() {
  checkLock();
  updateWelcomeDate();
  setupNavigation();
  setupEventListeners();
  loadLogs();
  initGoals();
  loadPushHours();
  
  // Register Service Worker and check subscription
  registerSW();
  
  // Check if we opened the app from a notification action (?mood=N)
  checkUrlParams();
  
  // Set interval to update time/date dynamically
  setInterval(updateWelcomeDate, 60000);
}

// 1. Welcome Date Handler
function updateWelcomeDate() {
  const dateEl = document.getElementById('welcome-date');
  if (!dateEl) return;
  
  const options = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
  const now = new Date();
  const formatted = now.toLocaleDateString('es-ES', options);
  
  // Capitalize first letter
  dateEl.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

// 2. SPA Navigation
function setupNavigation() {
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetViewId = btn.getAttribute('data-target');
      navigateTo(targetViewId);
    });
  });
}

function navigateTo(viewId) {
  // Hide all views, remove active from nav
  Object.values(views).forEach(view => {
    view.classList.remove('active');
  });
  
  navButtons.forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show target view
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }
  
  // Find matching nav button and make it active
  const matchingNav = Array.from(navButtons).find(btn => btn.getAttribute('data-target') === viewId);
  if (matchingNav) {
    matchingNav.classList.add('active');
  }

  // Refresh history list if entering history
  if (viewId === 'view-history') {
    loadLogs();
  }
}

// 3. Setup Event Listeners
function setupEventListeners() {
  // Mood Emojis Click Events
  const emojiButtons = document.querySelectorAll('.emoji-btn');
  emojiButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const moodValue = parseInt(btn.getAttribute('data-mood'));
      selectMood(moodValue);
    });
  });

  // Diary Back Button
  document.getElementById('btn-back-to-select').addEventListener('click', () => {
    navigateTo('view-select');
  });

  // Diary Textarea character counter
  const textarea = document.getElementById('diary-textarea');
  const charCounter = document.getElementById('char-count');
  textarea.addEventListener('input', () => {
    charCounter.textContent = textarea.value.length;
  });

  // Toggle past date selection
  const btnToggleDate = document.getElementById('btn-toggle-custom-date');
  const dateWrapper = document.getElementById('datetime-picker-wrapper');
  btnToggleDate.addEventListener('click', () => {
    dateWrapper.classList.toggle('hidden');
  });

  // Diary Actions
  document.getElementById('btn-save-diary').addEventListener('click', () => {
    saveCurrentLog();
  });

  document.getElementById('btn-skip-diary').addEventListener('click', () => {
    textarea.value = '';
    saveCurrentLog();
  });

  // Empty state button redirect
  document.getElementById('btn-go-log-first').addEventListener('click', () => {
    navigateTo('view-select');
  });

  // Settings Actions
  document.getElementById('btn-toggle-notifications').addEventListener('click', () => {
    toggleNotificationSubscription();
  });

  document.getElementById('btn-save-push-hours').addEventListener('click', () => {
    savePushHours();
  });

  document.getElementById('btn-add-goal').addEventListener('click', () => {
    addGoal();
  });

  const goalInput = document.getElementById('input-new-goal');
  goalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addGoal();
    }
  });

  document.getElementById('btn-simulate-notification').addEventListener('click', () => {
    simulateLocalNotification();
  });

  document.getElementById('btn-clear-data').addEventListener('click', () => {
    confirmAndClearData();
  });
}

// 4. Select Mood Action
function selectMood(moodValue) {
  currentSelectedMood = moodValue;
  
  const mood = MOOD_DATA[moodValue];
  if (!mood) return;

  // Set selected state visually on emoji buttons (grid)
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  const activeBtn = document.getElementById(`btn-mood-${moodValue}`);
  if (activeBtn) activeBtn.classList.add('selected');

  // Update Diary Screen fields
  document.getElementById('diary-mood-emoji').textContent = mood.emoji;
  const moodTitleEl = document.getElementById('diary-mood-title');
  moodTitleEl.textContent = `Humor: ${mood.label}`;
  moodTitleEl.className = ''; // reset classes
  moodTitleEl.classList.add(mood.colorClass || 'text-main');

  // Clear text area
  document.getElementById('diary-textarea').value = '';
  document.getElementById('char-count').textContent = '0';

  // Initialize DateTime Picker to local current time
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const localISOTime = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
  document.getElementById('diary-datetime').value = localISOTime;
  document.getElementById('datetime-picker-wrapper').classList.add('hidden');

  // Navigate to Diary View
  navigateTo('view-diary');
}

// 5. Deep-linking / Notification parameter checks
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const moodParam = urlParams.get('mood');
  
  if (moodParam && MOOD_DATA[moodParam]) {
    // Select the mood and open the diary page directly
    const moodVal = parseInt(moodParam);
    
    // Clear URL parameters so refreshes don't re-trigger
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    // Show toast message
    showToast(`Registraste humor: ${MOOD_DATA[moodVal].emoji} ¡Completá tu diario!`);
    
    // Open selection screen
    selectMood(moodVal);
  }
}

// 6. DB Operations (LocalStorage)
function saveCurrentLog() {
  if (!currentSelectedMood) {
    showToast('Error: No se seleccionó ningún humor.');
    navigateTo('view-select');
    return;
  }

  const noteText = document.getElementById('diary-textarea').value.trim();
  
  // Read date/time value from picker
  const dateTimeVal = document.getElementById('diary-datetime').value;
  const timestamp = dateTimeVal ? new Date(dateTimeVal).getTime() : Date.now();

  const newLog = {
    id: Date.now() + Math.floor(Math.random() * 1000), // Unique ID even for custom times
    mood: currentSelectedMood,
    note: noteText,
    date: timestamp
  };

  // Get existing logs
  let logs = [];
  try {
    const raw = localStorage.getItem('mood_logs');
    if (raw) logs = JSON.parse(raw);
  } catch (e) {
    console.error('Error reading logs from storage', e);
  }

  // Insert new log, then sort chronologically (newest first)
  logs.push(newLog);
  logs.sort((a, b) => b.date - a.date);
  localStorage.setItem('mood_logs', JSON.stringify(logs));

  // Reset variables & view
  currentSelectedMood = null;
  document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
  
  showToast('¡Registro guardado con éxito! 💜');
  
  // Redirect to history to see it
  navigateTo('view-history');
}

function loadLogs() {
  let logs = [];
  try {
    const raw = localStorage.getItem('mood_logs');
    if (raw) logs = JSON.parse(raw);
  } catch (e) {
    console.error('Error loading logs', e);
  }

  renderLogs(logs);
  renderStats(logs);
  updateHomeSummary(logs);
}

function renderLogs(logs) {
  const container = document.getElementById('history-items-container');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No tenés registros de humor todavía.</p>
        <button class="btn-primary btn-sm" id="btn-go-log-first-inner">Registrar ahora</button>
      </div>
    `;
    // Add event listener to dynamically created button
    const innerBtn = document.getElementById('btn-go-log-first-inner');
    if (innerBtn) {
      innerBtn.addEventListener('click', () => navigateTo('view-select'));
    }
    return;
  }

  let html = '';
  logs.forEach(log => {
    const mood = MOOD_DATA[log.mood] || { emoji: '😐', label: 'Desconocido', colorClass: 'mood-3' };
    const dateObj = new Date(log.date);
    
    // Nice date/time format
    const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const fullDateText = `${dateStr}, ${timeStr}`;

    const colorVal = getComputedStyle(document.documentElement).getPropertyValue(`--${mood.colorClass}`).trim() || '#8b5cf6';

    html += `
      <div class="history-card glass-panel" id="log-card-${log.id}">
        <div class="card-mood-color-strip" style="background-color: ${colorVal}"></div>
        <div class="history-card-emoji-box">${mood.emoji}</div>
        <div class="history-card-details">
          <div class="history-card-meta">
            <span class="history-card-mood-lbl" style="background: rgba(255,255,255,0.05); color: ${colorVal}">${mood.label}</span>
            <span class="history-card-time">${fullDateText}</span>
          </div>
          ${log.note ? `<p class="history-card-text">${escapeHtml(log.note)}</p>` : `<p class="history-card-text" style="color: var(--text-muted); font-style: italic;">Sin nota diaria</p>`}
        </div>
        <button class="btn-delete-log" onclick="deleteLog(${log.id})" title="Borrar registro">✕</button>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Global scope helper for dynamic delete button
window.deleteLog = function(logId) {
  if (!confirm('¿Estás seguro de que querés borrar este registro?')) return;
  
  let logs = [];
  try {
    const raw = localStorage.getItem('mood_logs');
    if (raw) logs = JSON.parse(raw);
  } catch (e) {}

  logs = logs.filter(log => log.id !== logId);
  localStorage.setItem('mood_logs', JSON.stringify(logs));
  
  showToast('Registro eliminado.');
  loadLogs();
};

function renderStats(logs) {
  const totalLogsEl = document.getElementById('stat-total-logs');
  const avgMoodEl = document.getElementById('stat-average-mood');
  
  if (!totalLogsEl || !avgMoodEl) return;

  totalLogsEl.textContent = logs.length;

  if (logs.length === 0) {
    avgMoodEl.textContent = '--';
    return;
  }

  // Calculate Average
  const sum = logs.reduce((acc, log) => acc + log.mood, 0);
  const avg = sum / logs.length;
  
  // Determine which emoji is closest to average
  const closestMoodIndex = Math.round(avg);
  const mood = MOOD_DATA[closestMoodIndex] || { emoji: '😐' };

  avgMoodEl.textContent = `${avg.toFixed(1)} ${mood.emoji}`;
}

function updateHomeSummary(logs) {
  const summaryTextEl = document.getElementById('home-stats-text');
  if (!summaryTextEl) return;

  // Filter logs for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayLogs = logs.filter(log => {
    const logDate = new Date(log.date);
    logDate.setHours(0, 0, 0, 0);
    return logDate.getTime() === today.getTime();
  });

  if (todayLogs.length === 0) {
    summaryTextEl.textContent = 'Aún no registraste tu humor hoy. ¡Toca un emoji para registrar!';
  } else {
    const lastLog = todayLogs[0];
    const mood = MOOD_DATA[lastLog.mood];
    summaryTextEl.innerHTML = `Hoy registraste tu humor <strong>${todayLogs.length} ${todayLogs.length === 1 ? 'vez' : 'veces'}</strong>.<br>Último registro: <strong>${mood.emoji} ${mood.label}</strong>.`;
  }
}

function confirmAndClearData() {
  if (confirm('⚠️ ¡ATENCIÓN! Se van a eliminar todos los registros guardados en este dispositivo. Esta acción es definitiva. ¿Proceder?')) {
    localStorage.removeItem('mood_logs');
    showToast('Datos locales borrados.');
    loadLogs();
    navigateTo('view-select');
  }
}

// 7. PWA Service Worker Registration
function registerSW() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker registrado con éxito:', reg.scope);
        swRegistration = reg;
        checkSubscription();
      })
      .catch(err => {
        console.error('Error al registrar Service Worker:', err);
      });
  } else {
    console.warn('Las notificaciones Push o Service Workers no están soportados en este navegador.');
    const statusBtn = document.getElementById('btn-toggle-notifications');
    if (statusBtn) {
      statusBtn.disabled = true;
      statusBtn.textContent = 'Push no compatible';
    }
  }
}

// 8. Push Subscription Management
function checkSubscription() {
  if (!swRegistration) return;

  swRegistration.pushManager.getSubscription()
    .then(subscription => {
      isSubscribed = !(subscription === null);
      updateSubscriptionUI();
    })
    .catch(err => {
      console.error('Error al verificar suscripción:', err);
    });
}

// Update settings UI state
function updateSubscriptionUI() {
  const statusText = document.getElementById('notification-status-text');
  const toggleBtn = document.getElementById('btn-toggle-notifications');

  if (!statusText || !toggleBtn) return;

  if (isSubscribed) {
    statusText.textContent = 'Activo';
    statusText.className = 'status-badge status-active';
    toggleBtn.textContent = 'Desactivar Notificaciones';
    toggleBtn.className = 'btn-secondary btn-full';
  } else {
    statusText.textContent = 'Inactivo';
    statusText.className = 'status-badge status-disabled';
    toggleBtn.textContent = 'Activar Notificaciones';
    toggleBtn.className = 'btn-primary btn-full';
  }
}

function toggleNotificationSubscription() {
  if (isSubscribed) {
    unsubscribeUser();
  } else {
    subscribeUser();
  }
}

function subscribeUser() {
  showLoading(true);

  // Request Notification Permissions first
  Notification.requestPermission()
    .then(permission => {
      if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado.');
      }
      
      // Get VAPID public key from backend (prepended with BACKEND_URL)
      return fetch(`${BACKEND_URL}/api/vapid-public-key`);
    })
    .then(res => {
      if (!res.ok) throw new Error('No se pudo obtener la llave pública VAPID.');
      return res.json();
    })
    .then(keyData => {
      const applicationServerKey = urlB64ToUint8Array(keyData.publicKey);
      return swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
    })
    .then(subscription => {
      // Add checked hours in subscription metadata
      const checkedHours = Array.from(document.querySelectorAll('input[name="reminder-hour"]:checked')).map(el => parseInt(el.value));
      const subData = subscription.toJSON();
      subData.reminder_hours = checkedHours;

      // Send subscription to backend
      return fetch(`${BACKEND_URL}/api/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subData)
      });
    })
    .then(res => {
      if (!res.ok) throw new Error('Error al enviar la suscripción al servidor.');
      showToast('🔔 ¡Notificaciones activadas con éxito!');
      isSubscribed = true;
      updateSubscriptionUI();
    })
    .catch(err => {
      console.error('Fallo al suscribirse a notificaciones:', err);
      showToast('Error al conectar con el servidor.');
      isSubscribed = false;
      updateSubscriptionUI();
    })
    .finally(() => {
      showLoading(false);
    });
}

function unsubscribeUser() {
  showLoading(true);

  swRegistration.pushManager.getSubscription()
    .then(subscription => {
      if (subscription) {
        // Notify backend to remove subscription (prepended with BACKEND_URL)
        return fetch(`${BACKEND_URL}/api/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        })
        .then(() => {
          return subscription.unsubscribe();
        });
      }
    })
    .then(() => {
      showToast('🔕 Notificaciones desactivadas.');
      isSubscribed = false;
      updateSubscriptionUI();
    })
    .catch(err => {
      console.error('Error al desuscribirse:', err);
      showToast('Error al desactivar suscripción.');
    })
    .finally(() => {
      showLoading(false);
    });
}

// 9. Local Notification Simulator
function simulateLocalNotification() {
  if (!('Notification' in window)) {
    showToast('Las notificaciones no están soportadas.');
    return;
  }

  Notification.requestPermission().then(permission => {
    if (permission !== 'granted') {
      showToast('Permiso de notificaciones denegado.');
      return;
    }

    showToast('📱 Cerrá o bloqueá el celu. Llega en 5s.');

    // Trigger service worker local notification in 5 seconds
    setTimeout(() => {
      if (swRegistration) {
        // Use path-friendly URL dynamically
        const appScope = swRegistration.scope;

        swRegistration.showNotification('¿Cómo te sentís ahora?', {
          body: 'Toca un emoji para guardar tu registro de inmediato.',
          icon: 'icon.svg',
          badge: 'icon.svg',
          tag: 'mood-notification-sim',
          renotify: true,
          vibrate: [200, 100, 200],
          data: {
            url: appScope
          },
          actions: [
            { action: 'sad', title: '😞 Mal' },
            { action: 'neutral', title: '😐 Neutral' },
            { action: 'happy', title: '😊 Bien' }
          ]
        });
      } else {
        // Fallback standard notification (no action buttons)
        new Notification('¿Cómo te sentís?', {
          body: 'Abrí la app para registrar tu humor del momento.',
          icon: 'icon.svg'
        });
      }
    }, 5000);
  });
}

// Utility Helpers
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3500);
}

function showLoading(show) {
  if (!loadingEl) return;
  if (show) {
    loadingEl.classList.add('show');
  } else {
    loadingEl.classList.remove('show');
  }
}

// HTML escape helper
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Base64 converter needed for VAPID subscription keys
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// LOCK SCREEN SECURITY FOR PUBLIC REPOS
function checkLock() {
  const unlocked = sessionStorage.getItem('app_unlocked') === 'true';
  const lockScreen = document.getElementById('lock-screen');
  
  if (unlocked) {
    if (lockScreen) lockScreen.classList.remove('active');
  } else {
    // Check if backend actually requires a PIN
    fetch(`${BACKEND_URL}/api/pin-required`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        if (!data.required) {
          // Backend doesn't require PIN (e.g. local development without APP_PIN)
          sessionStorage.setItem('app_unlocked', 'true');
          if (lockScreen) lockScreen.classList.remove('active');
        } else {
          if (lockScreen) lockScreen.classList.add('active');
          setupLockScreenEvents();
        }
      })
      .catch(err => {
        // Fallback: If backend is offline or errors out, keep locked
        console.warn('Could not check lock state, defaulting to locked.', err);
        if (lockScreen) lockScreen.classList.add('active');
        setupLockScreenEvents();
      });
  }
}

function setupLockScreenEvents() {
  let enteredPin = '';
  const dots = [
    document.getElementById('dot-0'),
    document.getElementById('dot-1'),
    document.getElementById('dot-2'),
    document.getElementById('dot-3')
  ];
  const lockScreen = document.getElementById('lock-screen');
  const buttons = document.querySelectorAll('.pin-btn');

  // Clone and replace buttons to reset any old event listeners
  buttons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
  });

  // Re-fetch and attach click events
  const freshButtons = document.querySelectorAll('.pin-btn');
  freshButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      
      if (val === 'clear') {
        enteredPin = '';
      } else if (val === 'back') {
        enteredPin = enteredPin.slice(0, -1);
      } else if (enteredPin.length < 4) {
        enteredPin += val;
      }
      
      // Update Dots UI
      dots.forEach((dot, index) => {
        if (dot) {
          if (index < enteredPin.length) {
            dot.classList.add('filled');
          } else {
            dot.classList.remove('filled');
          }
          dot.classList.remove('error');
        }
      });

      // Once 4 digits are typed, verify against backend
      if (enteredPin.length === 4) {
        verifyPin(enteredPin, dots, lockScreen);
        enteredPin = ''; // Reset PIN buffer
      }
    });
  });
}

function verifyPin(pin, dots, lockScreen) {
  showLoading(true);
  fetch(`${BACKEND_URL}/api/verify-pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ pin })
  })
  .then(res => {
    if (!res.ok) throw new Error('PIN incorrecto');
    return res.json();
  })
  .then(data => {
    if (data.success) {
      sessionStorage.setItem('app_unlocked', 'true');
      showToast('🔓 Acceso Autorizado');
      if (lockScreen) lockScreen.classList.remove('active');
    } else {
      throw new Error('PIN incorrecto');
    }
  })
  .catch(err => {
    console.error(err);
    showToast('PIN Incorrecto ❌');
    
    // Animate error flash on dots
    dots.forEach(dot => {
      if (dot) {
        dot.classList.remove('filled');
        dot.classList.add('error');
      }
    });
    
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    
    setTimeout(() => {
      dots.forEach(dot => {
        if (dot) dot.classList.remove('error');
      });
    }, 800);
  })
  .finally(() => {
    showLoading(false);
  });
}

// CONFIGURABLE PUSH HOURS
function savePushHours() {
  if (!isSubscribed || !swRegistration) {
    showToast('Primero activá las notificaciones. 🔔');
    return;
  }

  showLoading(true);
  swRegistration.pushManager.getSubscription()
    .then(subscription => {
      if (!subscription) throw new Error('No active subscription found');
      
      const checkedHours = Array.from(document.querySelectorAll('input[name="reminder-hour"]:checked')).map(el => parseInt(el.value));
      const subData = subscription.toJSON();
      subData.reminder_hours = checkedHours;

      // Save local hours setting in LocalStorage just to remember checkbox status locally
      localStorage.setItem('mood_push_hours', JSON.stringify(checkedHours));

      return fetch(`${BACKEND_URL}/api/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subData)
      });
    })
    .then(res => {
      if (!res.ok) throw new Error();
      showToast('⏰ Horarios de notificación guardados.');
    })
    .catch(err => {
      console.error('Error al guardar horarios push:', err);
      showToast('Error al sincronizar con el servidor.');
    })
    .finally(() => {
      showLoading(false);
    });
}

function loadPushHours() {
  try {
    const raw = localStorage.getItem('mood_push_hours');
    if (raw) {
      const hours = JSON.parse(raw);
      document.querySelectorAll('input[name="reminder-hour"]').forEach(checkbox => {
        const val = parseInt(checkbox.value);
        checkbox.checked = hours.includes(val);
      });
    }
  } catch (e) {
    console.error('Could not load local push hours config', e);
  }
}

// DAILY GOALS / HABIT TRACKER LOGIC
let goalsList = [];
let goalsCompletedState = {}; // { 'YYYY-MM-DD': { goalId: true/false } }

function initGoals() {
  // Load goals
  try {
    const rawGoals = localStorage.getItem('mood_goals');
    if (rawGoals) goalsList = JSON.parse(rawGoals);
  } catch (e) {
    goalsList = [];
  }

  // Load completed state
  try {
    const rawCompleted = localStorage.getItem('mood_goals_completed');
    if (rawCompleted) goalsCompletedState = JSON.parse(rawCompleted);
  } catch (e) {
    goalsCompletedState = {};
  }

  // Render lists
  renderHomeGoals();
  renderSettingsGoals();
}

function renderHomeGoals() {
  const container = document.getElementById('goals-checklist-container');
  if (!container) return;

  if (goalsList.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; font-style: italic; font-weight: 300;">No tenés objetivos configurados. Creá algunos en Ajustes ⚙️</p>`;
    return;
  }

  const todayStr = getTodayDateString();
  if (!goalsCompletedState[todayStr]) {
    goalsCompletedState[todayStr] = {};
  }

  let html = '';
  goalsList.forEach(goal => {
    const isCompleted = !!goalsCompletedState[todayStr][goal.id];
    html += `
      <label class="goal-item ${isCompleted ? 'completed' : ''}" data-id="${goal.id}">
        <input type="checkbox" class="goal-checkbox" ${isCompleted ? 'checked' : ''} onchange="toggleGoalCompletion(${goal.id}, this)">
        <span class="goal-text">${escapeHtml(goal.text)}</span>
      </label>
    `;
  });
  container.innerHTML = html;
}

window.toggleGoalCompletion = function(goalId, checkbox) {
  const todayStr = getTodayDateString();
  if (!goalsCompletedState[todayStr]) {
    goalsCompletedState[todayStr] = {};
  }

  goalsCompletedState[todayStr][goalId] = checkbox.checked;
  localStorage.setItem('mood_goals_completed', JSON.stringify(goalsCompletedState));

  const parentLabel = checkbox.closest('.goal-item');
  if (parentLabel) {
    if (checkbox.checked) {
      parentLabel.classList.add('completed');
    } else {
      parentLabel.classList.remove('completed');
    }
  }
};

function renderSettingsGoals() {
  const container = document.getElementById('settings-goals-container');
  if (!container) return;

  if (goalsList.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; font-style: italic; font-weight: 300; text-align: center; margin-top: 10px;">Aún no creaste objetivos.</p>`;
    return;
  }

  let html = '';
  goalsList.forEach(goal => {
    html += `
      <div class="settings-goal-item">
        <span class="settings-goal-text">${escapeHtml(goal.text)}</span>
        <button class="btn-remove-goal" onclick="removeGoal(${goal.id})" title="Eliminar objetivo">✕</button>
      </div>
    `;
  });
  container.innerHTML = html;
}

window.removeGoal = function(goalId) {
  goalsList = goalsList.filter(g => g.id !== goalId);
  localStorage.setItem('mood_goals', JSON.stringify(goalsList));
  initGoals();
  showToast('Objetivo eliminado.');
};

function addGoal() {
  const input = document.getElementById('input-new-goal');
  if (!input) return;

  const text = input.value.trim();
  if (!text) {
    showToast('Escribí un objetivo.');
    return;
  }

  goalsList.push({
    id: Date.now(),
    text: text
  });

  localStorage.setItem('mood_goals', JSON.stringify(goalsList));
  input.value = '';
  
  initGoals();
  showToast('Objetivo creado. ¡A cumplirlo! 💪');
}

function getTodayDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
