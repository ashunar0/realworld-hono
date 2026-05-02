## プロジェクト概要

**RealWorld (Conduit) backend** を Hono で実装する **学習プロジェクト**。

- リポジトリ: `~/dev/sample/real-world/backend/hono`
- 親リポジトリ: `~/dev/sample/real-world/{frontend,backend}` ← 同じ RealWorld を複数 FW で実装して比較する構造
- 仕様: https://realworld-docs.netlify.app
- Postman → Bruno collection: `gothinkster/realworld` repo の `specs/api/bruno/`

## 学習目的

ユーザー（あさひ）が **「Beat Lab で backend を Claude に scaffold されて理解できなかった」** という grievance に対する、**自分の手で書き直すリハビリ**。

- 動かすことより **言語化できる理解** を優先
- 手書きで触ってから ORM へ migration（生 SQL → Drizzle の進化を体験）
- Step ごとに動作確認 → 言語化 → 次へ
- **scaffold で全部生成しない**、endpoint ずつ書く

## tech stack

- runtime: Bun
- web: Hono `^4.12.x`
- DB: bun:sqlite (`db.sqlite`)
- ORM: Drizzle (`drizzle-orm@^0.45`, `drizzle-kit@^0.31`)
- validation: zod `^4.4` + `@hono/zod-validator`
- auth: `hono/jwt` (HS256) + `Bun.password` (argon2id)
- migration runner: `scripts/migrate.ts`（drizzle-kit migrate が bun:sqlite 非対応のため自作）

## ファイル構成

```
src/
├── index.ts                    ← トップ。chain で sub-app 統合、AppType export
├── features/
│   ├── users/
│   │   └── index.ts            ← signup / login / GET PUT /user
│   ├── articles/
│   │   ├── index.ts            ← Articles CRUD + tagList + tag/favorited filter + favorite POST/DELETE + comments を route
│   │   └── comments/
│   │       └── index.ts        ← Comments（basePath で :slug 集約）
│   └── tags/
│       └── index.ts            ← GET /api/tags
├── db/
│   ├── index.ts                ← drizzle wrapper
│   └── schema.ts               ← users / articles / comments / tags / article_tags / favorites + relations
├── middleware/
│   ├── auth.ts                 ← authMiddleware（必須）/ optionalAuthMiddleware（任意）+ c.set("userId")
│   └── validator.ts            ← validateJson / validateQuery
├── lib/
│   ├── slug.ts                 ← title -> slug
│   ├── article.ts              ← toArticleJson(article, author, tagList?, favorited?, favoritesCount?)
│   ├── comment.ts              ← toCommentJson(comment, author)
│   └── jwt.ts                  ← signToken
└── schemas/
    ├── user.ts                 ← zod + types
    ├── article.ts              ← zod + types
    └── comment.ts              ← zod + types

drizzle/                        ← 自動生成 migration
scripts/migrate.ts              ← bun-native migration runner
drizzle.config.ts               ← drizzle-kit 設定
```

## 起動方法

```bash
bun run dev          # localhost:3000、--hot だが route 構造変更時は再起動必要
bun run db:generate  # schema.ts → drizzle/000X_xxx.sql
bun run db:migrate   # migration を DB に当てる
```

## 進捗（2026-05-02 時点）

| Step | 内容 | 状態 |
|---|---|---|
| 0 | Hono scaffold（手動）+ Bun template 同等 | ✅ |
| 1 | `POST /api/users` (signup) | ✅ |
| 2 | `POST /api/users/login` | ✅ |
| 3 | `GET /api/user` (current user) + auth middleware | ✅ |
| 4 | `PUT /api/user` (partial update + dynamic SQL) | ✅ |
| 4.5 | **Drizzle 化**（raw SQL → ORM、`as Type` 全廃） | ✅ |
| 5 | Articles CRUD（5 endpoint）+ author JOIN + filter + pagination | ✅ |
| 6 | Comments（3 endpoint）+ features/ 分割 | ✅ |
| 6.5 | **chain pattern 全層適用**（basePath で :slug 解消、`AppType` export） | ✅ |
| 7 | Tags（多対多、`tags` + `article_tags` + GET /api/tags + tag filter） | ✅ |
| 8 | Favorites（多対多、`favorites` + POST/DELETE /favorite + favorited/Count + ?favorited filter + optionalAuthMiddleware） | ✅ |
| **9** | **Profiles + Follow + Feed（次回ここから）** | ⏳ |

## 次回 (Step 9: Profiles + Follow + Feed) で実装するもの

RealWorld spec の Profiles / Follow / Feed：

| endpoint | 認証 | 概要 |
|---|---|---|
| `GET /api/profiles/:username` | optional | プロフィール取得（`following` 状態も返す） |
| `POST /api/profiles/:username/follow` | 必須 | フォローする |
| `DELETE /api/profiles/:username/follow` | 必須 | フォロー解除 |
| `GET /api/articles/feed` | 必須 | フォロー中ユーザーの記事一覧 |
| `GET /api/articles` / `:slug` | 既存 | `author.following` を実値で埋める |

### 必要な作業

1. `follows` テーブル schema 追加（自己参照多対多: `follower_id` × `following_id`、複合主キー、cascade）
2. relations: user.following / user.followers（同じテーブルを 2 方向で参照する練習）
3. `features/profiles/` を新設し chain で 3 endpoint を実装
4. GET /api/articles/feed を articles に追加（auth 必須・基本 list と似てるが「自分がフォロー中の author」で絞る）
5. `toAuthorJson` 抽出を検討（toArticleJson 内の author block を切り出して `following` を埋める）
6. 既存 GET /articles / GET /:slug の `author.following` を `optionalAuthMiddleware` の userId で計算

