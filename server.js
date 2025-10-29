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
    return res.status(400).json({ error: 'message フィールドにテキストを指定してください。' });
  }

  const normalizedHistory = Array.isArray(history) ? history : [];
  const geminiHistory = [];
  let seenFirstUser = false;
  normalizedHistory.forEach((item) => {
    if (!item?.role || !item?.content) return;
    if (item.role === 'assistant' && !seenFirstUser) {
      return;
    }
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
    const reply = result?.response?.text?.() || '';

    if (!reply) {
      return res.status(502).json({ error: 'Gemini API から有効な応答が得られませんでした。' });
    }

    res.json({ reply, model: modelName });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({
      error: error.message || 'Gemini API への問い合わせに失敗しました。',
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 PL Chatbot server running on http://localhost:${port}`);
});
