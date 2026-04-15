/* ============================================================
   Bengali LLM — Chat Interface JavaScript
   ============================================================ */

'use strict';

// ─── Configuration ─────────────────────────────────────────
const CONFIG = {
  apiEndpoint: localStorage.getItem('api_endpoint') || '',
  apiKey:      localStorage.getItem('api_key')      || '',
  reqFormat:   localStorage.getItem('req_format')   || 'json_message',
  resPath:     localStorage.getItem('res_path')     || 'response',
  temperature: parseFloat(localStorage.getItem('temperature') || '0.7'),
  maxTokens:   parseInt(localStorage.getItem('max_tokens')   || '512'),
  systemPrompt: localStorage.getItem('system_prompt') ||
    'You are a helpful Bengali language assistant developed by Calcutta University Data Science Lab. You excel at understanding and generating Bengali text. Answer in the same language as the user\'s question.',
};

// ─── State ─────────────────────────────────────────────────
let messages       = [];   // { role, content, time }
let isLoading      = false;
let msgCounter     = 0;
let convoCounter   = 1;
let sidebarItems   = [{ id: 1, label: 'New Conversation', active: true }];
let langPref       = 'both'; // 'both' | 'bn' | 'en'
let activeConvoId  = 1;

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

// Config panel inputs
const apiEndpointInput  = document.getElementById('api-endpoint');
const apiKeyInput       = document.getElementById('api-key');
const reqFormatSelect   = document.getElementById('req-format');
const resPathInput      = document.getElementById('res-path');
const temperatureSlider = document.getElementById('temperature');
const maxTokensSlider   = document.getElementById('max-tokens');
const systemPromptTA    = document.getElementById('system-prompt');
const tempValSpan       = document.getElementById('temp-val');
const tokensValSpan     = document.getElementById('tokens-val');

// ─── Init config panel values ──────────────────────────────
const initConfigPanel = () => {
  apiEndpointInput.value  = CONFIG.apiEndpoint;
  apiKeyInput.value       = CONFIG.apiKey;
  reqFormatSelect.value   = CONFIG.reqFormat;
  resPathInput.value      = CONFIG.resPath;
  temperatureSlider.value = CONFIG.temperature;
  maxTokensSlider.value   = CONFIG.maxTokens;
  systemPromptTA.value    = CONFIG.systemPrompt;
  tempValSpan.textContent   = CONFIG.temperature;
  tokensValSpan.textContent = CONFIG.maxTokens;
};
initConfigPanel();

// ─── Slider live update ─────────────────────────────────────
temperatureSlider.addEventListener('input', () => {
  tempValSpan.textContent = parseFloat(temperatureSlider.value).toFixed(1);
});
maxTokensSlider.addEventListener('input', () => {
  tokensValSpan.textContent = parseInt(maxTokensSlider.value);
});

// ─── Save config ────────────────────────────────────────────
saveConfigBtn.addEventListener('click', () => {
  CONFIG.apiEndpoint  = apiEndpointInput.value.trim();
  CONFIG.apiKey       = apiKeyInput.value.trim();
  CONFIG.reqFormat    = reqFormatSelect.value;
  CONFIG.resPath      = resPathInput.value.trim() || 'response';
  CONFIG.temperature  = parseFloat(temperatureSlider.value);
  CONFIG.maxTokens    = parseInt(maxTokensSlider.value);
  CONFIG.systemPrompt = systemPromptTA.value.trim();

  localStorage.setItem('api_endpoint',   CONFIG.apiEndpoint);
  localStorage.setItem('api_key',        CONFIG.apiKey);
  localStorage.setItem('req_format',     CONFIG.reqFormat);
  localStorage.setItem('res_path',       CONFIG.resPath);
  localStorage.setItem('temperature',    CONFIG.temperature);
  localStorage.setItem('max_tokens',     CONFIG.maxTokens);
  localStorage.setItem('system_prompt',  CONFIG.systemPrompt);

  configSavedMsg.classList.add('show');
  modelStatusText.textContent = CONFIG.apiEndpoint ? 'Configured' : 'No endpoint set';
  setTimeout(() => configSavedMsg.classList.remove('show'), 2500);
});