### 学習ポイント

- **自己参照テーブル**（user × user の多対多）で、relations の書き方が初挑戦の形になる
- **Feed = フィルタ済み一覧**：list endpoint と再利用可能な部分が出てくる
- ここまで進めると **Profile / Article / Comment / Favorite / Follow** の主要 5 オブジェクトの relations が揃う

## コーディング規約・確立済み pattern

### 受信〜返信のフロー（門番チェーン）

```
Request → authMiddleware（必要なら）→ validateJson/validateQuery（必要なら）→ handler
```

- `authMiddleware` は JWT verify + `c.set("userId", number)` まで
- `validateJson(schema)` / `validateQuery(schema)` で zod 検証 + 422 統一
- handler は **「通過済み」前提** で純粋ロジックに集中

### エラー response

すべて RealWorld spec 形式：

```json
{ "errors": { "body": ["..."] } }
```

| code | 用途 |
|---|---|
| 401 | 未認証（token 無し / 改ざん / 期限切れ） |
| 403 | 認証済みだが権限なし（他人のリソース） |
| 404 | リソース無し |
| 422 | validation エラー |
| 204 | DELETE 成功 |

### DB 操作

- INSERT / UPDATE: `[row] = await db.X(...).returning()` + `if (!row) throw`
- SELECT 単体: `findFirst({ where, with: { author: true } })` で JOIN
- SELECT 複数: `findMany({ where, with, limit, offset, orderBy })`
- DELETE: `db.delete(table).where(...)`（**`.where(...)` 必須**）
- count: `db.select({ total: count() }).from(...)`
- 動的 WHERE: `conditions.push(eq(...))` → `and(...conditions)`

### 命名 / 型

- DB カラム名は `snake_case`、TS field は `camelCase`、schema.ts で対応付け
- request 型: zod から `z.infer<typeof xxxSchema>`
- DB row 型: schema.ts の `typeof users.$inferSelect`
- response 型: 手書き（API 契約として明示）
- `import type` で type-only import、value と type を1行で取り出すなら `{ value, type X }` 構文
- response の shape 検証は `as` でなく `satisfies`

### refactor

- **rule of 3**：3回目の重複で抽出
- 抽出済み: validateJson / validateQuery / authMiddleware / optionalAuthMiddleware / toArticleJson / toCommentJson / generateSlug / signToken

### chain pattern（Step 6.5 で全層適用済み）

- **全 sub-app は `new Hono().method(...)...` の chain 形式**で書く
  - 戻り値を捨てない＝型情報が積み上がる
  - `.route(prefix, subApp)` も chain に含める
- `src/index.ts` トップでは `const routes = app.method(...).route(...)...` で別変数 → `export type AppType = typeof routes`
- ネスト sub-app に親 prefix の `:param` を持たせるには **子側 `.basePath('/parent/:param/...')`** で集約する
  - 親側のマウントは `.route('/', subApp)` で prefix 空
  - これで子 handler 内 `c.req.param("param")` の型が `string` になり、narrow 不要
- 新しい sub-app を追加するときも同じ pattern を踏襲

## ユーザー（あさひ）の学習スタイル

- **段階的に進める**（一気に scaffold しない、1 endpoint ずつ）
- **書いたコードに対して質問が多い** → 答え合わせ風に進む
- 答えるときは **「その行が何をしてるか」を JS/SQL レベルで言語化**して説明
- **疑問を反実仮想で立てる**癖がある（「もし X じゃなかったら？」）→ 良い signal、深掘る
- 自分で言語化した内容を確認する流れを大事にする
- TS / JS の文法（destructure、spread、satisfies など）を1個ずつ深掘りすることを好む
- 実装前に **設計判断の選択肢を並べて選ばせる**と腑に落ちる
- コーチモード設定可能（CLAUDE.md 参照）。明示されない限り通常モード（効率重視）

## 次回 Claude セッションへの指示

1. このファイルを最初に読む
2. `git log --oneline` で commit history 把握
3. ユーザーは "Step 9 の Profiles + Follow + Feed を作りたい" 状態で来るはず
4. 「最初に schema 作って migration して、それから endpoint」という Step 5/6/7/8 の流れを踏襲
5. **eager load pattern** が定着済み：`with: { ... }` で N+1 を避ける（Step 8 の `favoritedBy: true` を踏襲、follows でも同様）
6. **chain pattern + basePath は適用済み**。新しい `features/profiles/` も chain で書き、`/api` prefix は親 index.ts 側で付与
7. **ON CONFLICT DO NOTHING** が follow の冪等な追加でも使える（Step 7 tag、Step 8 favorite で確立）
8. **`optionalAuthMiddleware` が用意済み**：GET /api/profiles/:username の `following` 計算でこれを使う（token あれば自分の follow 状態を返す）
9. dev server は `bun run --hot src/index.ts` で起動、構造変更（route 追加 / sub-app 追加）後は再起動必須

---

## Bun-specific guidance（このプロジェクトの runtime 規約）

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### APIs

- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.password.hash` / `Bun.password.verify` for password hashing (argon2id default).
- `Bun.env.X` for env vars.
