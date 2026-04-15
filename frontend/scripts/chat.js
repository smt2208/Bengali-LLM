/* ============================================================
   Bengali LLM — Chat Interface JavaScript
   Updated to use the LangGraph / FastAPI backend
   ============================================================ */

'use strict';

// ─── Backend Configuration ──────────────────────────────────
const BACKEND_BASE = localStorage.getItem('backend_base') || 'https://bengali-llm-backend.onrender.com';

// thread_id — unique per browser session, persists across page reloads
// but resets on "New Chat" / "Clear"
let threadId = sessionStorage.getItem('thread_id') || null;

// ─── App State ──────────────────────────────────────────────
let isLoading     = false;
let msgCounter    = 0;
let convoCounter  = 1;
let activeConvoId = 1;
let langPref      = 'both';

// Local message list (for display only — source of truth is SQLite backend)
let displayMessages = [];

// sidebar items: { id, label, threadId }
let sidebarItems = [{ id: 1, label: 'New Conversation', threadId: null }];

// ─── DOM Refs ──────────────────────────────────────────────
const messagesArea    = document.getElementById('messages-area');
const msgContainer    = messagesArea.querySelector('.container');
const chatInput       = document.getElementById('chat-input');
const sendBtn         = document.getElementById('send-btn');
const chatWelcome     = document.getElementById('chat-welcome');
const clearChatBtn    = document.getElementById('clear-chat-btn');
const newChatBtn      = document.getElementById('new-chat-btn');
const settingsBtn     = document.getElementById('settings-btn');
const apiPanel        = document.getElementById('api-config-panel');
const apiPanelClose   = document.getElementById('api-panel-close');
const saveConfigBtn   = document.getElementById('save-config-btn');
const configSavedMsg  = document.getElementById('config-saved-msg');
const sidebarList     = document.getElementById('sidebar-list');
const modelStatusText = document.getElementById('model-status-text');
const toolbarClearBtn = document.getElementById('toolbar-clear-btn');

// Settings panel inputs (now just backend URL + optional colab URL for hot-swap)
const apiEndpointInput  = document.getElementById('api-endpoint');
const apiKeyInput       = document.getElementById('api-key');
const reqFormatSelect   = document.getElementById('req-format');
const resPathInput      = document.getElementById('res-path');
const temperatureSlider = document.getElementById('temperature');
const maxTokensSlider   = document.getElementById('max-tokens');
const systemPromptTA    = document.getElementById('system-prompt');
const tempValSpan       = document.getElementById('temp-val');
const tokensValSpan     = document.getElementById('tokens-val');

// ─── Init settings panel with sensible defaults ─────────────
const initConfigPanel = () => {
  // Repurpose the "API Endpoint" field → LangGraph backend URL
  apiEndpointInput.value       = localStorage.getItem('backend_base') || 'http://localhost:8000';
  apiKeyInput.value            = '';           // not used with own backend
  reqFormatSelect.value        = 'json_message';
  resPathInput.value           = 'response';
  temperatureSlider.value      = 0.7;
  maxTokensSlider.value        = 512;
  systemPromptTA.value         = '(System prompt is configured in the Colab inference server)';
  tempValSpan.textContent      = '0.7';
  tokensValSpan.textContent    = '512';

  // Relabel the endpoint field for clarity
  const epLabel = document.querySelector('label[for="api-endpoint"]');
  if (epLabel) epLabel.textContent = 'Backend URL (LangGraph)';
};
initConfigPanel();

// Live slider display
temperatureSlider.addEventListener('input', () => {
  tempValSpan.textContent = parseFloat(temperatureSlider.value).toFixed(1);
});
maxTokensSlider.addEventListener('input', () => {
  tokensValSpan.textContent = parseInt(maxTokensSlider.value);
});

