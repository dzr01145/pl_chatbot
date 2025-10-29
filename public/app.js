/* global sessionStorage */
(() => {
  const messagesEl = document.getElementById('messages');
  const statusBarEl = document.getElementById('status-bar');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const submitBtn = document.getElementById('submit-btn');
  const drawerToggle = document.getElementById('drawer-toggle');
  const drawer = document.getElementById('guide-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const suggestionButtons = document.querySelectorAll('.suggestion-btn');

  const STORAGE_KEY = 'pl-chatbot-history-v1';
  const MAX_HISTORY_ITEMS = 12;

  const state = {
    messages: [],
    typingBubble: null,
  };

  const helpers = {
    escapeHTML(value) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    textToHTML(markdownish) {
      const lines = markdownish.split(/\r?\n/);
      const chunks = [];
      let inList = false;
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          if (inList) {
            chunks.push('</ul>');
            inList = false;
          }
          chunks.push('<p></p>');
          return;
        }
        const listMatch = trimmed.match(/^[-*・•]\s+(.*)/);
        if (listMatch) {
          if (!inList) {
            chunks.push('<ul>');
            inList = true;
          }
          chunks.push(`<li>${helpers.escapeHTML(listMatch[1])}</li>`);
          return;
        }
        if (inList) {
          chunks.push('</ul>');
          inList = false;
        }
        const processed = trimmed
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code>$1</code>');
        chunks.push(`<p>${helpers.escapeHTML(processed)}</p>`);
      });
      if (inList) {
        chunks.push('</ul>');
      }
      return chunks.join('');
    },
    persist() {
      // 履歴は保持しない方針のため何もしない
    },
    restore() {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn('Failed to clear stored chat history', error);
      }
    },
  };

  function renderMessage({ role, content }) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role === 'user' ? 'user' : 'bot'}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'You' : 'AI';
    wrapper.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (content) {
      bubble.innerHTML = helpers.textToHTML(content);
    }
    wrapper.appendChild(bubble);

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function showTypingIndicator() {
    removeTypingIndicator();
    const wrapper = document.createElement('div');
    wrapper.className = 'message bot';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'AI';
    wrapper.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    wrapper.appendChild(bubble);

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    state.typingBubble = wrapper;
  }

  function removeTypingIndicator() {
    if (state.typingBubble && state.typingBubble.parentElement) {
      state.typingBubble.parentElement.removeChild(state.typingBubble);
    }
    state.typingBubble = null;
  }

  function setStatus(text) {
    if (!text) {
      statusBarEl.classList.add('hidden');
      statusBarEl.textContent = '';
      return;
    }
    statusBarEl.textContent = text;
    statusBarEl.classList.remove('hidden');
  }

  function toggleDrawer(open) {
    const shouldOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('open');
    drawer.classList.toggle('open', shouldOpen);
    overlay.classList.toggle('visible', shouldOpen);
    overlay.hidden = !shouldOpen;
    drawerToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  async function sendMessageToServer(message) {
    const payload = {
      message,
      history: state.messages.slice(0, -1).slice(-MAX_HISTORY_ITEMS),
    };
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const errorMessage = detail?.error || `サーバーエラー: ${response.status}`;
      throw new Error(errorMessage);
    }
    return response.json();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const value = inputEl.value.trim();
    if (!value) return;

    const userEntry = { role: 'user', content: value };
    state.messages.push(userEntry);
    renderMessage(userEntry);
    helpers.persist();
    inputEl.value = '';
    inputEl.focus();

    submitBtn.disabled = true;
    showTypingIndicator();
    setStatus('Google Gemini 2.5 Pro に問い合わせ中…（数秒お待ちください）');

    try {
      const data = await sendMessageToServer(value);
      removeTypingIndicator();
      const assistantContent = data.reply?.trim() || '回答を取得できませんでした。';
      const assistantEntry = { role: 'assistant', content: assistantContent };
      state.messages.push(assistantEntry);
      renderMessage(assistantEntry);
      helpers.persist();
    } catch (error) {
      removeTypingIndicator();
      const assistantEntry = {
        role: 'assistant',
        content: `エラーが発生しました: ${error.message}`,
      };
      state.messages.push(assistantEntry);
      renderMessage(assistantEntry);
      helpers.persist();
    } finally {
      setStatus('');
      submitBtn.disabled = false;
    }
  }

  function initSuggestions() {
    suggestionButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const message = button.dataset.message || '';
        if (!message) return;
        inputEl.value = message;
        inputEl.focus({ preventScroll: false });
      });
    });
  }

  function initDrawerControls() {
    if (drawerToggle) {
      drawerToggle.addEventListener('click', () => toggleDrawer());
    }
    overlay?.addEventListener('click', () => toggleDrawer(false));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        toggleDrawer(false);
      }
    });
  }

  function bootstrap() {
    helpers.restore();
    if (state.messages.length === 0) {
      const welcome = {
        role: 'assistant',
        content: [
          'こんにちは。製品安全・PL 対応に関するリスク整理と対応方針づくりを支援するチャットボットです。',
          '具体的な状況を共有していただければ、必要な法的観点、社内プロセス、関係先への連絡方法などを整理します。',
          '重要情報や個人情報は含めず、参考情報としてご利用ください。',
        ].join('\n'),
      };
      state.messages.push(welcome);
      renderMessage(welcome);
      helpers.persist();
    }

    formEl.addEventListener('submit', handleSubmit);
    initSuggestions();
    initDrawerControls();
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
