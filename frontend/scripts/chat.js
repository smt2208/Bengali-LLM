/* ============================================================
   Bengali LLM — Chat Interface JavaScript
   Clean version — settings panel removed, backend URL hardcoded
   ============================================================ */

'use strict';

// ─── Backend Configuration ──────────────────────────────────
const BACKEND_BASE = 'https://bengali-llm-backend.onrender.com';

// ─── Per-conversation state ──────────────────────────────────
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
const sidebarList     = document.getElementById('sidebar-list');
const modelStatusText = document.getElementById('model-status-text');
const toolbarClearBtn = document.getElementById('toolbar-clear-btn');

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

// ─── Render a single message bubble ──────────────────────────
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

// ─── Render all messages for a conversation ───────────────────
const renderConversation = (convoId) => {
  msgContainer.querySelectorAll('.message').forEach(m => m.remove());
  const convo = conversations[convoId];
  if (!convo || convo.messages.length === 0) {
    showWelcome();
    return;
  }
  if (chatWelcome) { chatWelcome.style.display = 'none'; chatWelcome.style.opacity = '0'; }
  convo.messages.forEach(({ role, content, time, isError }) => {
    appendMessageBubble(role, content, time, isError || false);
  });
  scrollToBottom();
};

// ─── Switch conversation ──────────────────────────────────────
const switchConversation = (convoId) => {
  if (convoId === activeConvoId) return;
  activeConvoId = convoId;
  renderConversation(convoId);
  renderSidebar();
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
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
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

  const convo = conversations[activeConvoId];
  hideWelcome();
  isLoading = true;
  sendBtn.disabled = true;

  const userTime = now();
  convo.messages.push({ role: 'user', content: text, time: userTime });
  appendMessageBubble('user', text, userTime);

  if (convo.label === 'New Conversation') {
    convo.label = text.slice(0, 35) + (text.length > 35 ? '…' : '');
    renderSidebar();
  }

  chatInput.value = '';
  chatInput.style.height = 'auto';
  showTyping();

  try {
    const res = await fetch(`${BACKEND_BASE}/api/chat`, {
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
    if (data.thread_id && !convo.threadId) convo.threadId = data.thread_id;

    const replyTime = now();
    convo.messages.push({ role: 'assistant', content: data.response, time: replyTime });
    appendMessageBubble('assistant', data.response, replyTime);
    scrollToBottom();
    renderSidebar();
    modelStatusText.textContent = 'Connected';

  } catch (err) {
    removeTyping();
    const errTime = now();
    const errMsg = err.message.includes('Failed to fetch') || err.message.includes('NetworkError')
      ? '⚠️ Cannot reach the backend. Please try again in a moment.'
      : `Error: ${err.message}`;
    convo.messages.push({ role: 'assistant', content: errMsg, time: errTime, isError: true });
    appendMessageBubble('assistant', errMsg, errTime, true);
    modelStatusText.textContent = 'Error';
    console.error('[Bengali LLM]', err);

  } finally {
    isLoading = false;
    sendBtn.disabled = chatInput.value.trim() === '';
  }
};

// ─── Clear chat ───────────────────────────────────────────────
const clearCurrentChat = async () => {
  const convo = conversations[activeConvoId];
  if (convo.threadId) {
    try { await fetch(`${BACKEND_BASE}/api/history/${convo.threadId}`, { method: 'DELETE' }); }
    catch (_) { /* non-critical */ }
  }
  convo.threadId = null;
  convo.messages = [];
  convo.label    = 'New Conversation';
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
  if (confirm('Clear this conversation? This also removes it from the backend history.')) clearCurrentChat();
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

  Object.keys(conversations).map(Number).reverse().forEach(id => {
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
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') switchConversation(id); });
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

(async () => {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    modelStatusText.textContent = res.ok ? 'Connected' : 'Backend error';
    if (res.ok) console.log('%c Bengali LLM Backend connected ✅', 'color:#00d4c8;font-weight:bold;');
  } catch (_) {
    modelStatusText.textContent = 'Offline';
    console.warn('Backend not reachable at', BACKEND_BASE);
  }
})();

console.log('%c Bengali LLM Chat — CU Data Science Lab 💬', 'color:#00d4c8;font-weight:bold;font-size:14px;');