// Save — updating backend URL + optionally hot-swapping Colab endpoint
saveConfigBtn.addEventListener('click', async () => {
  const newBase = apiEndpointInput.value.trim().replace(/\/$/, '');
  localStorage.setItem('backend_base', newBase);

  // If the user put a Colab ngrok URL in the "API Key" field as a shortcut,
  // hot-swap it on the backend (POST /api/config/endpoint)
  const colabUrl = apiKeyInput.value.trim();
  if (colabUrl.startsWith('https://')) {
    try {
      await fetch(`${newBase}/api/config/endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: `${colabUrl}/generate` }),
      });
    } catch (_) { /* non-critical */ }
  }

  configSavedMsg.classList.add('show');
  modelStatusText.textContent = 'Configured';
  setTimeout(() => configSavedMsg.classList.remove('show'), 2500);
});

// ─── Settings panel open / close ────────────────────────────
settingsBtn.addEventListener('click', () => {
  apiPanel.classList.add('open');
  apiEndpointInput.focus();
});
apiPanelClose.addEventListener('click', () => apiPanel.classList.remove('open'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') apiPanel.classList.remove('open');
});

// ─── Language toggle ─────────────────────────────────────────
const langBtns = document.querySelectorAll('.lang-btn');
langBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    langBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    langPref = btn.id.replace('lang-', '');
    updatePlaceholder();
  });
});
const updatePlaceholder = () => {
  const map = {
    both: 'বাংলায় বা ইংরেজিতে প্রশ্ন করুন... (Ask in Bengali or English)',
    bn:   'বাংলায় প্রশ্ন করুন...',
    en:   'Ask in English...',
  };
  chatInput.placeholder = map[langPref] || map.both;
};

// ─── Textarea auto-resize ────────────────────────────────────
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
  sendBtn.disabled = chatInput.value.trim() === '';
});

toolbarClearBtn?.addEventListener('click', () => {
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  chatInput.focus();
});

// ─── Keyboard send ───────────────────────────────────────────
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled && !isLoading) handleSend();
  }
});
sendBtn.addEventListener('click', () => { if (!isLoading) handleSend(); });

// ─── Suggestion chips ────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chatInput.value = chip.textContent.trim();
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
    sendBtn.disabled = false;
    chatInput.focus();
    handleSend();
  });
});

// ─── Helpers ─────────────────────────────────────────────────
const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const scrollToBottom = () => messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });

const escapeHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const hideWelcome = () => {
  if (chatWelcome && chatWelcome.style.display !== 'none') {
    chatWelcome.style.transition = 'opacity 0.3s';
    chatWelcome.style.opacity = '0';
    setTimeout(() => { chatWelcome.style.display = 'none'; }, 300);
  }
};

// ─── Render message bubble ───────────────────────────────────
const renderMessage = (role, content, time, isError = false) => {
  const id = `msg-${++msgCounter}`;
  const isUser = role === 'user';

  const el = document.createElement('div');
  el.classList.add('message', role);
  el.setAttribute('id', id);
  el.setAttribute('role', 'listitem');

  el.innerHTML = `
    <div class="message-avatar" aria-hidden="true">${isUser ? '👤' : '🤖'}</div>
    <div class="message-body">
      <div class="message-role">${isUser ? 'You' : 'Bengali LLM'}</div>
      <div class="message-bubble${isError ? ' message-error' : ''}">
        ${escapeHtml(content).replace(/\n/g, '<br/>')}
        ${!isUser ? `<button class="copy-btn" data-msg-id="${id}" aria-label="Copy response">📋 Copy</button>` : ''}
      </div>
      <div class="message-time">${time}</div>
    </div>
  `;

  msgContainer.appendChild(el);
  scrollToBottom();
  updateSidebarLabel(content);
  return el;
};

// ─── Typing indicator ────────────────────────────────────────
let typingEl = null;
const showTyping = () => {
  typingEl = document.createElement('div');
  typingEl.classList.add('message', 'assistant');
  typingEl.setAttribute('id', 'typing-msg');
  typingEl.innerHTML = `
    <div class="message-avatar" aria-hidden="true">🤖</div>
    <div class="message-body">
      <div class="message-role">Bengali LLM</div>
      <div class="typing-indicator" aria-label="Bengali LLM is typing">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  msgContainer.appendChild(typingEl);
  scrollToBottom();
};
const removeTyping = () => { if (typingEl) { typingEl.remove(); typingEl = null; } };

// ════════════════════════════════════════════════════════════
//  MAIN SEND — calls LangGraph backend
// ════════════════════════════════════════════════════════════
const handleSend = async () => {
  const text = chatInput.value.trim();
  if (!text || isLoading) return;

  const base = (localStorage.getItem('backend_base') || BACKEND_BASE).replace(/\/$/, '');

  hideWelcome();
  isLoading = true;
  sendBtn.disabled = true;

  // Render user message immediately
  const userTime = now();
  displayMessages.push({ role: 'user', content: text, time: userTime });
  renderMessage('user', text, userTime);

  chatInput.value = '';
  chatInput.style.height = 'auto';
  showTyping();

  try {
    const payload = {
      question: text,
      thread_id: threadId || undefined,   // undefined = generate new on backend
    };

    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    removeTyping();

    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(err);
    }

    const data = await res.json();

    // Persist thread_id for the lifetime of this session
    if (data.thread_id && !threadId) {
      threadId = data.thread_id;
      sessionStorage.setItem('thread_id', threadId);
      // Update sidebar item's threadId
      const item = sidebarItems.find(i => i.id === activeConvoId);
      if (item) item.threadId = threadId;
    }

    const replyTime = now();
    displayMessages.push({ role: 'assistant', content: data.response, time: replyTime });
    renderMessage('assistant', data.response, replyTime);

    modelStatusText.textContent = 'Connected';

  } catch (err) {
    removeTyping();
    const errTime = now();
    let errMsg;

    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      errMsg = '⚠️ Cannot reach the backend server. Make sure it is running at ' + base;
    } else {
      errMsg = `Error: ${err.message}`;
    }

    displayMessages.push({ role: 'assistant', content: errMsg, time: errTime });
    renderMessage('assistant', errMsg, errTime, true);
    modelStatusText.textContent = 'Error';
    console.error('[Bengali LLM]', err);

  } finally {
    isLoading = false;
    sendBtn.disabled = chatInput.value.trim() === '';
  }
};

// ─── Clear chat ──────────────────────────────────────────────
const clearChat = async () => {
  // Tell backend to clear the SQLite checkpoint for this thread
  if (threadId) {
    const base = (localStorage.getItem('backend_base') || BACKEND_BASE).replace(/\/$/, '');
    try {
      await fetch(`${base}/api/history/${threadId}`, { method: 'DELETE' });
    } catch (_) { /* non-critical */ }
  }

  // Reset local session
  threadId = null;
  sessionStorage.removeItem('thread_id');
  displayMessages = [];

  // Remove message bubbles
  msgContainer.querySelectorAll('.message').forEach(m => m.remove());

  if (chatWelcome) {
    chatWelcome.style.display = 'block';
    chatWelcome.style.opacity = '1';
  }
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  modelStatusText.textContent = 'Connected';
};

clearChatBtn.addEventListener('click', () => {
  if (displayMessages.length === 0) return;
  if (confirm('Clear this conversation? This also removes it from the backend history.')) {
    clearChat();
  }
});

// ─── New Chat ────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  clearChat();
  convoCounter++;
  activeConvoId = convoCounter;
  sidebarItems.push({ id: convoCounter, label: 'New Conversation', threadId: null });
  renderSidebar();
});