// ─── Settings panel toggle ─────────────────────────────────
settingsBtn.addEventListener('click', () => {
  apiPanel.classList.add('open');
  apiEndpointInput.focus();
});
apiPanelClose.addEventListener('click', () => apiPanel.classList.remove('open'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') apiPanel.classList.remove('open');
});

// ─── Language toggle ───────────────────────────────────────
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

// ─── Textarea auto-resize ──────────────────────────────────
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
  sendBtn.disabled = chatInput.value.trim() === '';
});

// Clear input button
toolbarClearBtn?.addEventListener('click', () => {
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  chatInput.focus();
});

// ─── Send on Enter (Shift+Enter = newline) ─────────────────
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled && !isLoading) handleSend();
  }
});
sendBtn.addEventListener('click', () => { if (!isLoading) handleSend(); });

// ─── Suggestion chips ──────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────
const now = () => {
  const d = new Date();
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const scrollToBottom = () => {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
};

const hideWelcome = () => {
  if (chatWelcome && chatWelcome.style.display !== 'none') {
    chatWelcome.style.transition = 'opacity 0.3s';
    chatWelcome.style.opacity = '0';
    setTimeout(() => { chatWelcome.style.display = 'none'; }, 300);
  }
};

// ─── Render a message bubble ───────────────────────────────
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
  updateSidebarItem(content);
  return el;
};

// ─── Escape HTML ───────────────────────────────────────────
const escapeHtml = (str) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ─── Typing indicator ──────────────────────────────────────
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
const removeTyping = () => {
  if (typingEl) { typingEl.remove(); typingEl = null; }
};

// ─── Build request body ────────────────────────────────────
const buildRequestBody = (userMessage) => {
  const keyMap = {
    json_message: 'message',
    json_prompt:  'prompt',
    json_input:   'input',
    json_text:    'text',
    json_query:   'query',
  };
  const key = keyMap[CONFIG.reqFormat] || 'message';
  const body = {
    [key]: userMessage,
    temperature: CONFIG.temperature,
    max_tokens:  CONFIG.maxTokens,
  };
  if (CONFIG.systemPrompt) body.system_prompt = CONFIG.systemPrompt;
  // Add conversation history
  if (messages.length > 1) {
    body.history = messages.slice(0, -1).map(m => ({
      role:    m.role,
      content: m.content,
    }));
  }
  return body;
};

// ─── Extract response text ─────────────────────────────────
const extractResponse = (data) => {
  if (!CONFIG.resPath) return JSON.stringify(data);

  // Support dot/bracket notation e.g. "choices[0].message.content"
  const path = CONFIG.resPath;

  // Tokenize: "choices[0].message.content" -> ["choices", "0", "message", "content"]
  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let val = data;
  for (const token of tokens) {
    if (val == null) return '[No response]';
    val = val[token];
  }

  if (val == null) {
    // Fallback: stringify whole response
    return JSON.stringify(data, null, 2);
  }
  return String(val);
};

