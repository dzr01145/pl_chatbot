'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require('@google/generative-ai');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const MAX_HISTORY_ITEMS = 12;
const CONTINUATION_PROMPT =
  '回答が途中で終了したようです。前回までの内容と重複させず、謝罪や前置き、締めの挨拶は一切書かずに、残りの重要なアクションや留意点を最大6項目の箇条書きで補足してください。';

const generationConfig = {
  temperature: 0.3,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 2048,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

if (!apiKey) {
  console.warn(
    '⚠️  GEMINI_API_KEY が設定されていません。Gemini API へのリクエストは失敗します。'
  );
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
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

const model = genAI
  ? genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
      safetySettings,
      generationConfig,
    })
  : null;

function extractResponsePayload(result) {
  const response = result?.response ?? {};
  const candidates = response.candidates ?? [];
  const primary = candidates[0];

  let text = '';
  if (typeof response.text === 'function') {
    text = response.text().trim();
  }
  if (!text && primary?.content?.parts) {
    text = primary.content.parts
      .map((part) => part?.text?.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return {
    text,
    finishReason: primary?.finishReason,
    blockReason: primary?.finishReason || response?.promptFeedback?.blockReason,
    promptFeedback: response?.promptFeedback,
  };
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

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.post('/api/chat', async (req, res) => {
  if (!model) {
    return res.status(500).json({ error: 'Gemini API キーが設定されていません。' });
  }

  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res
      .status(400)
      .json({ error: 'message フィールドにテキストを指定してください。' });
  }

  const normalizedHistory = Array.isArray(history)
    ? history.slice(-MAX_HISTORY_ITEMS)
    : [];
  const geminiHistory = [];
  let seenFirstUser = false;
  normalizedHistory.forEach((item) => {
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

  try {
    const chatSession = model.startChat({
      history: geminiHistory,
    });
    const initialResult = await chatSession.sendMessage(message);
    const initialPayload = extractResponsePayload(initialResult);

    let reply = initialPayload.text;
    const promptFeedbacks = [initialPayload.promptFeedback].filter(Boolean);
    let finishReason = initialPayload.finishReason;
    let blockReason = initialPayload.blockReason;
    let continuationApplied = false;

    if (finishReason === 'MAX_TOKENS') {
      try {
        const continuationResult = await chatSession.sendMessage(CONTINUATION_PROMPT);
        const continuationPayload = extractResponsePayload(continuationResult);
        if (continuationPayload.text) {
          const continuationText = cleanContinuation(continuationPayload.text);
          reply = [reply, continuationText].filter(Boolean).join('\n\n');
          continuationApplied = true;
        }
        finishReason = continuationPayload.finishReason || finishReason;
        blockReason = continuationPayload.blockReason || blockReason;
        if (continuationPayload.promptFeedback) {
          promptFeedbacks.push(continuationPayload.promptFeedback);
        }
      } catch (continuationError) {
        console.warn('Continuation request failed:', continuationError);
      }
    }

    if (!reply) {
      if (blockReason === 'SAFETY') {
        const blockedCategories = promptFeedbacks
          .flatMap((feedback) => feedback?.safetyRatings ?? [])
          .filter((rating) => rating?.blocked)
          .map((rating) => rating.category)
          .join(', ');
        reply =
          'Google Gemini が安全ポリシーにより応答をブロックしました。' +
          (blockedCategories ? `ブロックカテゴリ: ${blockedCategories}。` : '') +
          '質問の表現を見直し、機微情報を含めない形で再送してください。';
      } else if (blockReason === 'OTHER') {
        reply =
          'Google Gemini のポリシーまたはシステム判定により応答が生成されませんでした。表現を言い換えて再度お試しください。';
      } else if (blockReason === 'RECITATION') {
        reply =
          '著作権などの制限により内容が返せません。概要や要点を聞く形で再度お試しください。';
      } else if (blockReason === 'MAX_TOKENS') {
        reply =
          '応答が長くなりすぎたため途中で終了しました。質問をもう少し具体的に分割して再度お試しください。';
      } else {
        reply =
          'Gemini API から有効な応答を取得できませんでした。時間をおいて再試行するか、別の表現でご相談ください。';
      }
    }

    const responseBody = {
      reply,
      model: modelName,
    };

    if (process.env.NODE_ENV !== 'production') {
      responseBody.meta = {
        finishReason,
        blockReason,
        continuationApplied,
        promptFeedbacks,
      };
    }

    res.json(responseBody);
  } catch (error) {
    console.error('Gemini API error:', error);
    const messageText =
      error?.response?.error?.message ||
      error?.message ||
      'Gemini API への問い合わせに失敗しました。';
    res.status(500).json({ error: messageText });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 PL Chatbot server running on http://localhost:${port}`);
});