// ─── Sidebar ─────────────────────────────────────────────────
const renderSidebar = () => {
  const groupLabel = sidebarList.querySelector('.sidebar-group-label');
  sidebarList.innerHTML = '';
  if (groupLabel) sidebarList.appendChild(groupLabel);

  sidebarItems.forEach(item => {
    const el = document.createElement('div');
    el.classList.add('sidebar-item');
    if (item.id === activeConvoId) el.classList.add('active');
    el.setAttribute('role', 'listitem');
    el.setAttribute('id', `convo-${item.id}`);
    el.setAttribute('tabindex', '0');
    el.setAttribute('data-convo', item.id);
    el.innerHTML = `
      <div class="sidebar-item-icon">💬</div>
      <div class="sidebar-item-text"><span>${escapeHtml(item.label)}</span></div>
      <span class="sidebar-item-time">Now</span>
    `;
    el.addEventListener('click', () => { activeConvoId = item.id; renderSidebar(); });
    sidebarList.appendChild(el);
  });
};

const updateSidebarLabel = (content) => {
  const item = sidebarItems.find(i => i.id === activeConvoId);
  if (item && (item.label === 'New Conversation' || item.label.startsWith('Conversation '))) {
    const snippet = content.slice(0, 30) + (content.length > 30 ? '…' : '');
    if (snippet.trim()) { item.label = snippet; renderSidebar(); }
  }
};

// ─── Copy button ─────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-btn');
  if (!copyBtn) return;
  const bubble = copyBtn.closest('.message-bubble');
  const text = bubble ? bubble.textContent.replace('📋 Copy', '').trim() : '';
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = '✅ Copied';
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
  }).catch(() => {
    copyBtn.textContent = '❌ Failed';
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
  });
});

// ─── Startup ─────────────────────────────────────────────────
renderSidebar();

// Check if backend is alive
(async () => {
  const base = (localStorage.getItem('backend_base') || BACKEND_BASE).replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      modelStatusText.textContent = 'Connected';
      console.log('%c Bengali LLM Backend connected ✅', 'color:#00d4c8;font-weight:bold;');
    } else {
      modelStatusText.textContent = 'Backend error';
    }
  } catch (_) {
    modelStatusText.textContent = 'Offline — start backend';
    console.warn('Backend not reachable at', base);
  }
})();

console.log('%c Bengali LLM Chat — CU Data Science Lab 💬', 'color:#00d4c8;font-weight:bold;font-size:14px;');