// ─── Main send handler ─────────────────────────────────────
const handleSend = async () => {
  const text = chatInput.value.trim();
  if (!text || isLoading) return;

  if (!CONFIG.apiEndpoint) {
    showApiWarning();
    return;
  }

  hideWelcome();
  isLoading = true;
  sendBtn.disabled = true;

  // Store & render user message
  const userTime = now();
  messages.push({ role: 'user', content: text, time: userTime });
  renderMessage('user', text, userTime);

  // Reset input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Show typing
  showTyping();

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.apiKey) {
      headers['Authorization'] = `Bearer ${CONFIG.apiKey}`;
    }

    const response = await fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildRequestBody(text)),
    });

    removeTyping();

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const replyText = extractResponse(data);
    const replyTime = now();

    messages.push({ role: 'assistant', content: replyText, time: replyTime });
    renderMessage('assistant', replyText, replyTime);

  } catch (err) {
    removeTyping();
    const errTime = now();
    const errMsg = `Error: ${err.message}`;
    messages.push({ role: 'assistant', content: errMsg, time: errTime });
    renderMessage('assistant', errMsg, errTime, true);
    console.error('[Bengali LLM Chat]', err);
  } finally {
    isLoading = false;
    sendBtn.disabled = chatInput.value.trim() === '';
  }
};

// ─── Show API warning ──────────────────────────────────────
const showApiWarning = () => {
  hideWelcome();
  const warnTime = now();
  const warnText = '⚠️ No API endpoint configured. Please click the ⚙️ Settings button in the top-right corner and enter your API endpoint URL.';
  renderMessage('assistant', warnText, warnTime, true);
  settingsBtn.style.animation = 'none';
  setTimeout(() => {
    settingsBtn.style.animation = '';
    settingsBtn.style.boxShadow = '0 0 0 3px rgba(0,212,200,0.4)';
    setTimeout(() => { settingsBtn.style.boxShadow = ''; }, 1500);
  }, 10);
};

// ─── Copy button handler ───────────────────────────────────
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-btn');
  if (!copyBtn) return;
  const bubble = copyBtn.closest('.message-bubble');
  const text = bubble
    ? bubble.textContent.replace('📋 Copy', '').trim()
    : '';
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = '✅ Copied';
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
  }).catch(() => {
    copyBtn.textContent = '❌ Failed';
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
  });
});

// ─── Clear chat ────────────────────────────────────────────
const clearChat = () => {
  // Remove all message els except welcome
  const messageDivs = msgContainer.querySelectorAll('.message');
  messageDivs.forEach(m => m.remove());
  messages = [];

  // Show welcome again
  if (chatWelcome) {
    chatWelcome.style.display = 'block';
    chatWelcome.style.opacity = '1';
  }
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
};

clearChatBtn.addEventListener('click', () => {
  if (messages.length === 0) return;
  if (confirm('Clear this conversation?')) clearChat();
});

// ─── New chat button ───────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  clearChat();
  // Add new sidebar item
  convoCounter++;
  activeConvoId = convoCounter;
  const label = `Conversation ${convoCounter}`;
  sidebarItems.push({ id: convoCounter, label, active: true });
  renderSidebar();
});

// ─── Sidebar render ────────────────────────────────────────
const renderSidebar = () => {
  // Keep the group label, remove old items
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
    el.addEventListener('click', () => {
      activeConvoId = item.id;
      renderSidebar();
    });
    sidebarList.appendChild(el);
  });
};

// ─── Update sidebar with first user message ────────────────
const updateSidebarItem = (content) => {
  const item = sidebarItems.find(i => i.id === activeConvoId);
  if (item && item.label === 'New Conversation' || (item && item.label.startsWith('Conversation '))) {
    // Use first user message as label
    const snippet = content.slice(0, 30) + (content.length > 30 ? '…' : '');
    if (snippet.trim()) {
      item.label = snippet;
      renderSidebar();
    }
  }
};

// ─── Model status ──────────────────────────────────────────
if (CONFIG.apiEndpoint) {
  modelStatusText.textContent = 'Configured';
} else {
  modelStatusText.textContent = 'No endpoint set';
}

// ─── Init sidebar ──────────────────────────────────────────
renderSidebar();

console.log('%c Bengali LLM Chat — CU Data Science Lab 💬', 'color:#00d4c8;font-weight:bold;font-size:14px;');
console.log('%c Configure your API endpoint in the ⚙️ Settings panel.', 'color:#8b92a8;font-size:12px;');
