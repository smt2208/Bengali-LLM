/* ============================================================
   Bengali LLM — Chat Interface JavaScript
   Multi-conversation support with proper state isolation
   ============================================================ */

'use strict';

// ─── Backend Configuration ──────────────────────────────────
const BACKEND_BASE = localStorage.getItem('backend_base') || 'https://bengali-llm-backend.onrender.com';

// ─── Per-conversation state ──────────────────────────────────
// Each conversation is fully isolated: its own threadId, messages, label
// conversations[id] = { threadId, label, messages: [{role, content, time, isError}] }
let activeConvoId = 1;
let nextConvoId   = 2;
const conversations = {
  1: { threadId: null, label: 'New Conversation', messages: [] }
};

// ─── App state ───────────────────────────────────────────────
let isLoading = false;
let msgCounter = 0;
let langPref   = 'both';

// ─── DOM Refs ────────────────────────────────────────────────
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
const apiEndpointInput  = document.getElementById('api-endpoint');
const apiKeyInput       = document.getElementById('api-key');
const reqFormatSelect   = document.getElementById('req-format');
const resPathInput      = document.getElementById('res-path');
const temperatureSlider = document.getElementById('temperature');
const maxTokensSlider   = document.getElementById('max-tokens');
const systemPromptTA    = document.getElementById('system-prompt');
const tempValSpan       = document.getElementById('temp-val');
const tokensValSpan     = document.getElementById('tokens-val');

// ─── Settings panel ──────────────────────────────────────────
const initConfigPanel = () => {
  apiEndpointInput.value     = localStorage.getItem('backend_base') || BACKEND_BASE;
  apiKeyInput.value          = '';
  reqFormatSelect.value      = 'json_message';
  resPathInput.value         = 'response';
  temperatureSlider.value    = 0.7;
  maxTokensSlider.value      = 512;
  systemPromptTA.value       = '(System prompt is configured in the Colab inference server)';
  tempValSpan.textContent    = '0.7';
  tokensValSpan.textContent  = '512';
  const epLabel = document.querySelector('label[for="api-endpoint"]');
  if (epLabel) epLabel.textContent = 'Backend URL (LangGraph)';
};
initConfigPanel();

temperatureSlider.addEventListener('input', () => {
  tempValSpan.textContent = parseFloat(temperatureSlider.value).toFixed(1);
});
maxTokensSlider.addEventListener('input', () => {
  tokensValSpan.textContent = parseInt(maxTokensSlider.value);
});

saveConfigBtn.addEventListener('click', async () => {
  const newBase = apiEndpointInput.value.trim().replace(/\/$/, '');
  localStorage.setItem('backend_base', newBase);
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

// ─── Textarea auto-resize ─────────────────────────────────────
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

// ─── Keyboard send ────────────────────────────────────────────
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled && !isLoading) handleSend();
  }
});
sendBtn.addEventListener('click', () => { if (!isLoading) handleSend(); });

// ─── Suggestion chips ─────────────────────────────────────────
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
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ─── Welcome screen ───────────────────────────────────────────
const showWelcome = () => {
  if (chatWelcome) {
    chatWelcome.style.display = 'block';
    chatWelcome.style.opacity = '1';
  }
};
const hideWelcome = () => {
  if (chatWelcome && chatWelcome.style.display !== 'none') {
    chatWelcome.style.transition = 'opacity 0.3s';
    chatWelcome.style.opacity = '0';
    setTimeout(() => { chatWelcome.style.display = 'none'; }, 300);
  }
};

// ─── Render a single message bubble into DOM ──────────────────
const appendMessageBubble = (role, content, time, isError = false) => {
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
  return el;
};

// ─── Render ALL stored messages for a given conversation ──────
// This is what makes switching chats work correctly!
const renderConversation = (convoId) => {
  // Clear ALL message bubbles from DOM first
  msgContainer.querySelectorAll('.message').forEach(m => m.remove());

  const convo = conversations[convoId];
  if (!convo || convo.messages.length === 0) {
    showWelcome();
    return;
  }

  // Hide welcome, then re-render every stored message
  if (chatWelcome) {
    chatWelcome.style.display = 'none';
    chatWelcome.style.opacity = '0';
  }
  convo.messages.forEach(({ role, content, time, isError }) => {
    appendMessageBubble(role, content, time, isError || false);
  });
  scrollToBottom();
};

// ─── Switch to a different conversation ──────────────────────
const switchConversation = (convoId) => {
  if (convoId === activeConvoId && !isLoading) return;
  activeConvoId = convoId;
  renderConversation(convoId);
  renderSidebar();
  // Reset input state
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  chatInput.focus();
};

