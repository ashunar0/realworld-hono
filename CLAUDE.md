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
│   │   ├── index.ts            ← Articles CRUD + tagList + tag/favorited filter + favorite + feed + comments を route
│   │   └── comments/
│   │       └── index.ts        ← Comments（basePath で :slug 集約）
│   ├── tags/
│   │   └── index.ts            ← GET /api/tags
│   └── profiles/
│       └── index.ts            ← GET /:username + POST/DELETE /:username/follow（basePath で :username 集約）
├── db/
│   ├── index.ts                ← drizzle wrapper
│   └── schema.ts               ← users / articles / comments / tags / article_tags / favorites / follows + relations
├── middleware/
│   ├── auth.ts                 ← authMiddleware（必須）/ optionalAuthMiddleware（任意）+ c.set("userId")
│   └── validator.ts            ← validateJson / validateQuery
├── lib/
│   ├── slug.ts                 ← title -> slug
│   ├── article.ts              ← toArticleJson(article, author, tagList?, favorited?, favoritesCount?, following?)
│   ├── author.ts               ← toAuthorJson(user, following) ← profile / article.author で共通
│   ├── comment.ts              ← toCommentJson(comment, author)
│   └── jwt.ts                  ← signToken
└── schemas/
    ├── user.ts                 ← zod + types
    ├── article.ts              ← zod + types（articlesQuerySchema / feedQuerySchema 含む）
    ├── comment.ts              ← zod + types
    └── profile.ts              ← Profile / ProfileResponse 型のみ（GET なので zod なし）

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
| 9 | Profiles + Follow + Feed（自己参照多対多 + relationName + toAuthorJson 抽出 + 既存 articles の `author.following` 実値化） | ✅ |
| 10-A | **spec 細部の精度上げ**（A-1 self-follow 禁止 [DB CHECK + handler 422] / A-3 signup/PUT 重複検知 + 空白 trim、A-2 self-favorite と A-4 エラーメッセージ統一は意図的に skip） | ✅ |
| **11** | **未定（次回ここで方針決定）** | ⏳ |

## Step 10-A で身についたこと（直近サマリ）

- **SQLite の制約後付け = テーブル再作成 dance**：SQLite は `ALTER TABLE ADD CONSTRAINT` をサポートしてない → drizzle-kit が `__new_table` を作って rename する迂回 SQL を自動生成する。Postgres / MySQL なら 1 行で済む。
- **`${t.col}` の qualified name は SQLite rename と相性が悪い**：drizzle は `${t.col}` を `"table"."col"` 形式で展開する。SQLite はテーブル rename 時に CHECK 式の中のテーブル名を追従しない → 壊れる。**SQLite の CHECK 制約は column 名直書きで書く**（`sql\`follower_id != following_id\``）。
- **callback の戻り値は array 推奨**：`(t) => [primaryKey(...), check(...)]`。object 形式（`{ pk: ..., check: ... }`）は legacy。array なら同種の制約を複数並べられて key 命名コストもなし。
- **defense in depth**：DB CHECK + handler 422 の両層で同じ制約を防御する設計。どちらか片方が抜けても守られる。
- **重複検知は事前 SELECT 派**：error catch より UX 良い（どのフィールドが衝突したか明示できる）。race condition は個人開発レベルでは割り切り。
- **`ne(users.id, userId)` で「自分以外」を除外**：PUT /user で自分の email/username を維持する場合に誤検知しないため。
- **password には `.trim()` を入れない**：エントロピー保持のため。ユーザーが意図したスペース付き password を尊重（NIST 800-63B が passphrase 推奨）。identifier（email/username）と content（title/body）は trim する。
- **`{ errors: { body: [...] } }` 形式は既に十分統一されてた**：Step 10-A-4 をスキップする判断（spec の field-keyed への大規模 refactor は別 Step）。

## Step 11 候補（次回相談）

RealWorld spec の主要 endpoint は完成、Step 10-A で精度も上がった。次は方向の選択肢：

| 案 | 内容 | コメント |
|---|---|---|
| **B** | Bruno collection (`gothinkster/realworld` の `specs/api/bruno/`) でテスト走らせる | spec 準拠かどうか自動検証、CI 化も視野 |
| **C** | bun test で integration test を書く | テスト書く練習、ハーネス整備 |
| **D** | frontend integration | 親リポの frontend と組み合わせて E2E |
| **E** | refactor / cleanup | ON CONFLICT のロジックを helper 化、handlers のさらなる DRY 化 |
| **F** | 別 FW で書き直し（比較） | 同じ spec を Fastify / Express / Elysia などで実装して比較 |

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
- 抽出済み: validateJson / validateQuery / authMiddleware / optionalAuthMiddleware / toArticleJson / toAuthorJson / toCommentJson / generateSlug / signToken

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
2. `git log --oneline` で commit history 把握（Step 10-A まで完了している）
3. ユーザーは Step 11 の方針を相談する状態で来るはず → 上の **Step 11 候補** 表を見せて選ばせる
4. もしユーザーが具体的に「次これ」と言ってきたら、Step 5〜10 の流れ（schema → migration → endpoint → 動作確認 → commit）を踏襲
5. **既存パターンは全て確立**：chain + basePath、eager load (`with: { ... }`)、ON CONFLICT DO NOTHING、optional / required auth、relationName、toAuthorJson / toArticleJson / toCommentJson、CHECK 制約は column 名直書き、重複検知は事前 SELECT
6. dev server は `bun run --hot src/index.ts` で起動、構造変更（route 追加 / sub-app 追加）後は再起動必須
7. このプロジェクトはコーチモードがデフォルト（明示されなくても closed question + 段階的に進める。memory 参照）

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
