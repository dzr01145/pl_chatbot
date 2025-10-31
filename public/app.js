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
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeySubmitBtn = document.getElementById('api-key-submit');
  const apiKeySection = document.getElementById('api-key-section');
  const chatSection = document.getElementById('chat-section');
  const modelSelect = document.getElementById('model-select');
  const lengthSelect = document.getElementById('length-select');

  const STORAGE_KEY_HISTORY = 'pl-chatbot-history-v1';
  const STORAGE_KEY_API_KEY = 'pl-chatbot-api-key-v1';
  const MAX_HISTORY_ITEMS = 12;
  const CONTINUATION_PROMPT =
    '回答が途中で終了したようです。前回までの内容と重複させず、謝罪や前置き、締めの挨拶は一切書かずに、残りの重要なアクションや留意点を最大6項目の箇条書きで補足してください。';

  const state = {
    messages: [],
    typingBubble: null,
    apiKey: null,
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
      const html = [];
      let currentList = null;

      const openList = (type) => {
        if (currentList !== type) {
          closeList();
          html.push(type === 'ol' ? '<ol>' : '<ul>');
          currentList = type;
        }
      };

      const closeList = () => {
        if (currentList) {
          html.push(currentList === 'ol' ? '</ol>' : '</ul>');
          currentList = null;
        }
      };

      const formatInline = (text) => {
        let safe = helpers.escapeHTML(text);
        safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
        safe = safe.replace(
          /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener">$1</a>'
        );
        return safe;
      };

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          closeList();
          return;
        }

        if (/^---+$/.test(trimmed)) {
          closeList();
          html.push('<hr>');
          return;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
        if (headingMatch) {
          closeList();
          const level = headingMatch[1].length;
          const content = formatInline(headingMatch[2]);
          html.push(`<h${level}>${content}</h${level}>`);
          return;
        }

        const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
        if (orderedMatch) {
          openList('ol');
          html.push(`<li>${formatInline(orderedMatch[1])}</li>`);
          return;
        }

        const unorderedMatch = trimmed.match(/^[-*・•]\s+(.*)/);
        if (unorderedMatch) {
          openList('ul');
          html.push(`<li>${formatInline(unorderedMatch[1])}</li>`);
          return;
        }

        closeList();
        html.push(`<p>${formatInline(trimmed)}</p>`);
      });

      closeList();
      return html.join('');
    },
    persist() {
      // 履歴は保持しない方針のため何もしない
    },
    restore() {
      try {
        sessionStorage.removeItem(STORAGE_KEY_HISTORY);
      } catch (error) {
        console.warn('Failed to clear stored chat history', error);
      }
    },
    saveApiKey(key) {
      try {
        sessionStorage.setItem(STORAGE_KEY_API_KEY, key);
        state.apiKey = key;
      } catch (error) {
        console.warn('Failed to save API key', error);
      }
    },
    loadApiKey() {
      try {
        const key = sessionStorage.getItem(STORAGE_KEY_API_KEY);
        if (key) {
          state.apiKey = key;
          return true;
        }
      } catch (error) {
        console.warn('Failed to load API key', error);
      }
      return false;
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

  function cleanContinuation(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const filtered = lines.filter((line) => {
      if (!line) return false;
      if (/^(承知いたしました|了解しました)/.test(line)) return false;
      if (line.includes('失礼') || line.includes('申し訳')) return false;
      if (/^謝罪/.test(line)) return false;
      return true;
    });
    return filtered.join('\n');
  }

  async function callGeminiAPI(message, history) {
    const apiKey = state.apiKey;
    if (!apiKey) {
      throw new Error('API キーが設定されていません。');
    }

    // プルダウンから選択された値を取得
    const modelName = modelSelect.value;
    const lengthType = lengthSelect.value;
    const maxTokens = lengthType === 'short' ? 450 : 3072;

    const systemInstruction = {
      role: 'system',
      parts: [
        {
          text: [
            'You are a bilingual (Japanese primary, English secondary) assistant specializing in product safety, product liability (PL), recall response, and quality compliance.',
            'When relevant, outline regulatory requirements within Japan (e.g., PL法, 消費生活用製品安全法, JIS Q 9001) and global best practices.',
            'Provide step-by-step guidance, risk assessments, stakeholder coordination advice, and documentation templates as text lists when appropriate.',
            'If the user asks for legal confirmation or makes critical decisions, remind them to consult qualified professionals and responsible authorities.',
            'Reject requests unrelated to manufacturing quality, PL, or product safety topics, and keep the conversation professional and supportive.',
          ].join(' '),
        },
      ],
    };

    const geminiHistory = [];
    let seenFirstUser = false;
    history.forEach((item) => {
      if (!item?.role || !item?.content) return;
      if (item.role === 'assistant' && !seenFirstUser) return;

      const mappedRole = item.role === 'assistant' ? 'model' : 'user';
      if (mappedRole === 'user') {
        seenFirstUser = true;
      }

      geminiHistory.push({
        role: mappedRole,
        parts: [{ text: item.content }],
      });
    });

    const requestBody = {
      system_instruction: systemInstruction,
      contents: [
        ...geminiHistory,
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: maxTokens,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData?.error?.message || `API エラー: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  }

  function extractResponseText(data) {
    const candidates = data?.candidates ?? [];
    const primary = candidates[0];
    if (!primary) return { text: '', finishReason: 'UNKNOWN' };

    const parts = primary?.content?.parts ?? [];
    const text = parts
      .map((part) => part?.text?.trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    return {
      text,
      finishReason: primary?.finishReason,
    };
  }

  async function sendMessageToGemini(message) {
    const normalizedHistory = state.messages.slice(0, -1).slice(-MAX_HISTORY_ITEMS);

    try {
      const initialResult = await callGeminiAPI(message, normalizedHistory);
      const initialPayload = extractResponseText(initialResult);

      let reply = initialPayload.text;
      let finishReason = initialPayload.finishReason;

      // MAX_TOKENS の場合、継続リクエスト
      if (finishReason === 'MAX_TOKENS') {
        try {
          const continuationResult = await callGeminiAPI(
            CONTINUATION_PROMPT,
            [...normalizedHistory, { role: 'user', content: message }, { role: 'assistant', content: reply }]
          );
          const continuationPayload = extractResponseText(continuationResult);
          if (continuationPayload.text) {
            const continuationText = cleanContinuation(continuationPayload.text);
            reply = [reply, continuationText].filter(Boolean).join('\n\n');
          }
          finishReason = continuationPayload.finishReason || finishReason;
        } catch (continuationError) {
          console.warn('Continuation request failed:', continuationError);
        }
      }

      if (!reply) {
        reply =
          'Gemini API から有効な応答を取得できませんでした。時間をおいて再試行するか、別の表現でご相談ください。';
      }

      return reply;
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
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
    setStatus('Google Gemini 2.5 Pro に問い合わせ中…（最大10秒ほどかかる場合があります）');

    try {
      const assistantContent = await sendMessageToGemini(value);
      removeTypingIndicator();
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

  function handleApiKeySubmit(event) {
    event.preventDefault();
    const key = apiKeyInput.value.trim();
    if (!key) {
      alert('API キーを入力してください。');
      return;
    }
    helpers.saveApiKey(key);
    apiKeySection.style.display = 'none';
    chatSection.style.display = 'flex';
    inputEl.focus();

    // ウェルカムメッセージを表示
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

    // API キーがセッションにあるかチェック
    if (helpers.loadApiKey()) {
      apiKeySection.style.display = 'none';
      chatSection.style.display = 'flex';

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
    } else {
      apiKeySection.style.display = 'flex';
      chatSection.style.display = 'none';
    }

    formEl.addEventListener('submit', handleSubmit);
    document.getElementById('api-key-form').addEventListener('submit', handleApiKeySubmit);
    initSuggestions();
    initDrawerControls();
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