// ─── Typing indicator ─────────────────────────────────────────
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
//  MAIN SEND
// ════════════════════════════════════════════════════════════
const handleSend = async () => {
  const text = chatInput.value.trim();
  if (!text || isLoading) return;

  const base = (localStorage.getItem('backend_base') || BACKEND_BASE).replace(/\/$/, '');
  const convo = conversations[activeConvoId];

  hideWelcome();
  isLoading = true;
  sendBtn.disabled = true;

  // Store + render user message immediately
  const userTime = now();
  convo.messages.push({ role: 'user', content: text, time: userTime });
  appendMessageBubble('user', text, userTime);

  // Set sidebar label from first message (like ChatGPT)
  if (convo.label === 'New Conversation') {
    convo.label = text.slice(0, 35) + (text.length > 35 ? '…' : '');
    renderSidebar();
  }

  chatInput.value = '';
  chatInput.style.height = 'auto';
  showTyping();

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: text,
        thread_id: convo.threadId || undefined,
      }),
    });

    removeTyping();

    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(err);
    }

    const data = await res.json();

    // Bind thread_id to THIS conversation only
    if (data.thread_id && !convo.threadId) {
      convo.threadId = data.thread_id;
    }

    const replyTime = now();
    convo.messages.push({ role: 'assistant', content: data.response, time: replyTime });
    appendMessageBubble('assistant', data.response, replyTime);
    scrollToBottom();
    renderSidebar(); // update message count in sidebar
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
    convo.messages.push({ role: 'assistant', content: errMsg, time: errTime, isError: true });
    appendMessageBubble('assistant', errMsg, errTime, true);
    modelStatusText.textContent = 'Error';
    console.error('[Bengali LLM]', err);

  } finally {
    isLoading = false;
    sendBtn.disabled = chatInput.value.trim() === '';
  }
};

// ─── Clear current chat ───────────────────────────────────────
const clearCurrentChat = async () => {
  const convo = conversations[activeConvoId];
  if (convo.threadId) {
    const base = (localStorage.getItem('backend_base') || BACKEND_BASE).replace(/\/$/, '');
    try {
      await fetch(`${base}/api/history/${convo.threadId}`, { method: 'DELETE' });
    } catch (_) { /* non-critical */ }
  }
  convo.threadId  = null;
  convo.messages  = [];
  convo.label     = 'New Conversation';
  msgContainer.querySelectorAll('.message').forEach(m => m.remove());
  showWelcome();
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  modelStatusText.textContent = 'Connected';
  renderSidebar();
};

clearChatBtn.addEventListener('click', () => {
  if ((conversations[activeConvoId]?.messages.length || 0) === 0) return;
  if (confirm('Clear this conversation? This also removes it from the backend history.')) {
    clearCurrentChat();
  }
});

// ─── New Chat ─────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  const newId = nextConvoId++;
  conversations[newId] = { threadId: null, label: 'New Conversation', messages: [] };
  switchConversation(newId);
});

// ─── Sidebar ──────────────────────────────────────────────────
const renderSidebar = () => {
  sidebarList.innerHTML = '';

  const groupLabel = document.createElement('div');
  groupLabel.className = 'sidebar-group-label';
  groupLabel.textContent = 'Conversations';
  sidebarList.appendChild(groupLabel);

  // Show newest conversation first (like all modern chat apps)
  const ids = Object.keys(conversations).map(Number).reverse();

  ids.forEach(id => {
    const convo = conversations[id];
    const el = document.createElement('div');
    el.classList.add('sidebar-item');
    if (id === activeConvoId) el.classList.add('active');
    el.setAttribute('role', 'listitem');
    el.setAttribute('id', `convo-${id}`);
    el.setAttribute('tabindex', '0');
    el.setAttribute('data-convo', id);

    const msgCount = convo.messages.length;
    el.innerHTML = `
      <div class="sidebar-item-icon">💬</div>
      <div class="sidebar-item-text"><span>${escapeHtml(convo.label)}</span></div>
      <span class="sidebar-item-time">${msgCount > 0 ? `${msgCount} msg${msgCount > 1 ? 's' : ''}` : 'Empty'}</span>
    `;

    el.addEventListener('click', () => switchConversation(id));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') switchConversation(id);
    });
    sidebarList.appendChild(el);
  });
};

// ─── Copy button ──────────────────────────────────────────────
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

// ─── Startup ──────────────────────────────────────────────────
renderSidebar();
showWelcome();

// Health check
(async () => {
  const base = (localStorage.getItem('backend_base') || BACKEND_BASE).replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000) });
    modelStatusText.textContent = res.ok ? 'Connected' : 'Backend error';
    if (res.ok) console.log('%c Bengali LLM Backend connected ✅', 'color:#00d4c8;font-weight:bold;');
  } catch (_) {
    modelStatusText.textContent = 'Offline — start backend';
    console.warn('Backend not reachable at', base);
  }
})();

console.log('%c Bengali LLM Chat — CU Data Science Lab 💬', 'color:#00d4c8;font-weight:bold;font-size:14px;');
