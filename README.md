## 製品安全・PL相談チャットボット

Google Gemini 2.5 Pro API を利用し、製品安全・製造物責任（PL）、リコール対応、品質不正に関するリスク整理と初動方針の検討を支援するチャットボットです。`sample.html` は UI リファレンス兼トップページとして利用できます。

### セットアップ

1. 依存パッケージのインストール
   ```bash
   npm install
   ```
2. 環境変数を設定  
   `.env.example` をコピーして `.env` を作成し、Google AI Studio / Vertex AI で発行した Gemini API キーを設定します。
   ```bash
   cp .env.example .env
   # .env を編集して GEMINI_API_KEY=<your key> を入力
   ```
3. 開発サーバの起動
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:3000` を開くとチャット画面が表示されます。

### プロジェクト構成

- `public/index.html` / `sample.html`: UI 本体
- `public/app.js`: チャット画面用クライアントスクリプト
- `server.js`: Express ベースの API サーバ（Gemini 2.5 Pro と連携）
- `.env`: Gemini API キーなどのシークレット

### Render でのデプロイ手順

1. GitHub リポジトリに本プロジェクトをプッシュします。
2. [Render](https://render.com/) にログインし **New +** → **Web Service** を選択。
3. リポジトリを選び、以下の設定を入力します。
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free でも可（利用状況に応じて調整）
4. **Environment Variables** に Gemini API キーを登録します。
   - `GEMINI_API_KEY`: Google AI Studio で発行したキー
   - （任意）`GEMINI_MODEL`: 既定は `gemini-2.5-pro`
5. Deploy を開始するとビルドが走り、公開 URL が自動発行されます。

### セキュリティと運用上の注意

- Gemini API キーは `.env` や Render の環境変数で安全に管理し、クライアント側へ露出させないでください。
- 生成 AI の回答は参考情報です。法的最終判断や公的発表前には専門家／主管庁へ必ず確認してください。
- 機密・個人情報を入力しない旨を利用者へ告知してください。

### カスタマイズのヒント

- `public/app.js` 内の `welcome` メッセージやスロットリング設定を変えると UX が調整できます。
- `server.js` の `systemInstruction` や `generationConfig` を調整して、回答のトーン・詳細度・語調を最適化できます。
- 相談ログを保存したい場合は、サーバー側でデータベース（例: PostgreSQL、Firestore 等）と連携する処理を追加してください。

