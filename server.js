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

const generationConfig = {
  temperature: 0.3,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 1024,
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

  const normalizedHistory = Array.isArray(history) ? history : [];
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
    const result = await chatSession.sendMessage(message);
    const candidates = result?.response?.candidates ?? [];
    const primary = candidates[0];
    const promptFeedback = result?.response?.promptFeedback;

    let reply = '';
    if (typeof result?.response?.text === 'function') {
      reply = result.response.text().trim();
    }
    if (!reply && primary?.content?.parts) {
      reply = primary.content.parts
        .map((part) => part?.text?.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (!reply) {
      const blockReason = primary?.finishReason || promptFeedback?.blockReason;
      if (blockReason === 'SAFETY') {
        const blockedCategories = promptFeedback?.safetyRatings
          ?.filter((rating) => rating?.blocked)
          ?.map((rating) => rating.category)
          ?.join(', ');
        reply =
          'Google Gemini が安全ポリシーにより応答をブロックしました。' +
          (blockedCategories
            ? `ブロックカテゴリ: ${blockedCategories}。`
            : '') +
          '質問の表現を見直し、機微情報を含めない形で再送してください。';
      } else if (blockReason === 'OTHER') {
        reply =
          'Google Gemini のポリシーまたはシステム判定により応答が生成されませんでした。表現を言い換えて再度お試しください。';
      } else if (blockReason === 'MAX_TOKENS') {
        reply =
          '応答が長くなりすぎたため途中で終了しました。質問をもう少し具体的に分割して再度お試しください。';
      } else if (blockReason === 'RECITATION') {
        reply =
          '著作権などの制限により内容が返せません。概要や要点を聞く形で再度お試しください。';
      } else if (primary?.finishReason === 'STOP') {
        reply =
          'Gemini API から有効な応答を取得できませんでした。時間をおいて再試行するか、別の表現でご相談ください。';
      } else {
        reply =
          'Gemini API から有効な応答を取得できませんでした。時間をおいて再試行するか、別の表現でご相談ください。';
      }
    }

    const responseBody = { reply, model: modelName };
    if (process.env.NODE_ENV !== 'production') {
      responseBody.promptFeedback = promptFeedback;
      responseBody.finishReason = primary?.finishReason;
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
