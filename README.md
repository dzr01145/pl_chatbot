## 製品安全・PL相談チャットボット（静的サイト版）

Google Gemini 2.5 Pro API を利用し、製品安全・製造物責任（PL）、リコール対応、品質不正に関するリスク整理と初動方針の検討を支援するチャットボットです。

**この静的サイト版はクライアントサイドで動作し、バックエンドサーバーは不要です。**

### 特徴

- **完全静的**: サーバーレス・バックエンド不要で動作
- **簡単デプロイ**: GitHub Pages, Netlify, Vercel などの静的ホスティングサービスで即座にデプロイ可能
- **プライバシー重視**: API キーはブラウザのセッションストレージにのみ保存され、外部サーバーには送信されません
- **Gemini 2.5 Pro 統合**: 高度な AI アシスタント機能

### 使い方

1. **ローカルで試す**

   `public/index.html` をブラウザで直接開くか、簡易サーバーで起動します：

   ```bash
   # Python 3 の場合
   cd public
   python3 -m http.server 8000

   # Node.js の場合
   npx serve public
   ```

   ブラウザで `http://localhost:8000` を開きます。

2. **API キーの取得**

   [Google AI Studio](https://aistudio.google.com/app/apikey) で無料の Gemini API キーを取得してください。

3. **チャット開始**

   サイトにアクセスすると API キー入力画面が表示されます。取得した API キーを入力してチャットを開始できます。

### 静的ホスティングサービスへのデプロイ

#### GitHub Pages

1. GitHub リポジトリに本プロジェクトをプッシュ
2. Settings → Pages で "main" ブランチの `/public` フォルダを選択
3. 公開 URL が発行されます

#### Netlify

1. [Netlify](https://www.netlify.com/) にログイン
2. "Add new site" → "Import an existing project" を選択
3. リポジトリを選択し、以下の設定を入力：
   - **Publish directory**: `public`
   - **Build command**: (空欄)
4. Deploy を開始すると公開 URL が自動発行されます

#### Vercel

1. [Vercel](https://vercel.com/) にログイン
2. "New Project" を選択してリポジトリをインポート
3. 設定：
   - **Root Directory**: `public`
   - **Framework Preset**: Other
4. Deploy を開始すると公開 URL が自動発行されます

### プロジェクト構成

```
pl_chatbot/
├── public/
│   ├── index.html          # UI 本体（API キー入力フォーム含む）
│   └── app.js              # クライアントサイド JavaScript（Gemini API 直接呼び出し）
├── sample.html             # UI リファレンス
├── README.md               # このファイル
└── server.js               # （使用しません - 旧バックエンド版）
```

### セキュリティと運用上の注意

- **API キーの管理**: API キーはセッションストレージに保存されます（ページを閉じると消去）。共有端末では注意してください。
- **API キーの制限**: Google Cloud Console で API キーにリファラー制限（HTTPリファラー）を設定することを推奨します。
- **料金**: Gemini API の無料枠と料金体系を [Google AI Studio のドキュメント](https://ai.google.dev/pricing) で確認してください。
- **法的助言**: 生成 AI の回答は参考情報です。法的最終判断や公的発表前には専門家／主管庁へ必ず確認してください。
- **個人情報**: 機密・個人情報を入力しない旨を利用者へ告知してください。

### カスタマイズのヒント

- `public/app.js` 内の `MODEL_NAME` を変更して別の Gemini モデルを使用できます
- `systemInstruction` を編集して AI の回答スタイルを調整できます
- `public/index.html` でデザインやスタイルをカスタマイズできます
- クイック質問ボタンは `index.html` 内の `.suggestion-btn` 要素で編集できます

### トラブルシューティング

**Q: API キーを入力してもエラーが出る**
A: API キーが正しいか確認してください。また、Google AI Studio で API キーが有効化されているか確認してください。

**Q: CORS エラーが表示される**
A: ローカルで `file://` プロトコルで開いている場合、HTTP サーバー経由でアクセスしてください（上記「使い方」参照）。

**Q: レート制限エラーが出る**
A: Gemini API の無料枠の制限に達した可能性があります。しばらく待つか、Google Cloud Console で課金を有効化してください。

### ライセンス

このプロジェクトは自由に使用・改変できます。
