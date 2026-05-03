## プロジェクト概要

**RealWorld (Conduit) backend** を Hono で実装する **学習プロジェクト**。

- リポジトリ: `~/dev/sample/real-world/backend/hono`
- 親リポジトリ: `~/dev/sample/real-world/{specs,backend,frontend}` ← 同じ RealWorld を複数 FW で実装して比較する構造
- 仕様: https://realworld-docs.netlify.app
- Bruno collection: `~/dev/sample/real-world/specs/bruno/`（`gothinkster/realworld` の `specs/api/bruno/` をコピー、151 ファイル、`bru run --env local` で全 endpoint spec 準拠検証）

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
├── features/                   ← ★ Step 12-B で全 feature 4 層分離完了
│   ├── articles/
│   │   ├── index.ts            ← route 層（thin、c の入出力 + service 呼び出し + status code mapping のみ）
│   │   ├── service.ts          ← orchestration 層（c も db も触らない、tagged union で error variant 表現）
│   │   ├── repository.ts       ← data access 層（articleRepo: 全 DB 操作集約）
│   │   ├── presenter.ts        ← toArticleJson / toArticleListJson（Step 12-B で lib から移動）
│   │   ├── slug.ts             ← generateSlug（Step 12-B で lib から移動）
│   │   └── comments/
│   │       ├── index.ts        ← route 層（basePath で :slug 集約）
│   │       ├── service.ts      ← createComment / listComments / deleteComment
│   │       ├── repository.ts   ← commentRepo: create / listByArticleId / findById / delete
│   │       └── presenter.ts    ← toCommentJson（Step 12-B で lib から移動）
│   ├── profiles/
│   │   ├── index.ts            ← route 層（basePath で /profiles/:username 集約）
│   │   └── service.ts          ← getProfile / followUser / unfollowUser（DB 操作は userRepo に依存）
│   ├── tags/
│   │   └── index.ts            ← GET /api/tags（小規模なので分離せず）
│   └── users/
│       ├── index.ts            ← route 層（signup / login / GET PUT /user）
│       ├── service.ts          ← signupUser / loginUser / getCurrentUser / updateUser
│       ├── repository.ts       ← userRepo: 全 user / follows DB 操作（feature 越境利用あり）
│       ├── presenter.ts        ← toAuthUserJson（Step 12-B で lib から移動）
│       └── jwt.ts              ← signToken（Step 12-C で lib から移動、users 専用）
├── db/
│   ├── index.ts                ← drizzle wrapper
│   └── schema.ts               ← users / articles / comments / tags / article_tags / favorites / follows + relations
├── middleware/
│   ├── auth.ts                 ← authMiddleware（必須）/ optionalAuthMiddleware（任意）+ c.set("userId")
│   └── validator.ts            ← validateJson / validateQuery
├── lib/                        ← 真の共有 helper のみ（feature 横断で実際に使われるもの）
│   └── author.ts               ← toAuthorJson + isFollowing。articles + profiles の両方が使う真の共有
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

## 進捗（2026-05-03 時点）

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
| 10-A | **spec 細部の精度上げ**（A-1 self-follow 禁止 [DB CHECK + handler 422] / A-3 signup/PUT 重複検知 + 空白 trim） | ✅ |
| 11-B | **Bruno collection で spec 100% 準拠**（149/149 緑） | ✅ |
| 12-A | **articles feature の 4 層分離**（route / service / repository / presenter）8 endpoint × 10 commits、`articles/index.ts` 484 → 180 行、Bruno 149/149 緑維持。userRepo も新設（feature 越境の作法確立） | ✅ |
| 12-B | **comments / profiles / users feature の 4 層分離 + lib 再配置**（8 commits）。`isFollowing` helper 抽出（articles/profiles 共有）、`toAuthUserJson` presenter 新設、handler 行数: profiles 95→67 / comments 114→76 / users 179→93。`lib/{article,comment,slug,user}.ts` を feature 配下へ移動、`lib/{author,jwt}.ts` のみ残す。Bruno 149/149 緑維持 | ✅ |
| 12-C | **`lib/jwt.ts` を `features/users/jwt.ts` へ move**。signToken は users 専用（4 箇所で使用、middleware からは未使用）と判明 → Step 12-B の lib 配置基準に従い feature 配下へ。`middleware/auth.ts` は self-contained のため触らず、env 読み出し 1 行の "重複" は許容（DRY 違反ではなく独立参照）。Bruno 149/149 緑維持 | ✅ |
| **次** | **bun test 導入（型紙だけ、ボトムアップで感覚掴む）→ Hono + Inertia + React へ進む** | ⏳ |

## Step 12-B で身についたこと（直近サマリ）

### 型紙の "適用フェーズ" は速い

- articles は型紙確立フェーズで 10 commits 細刻みだったが、profiles / comments / users は型紙適用フェーズなので **endpoint 単位 or feature 単位の粗い刻みで OK**
- profiles 3 commits / comments 1 commit / users 2 commits / lib 再配置 1 commit + chore 1 commit = **計 8 commits で 3 feature 完遂**
- ★ 教訓：「型紙確立 = 細刻み」「型紙適用 = 粗刻み」と意識的に切り替える。同じ流儀を続ける必要はない

### `lib/` の判断基準（実証）

| 状態 | 配置 |
|---|---|
| 1 feature でしか使わない | feature 配下（`features/X/presenter.ts` 等） |
| 2+ feature で **直接** import される真の共有 | `lib/` に残す |
| 1 feature が直接 import + 別 feature の lib が間接的に呼ぶ | **真の共有**（`lib/author.ts` が articles の presenter から内部 reuse される例） |

- profiles refactor の途中で「lib/* の中身は本当に共有されてるか」を `grep -rn "from.*lib/X"` で実測 → `author.ts` 以外は全部 single feature だった
- **CLAUDE.md の「lib = feature 横断 share」コメントが現実とズレてた → 移動の根拠**
- 全 feature が 4 層化された **後** に判断するのがクリア（途中だと "真の共有" 判定が早すぎる）

### Profile vs User resource の分離

- 同じ `users` テーブル row でも、**API 上は別 resource** として表現する
- `toAuthorJson(author, following)` → `Profile` shape: `{ username, bio, image, following }`（**viewer から見た他人**、`email` / `token` なし）
- `toAuthUserJson(user, token)` → `User` shape: `{ email, token, username, bio, image }`（**認証された自分自身**、`following` なし）
- 用途: `toAuthorJson` は article.author / comment.author / GET `/profiles/:username`、`toAuthUserJson` は signup / login / GET `/user` / PUT `/user`
- ★ 教訓：DB の物理 row と API の論理 resource は別レイヤー。同じ row でも見る相手によって違う shape を作る

### `isFollowing` helper の eager-load 流儀

- `viewerId !== undefined && user.followers.some((f) => f.followerId === viewerId)` が articles の `presentArticleWithViewerContext` / `presentArticleListItem` / profiles の `getProfile` で 3 回登場 → rule of 3 で `lib/author.ts` に抽出
- **eager-load パターン** が前提：`with: { followers: true }`（or `author: { with: { followers: true } }`）で取った後、in-memory `.some(...)` で判定。N+1 回避
- `userRepo` には `findByUsernameWithFollowers` のように "用途別に別メソッド" を切る（articles の `findBySlug` / `findBySlugWithRelations` 流儀と同じ）
- POST /follow / DELETE /follow では follow 状態が **自明** (`true` / `false`)、isFollowing 不要。boolean 単発確認メソッド (`isFollowedBy` の親戚) は今のところ要らなかった

### feature 越境の "登場頻度"

- articles の service が `userRepo.findById` を呼ぶ
- comments の service が `articleRepo.findBySlug` + `userRepo.findById` を呼ぶ
- profiles の service が **userRepo だけ** 呼ぶ（自分の repo を持たない、user feature の薄い view として割り切り）
- **「データの所有者と repo を揃える」 + 「越境は service 層で吸収」** が一貫したルール
- profile 用 `profileRepo` を作らないのは: follow 操作の返却値が user ドメイン由来（target user object）なので user feature に属するのが自然、という論拠

### handler の最小形は 5 つの仕事（再確認）

1. middleware chain
2. 入力を `c` から取り出す
3. service を呼ぶ
4. tagged union → HTTP status マッピング
5. `c.json` で包む

- これ以下に削ると Hono 公式 NG の controller 化に踏み込む
- 4 feature 全部でこの形に揃った → reference として読みやすい

### `lib/jwt.ts` ↔ `middleware/auth.ts` の secret 重複（Step 12-C で解消）

- 当初は「`signToken` と `verify` で `JWT_SECRET` を 2 箇所重複 → auth ドメインに統合」と考えた
- **実態を grep して再評価**：`signToken` は `features/users/service.ts` の **4 箇所のみ**（signup / login / getCurrentUser / updateUser）、middleware では未使用
- → `signToken` は **users feature 専用**、Step 12-B の lib 配置基準（"1 feature でしか使わない → feature 配下"）に該当
- → **`features/users/jwt.ts` に move**、`middleware/auth.ts` は self-contained で触らず
- env 読み出し（`Bun.env.JWT_SECRET ?? "dev-fallback"` 1 行）の重複は **DRY 違反じゃなく独立参照**として許容
- ★ 教訓：「重複してるから集約」と短絡せず、**実際の使用箇所を grep で確認**してから配置を決める。"重複行数 = 統合の justifier" は弱い signal、"使用 feature の数" の方が強い

### 既知のスタイル（再確認）

- handler / service の各処理ブロックに **phase コメント**（`// 入力値を取得` `// XX を判定` 等）。inline 引数渡しに切り詰めない（あさひスタイル）
- service の戻り値は `{ kind: "ok" as const, ... }` で discriminated union
- repository は `<feature>Repo` で object literal export
- 単一 feature でしか使わない helper は **service.ts に inline 化** が妥当（generateSlug は独立 file 維持を選択 = あさひの判断、slot 命名一貫優先）

## Step 12-A で身についたこと（直近サマリ）

### Hono 哲学の解釈

- **Hono は HTTP 層しか opinion を持たない** "thin router framework"。Express / Koa / Fiber 系の系譜。Rails / NestJS のような full-stack opinionated FW とは違う
- 公式が嫌う "Don't Create a Controller" は **「handler 関数を別ファイルに切り出して RPC 型を切ること」** が NG という意味。**「pure な service / repository / presenter を関数として外に出す」のは推奨パターン**
- なので **HTTP 層は Hono の chain + sub-app + factory.createHandlers を活用、その下のビジネス層は自前で組む** のが Hono 流の大規模化

### 4 層分離の責務テーブル

| 層 | 触れて良いもの | 触れちゃダメなもの |
|---|---|---|
| ① route (`features/X/index.ts`) | `c.req.*` / `c.get` / `c.json` / service 呼び出し / tagged union → status code mapping | `db.*`、業務判定、response shape 組み立て |
| ② service (`features/X/service.ts`) | repository 呼び出し、業務判定、presenter 呼び出し、Drizzle helpers (`eq` / `and` / `inArray` / `SQL` 型) | `c` 全般、`db.query.*` / `db.select` の実行、HTTP status code |
| ③ repository (`features/X/repository.ts`) | `db.*`、Drizzle | 業務判定、response shape、`c` |
| ④ presenter (`lib/article.ts` 等、共有) | DB row → API 型の純変換 | `db.*`、`c`、業務判定 |

### tagged union (discriminated union) パターン

```ts
// service.ts
export async function getArticleBySlug(slug: string, viewerId: number | undefined) {
  const article = await articleRepo.findBySlugWithRelations(slug);
  if (!article) return { kind: "not_found" as const };
  // ...
  return { kind: "ok" as const, article: presented };
}

// route.ts (handler)
const result = await getArticleBySlug(slug, userId);
if (result.kind === "not_found") return c.json({ errors: { article: ["not found"] } }, 404);
return c.json({ article: result.article } satisfies ArticleResponse);
```

ポイント：
- **`as const` 必須**（`kind: "not_found"` が `kind: string` に widening するのを防止、discriminated union 成立に必要）
- **戻り値型は推論に任せる**（明示しないことで union を綺麗に保つ）
- variant が増えても route の `if` を 1 個追加するだけ
- **list/feed は variant 不要なので tagged union 使わず `ArticlesResponse` を直返し**（例外ルール、return 型を明示すれば `articles: []` が widening しない）

### feature 越境の作法

- 別 feature の DB 操作が必要なら、**その feature 内に repository を新設して import**
- 例: articles の service が user 取得する → `features/users/repository.ts` の `userRepo.findById` / `findByUsername` / `findFollowingIds` を使う
- **`articleRepo` に user 操作を混ぜない** = ドメイン汚染を避ける

### list 用 presenter は in-memory（N+1 回避）

```ts
// /:slug 用（DB を await）
async function presentArticleWithViewerContext(article, viewerId, favorited) {
  const favoritesCount = await articleRepo.countFavorites(article.id);  // ← DB
  const following = ... article.author.followers.some(...);              // ← in-memory
  return toArticleJson(...);
}

// list 用（同期、eager load 済み）
function presentArticleListItem(article, viewerId) {
  const favorited = ... article.favoritedBy.some(...);   // ← in-memory
  const favoritesCount = article.favoritedBy.length;     // ← in-memory
  const following = ... article.author.followers.some(...);
  return toArticleListJson(...);
}
```

list は `with: { ..., favoritedBy: true }` で eager load しているので `articleRepo.countFavorites` を呼ぶ必要なし。`/:slug` 系は単体取得なので追加 query で OK。**同じ "presenter" でも単体 vs list で実装戦略が違う**のがこのパターンの面白いところ。

### Drizzle pragmatism

- 厳密な hexagonal なら service が Drizzle (`eq` / `and` / `inArray` / `SQL` 型) を知るのは NG
- このプロジェクトでは **pragmatic に許容**：`articleRepo.list(where: SQL | undefined, ...)` で where 句を service から渡す形
- 理由: Drizzle はプロジェクト固定で抜くつもりがない、where 句の組み立てを毎回 repo に新メソッド作るのは爆発する

### 命名

- handler 側は `c.get("userId")` で取って `userId` 変数に
- service 内では **`viewerId`**（このリクエストを見てる人）と命名 → "誰の userId？" の混乱回避
- repository は `<feature>Repo` (`articleRepo` / `userRepo`) で object literal export

### handler は最終形

handler に残るのは 5 つの仕事のみ（これ以上削ると Hono 公式 NG の controller 化に踏み込む）：
1. middleware を chain（Hono の責務）
2. 入力を `c` から取り出す（route 必須）
3. service を呼ぶ（オーケストレーション）
4. tagged union → HTTP status 変換（HTTP 層の責務）
5. `c.json` で包む

### 編集スタイル

- **必ず "ゆっくり 1 ファイルずつ"** が好み: stage 区切って apply → type check → 確認、を繰り返す
- **handler / service の各処理ブロックには phase コメント**: `// 入力値を取得` `// 記事データを取得` `// XX を判定` 等。inline 引数渡しに勝手に切り詰めない（memory 参照）
- 各 mini-step 後に `bunx tsc --noEmit` + Bruno (149/149) で必ず verify
- commit は **mini-step ごと or 関連まとめて** （好みに応じて、必ず確認してから）

## Step 11-B で身についたこと（直近サマリ）

- **Bruno = git-friendly な API client + collection runner**（Postman / Insomnia / Thunder Client 系の OSS 版）。RealWorld 公式が `specs/api/bruno/` に **実行可能 spec** を提供しているので、**自前で test scenario を書く必要なし**で spec 準拠を客観確認できる。
- **CLI で一括実行**：`bun add -g @usebruno/cli` → `bru run --env local` で 149 リクエストを 11 秒で全部走らせる。比較プロジェクトでは collection をそのまま使い回せるのが最大の利点。
- **spec から学んだ "RealWorld の作法"**：
  - **POST create は 201 Created**（signup, article, comment）。login / favorite / follow は 200。
  - **error response は field-keyed**：`{errors: {<field>: [...]}}`。`token`/`credentials`/`article`/`comment`/`profile`/`email`/`username`/`title`/`description`/`body` 等。
  - **重複は 409 Conflict**（422 ではない）+ `["has already been taken"]`
  - **認証失敗は 401 + credentials key**（validation の 422 と区別）+ `["invalid"]`
  - **validation 422** + `["can't be blank"]`（Rails 流の文言）
  - **404 / 403** も resource 名キーで `["not found"]` / `["forbidden"]`
- **datetime は ISO 8601** で返す。SQLite default の `(datetime('now'))` は秒単位 + スペース区切りで spec 違反 → INSERT/UPDATE で `new Date().toISOString()` を明示渡し、表示時 `toIso(s)` で両形式（SQLite default と ISO）を吸収。
- **空文字 → null normalize**：spec は PUT /user の bio / image を「`""` を渡したら null として保存」と期待。zod じゃなく handler 層で `normalizeNullable` 関数で対応。
- **article list は body フィールドを除外**：summary 用 shape。`toArticleListJson(...args)` で `toArticleJson` の結果から `{body, ...rest}` で destructure。型は `Omit<ArticleResponse["article"], "body">`。
- **orderBy stable**：`desc(createdAt)` だけだと同秒で順序不安定 → `[desc(createdAt), desc(id)]` で tiebreak。
- **zod の制約順序が大事**：`z.string().email()` は空文字を「`must be a valid email`」と返す → `min(1, "can't be blank").email(...)` の順にして空文字は blank として弾く。`min(8)` も同様で、先に `min(1, "can't be blank")` を入れる。

## Step 10-A で身についたこと

- **SQLite の制約後付け = テーブル再作成 dance**：SQLite は `ALTER TABLE ADD CONSTRAINT` をサポートしてない → drizzle-kit が `__new_table` を作って rename する迂回 SQL を自動生成する。Postgres / MySQL なら 1 行で済む。
- **`${t.col}` の qualified name は SQLite rename と相性が悪い**：drizzle は `${t.col}` を `"table"."col"` 形式で展開する。SQLite はテーブル rename 時に CHECK 式の中のテーブル名を追従しない → 壊れる。**SQLite の CHECK 制約は column 名直書きで書く**（`sql\`follower_id != following_id\``）。
- **callback の戻り値は array 推奨**：`(t) => [primaryKey(...), check(...)]`。object 形式（`{ pk: ..., check: ... }`）は legacy。array なら同種の制約を複数並べられて key 命名コストもなし。
- **defense in depth**：DB CHECK + handler 422 の両層で同じ制約を防御する設計。
- **重複検知は事前 SELECT 派**：error catch より UX 良い（どのフィールドが衝突したか明示できる）。race condition は個人開発レベルでは割り切り。
- **`ne(users.id, userId)` で「自分以外」を除外**：PUT /user で自分の email/username を維持する場合に誤検知しないため。
- **password には `.trim()` を入れない**：エントロピー保持のため。ユーザーが意図したスペース付き password を尊重（NIST 800-63B が passphrase 推奨）。identifier（email/username）と content（title/body）は trim する。

## 次の方向（Step 12-C 後）

backend hono は一区切り。直近の方針：

- **次のセッション**: bun test を **型紙だけ** 書いて感覚掴む（ボトムアップ、ガチ網羅しない。Bruno で spec 準拠は既に取れてる）
- **その次**: **Hono + Inertia + React の monorepo を別ディレクトリで開始**（主軸）。Hono + Inertia adapter が出たての旬、あさひの SNS 発信で反応もらえてる路線、Hono 作者の認知獲得が外向きゴール
- **従軸**: React 単独 SPA（`frontend/react/`）はいつでもやれる長期素材として後回し

| 案 | 内容 | コメント |
|---|---|---|
| **★ 直近** | **bun test 型紙作り** | service 1 つで tagged union variant を触って bun test の感触掴む。30〜60 min |
| **★ 主軸** | **Hono + Inertia + React** monorepo を `~/dev/sample/real-world/fullstack/hono-inertia-react/` 等で開始 | 旬がある。Hono Inertia adapter + React で SPR/SPA。Vue / Preact も実験余地あり |
| 従軸 | React 単独 SPA を `frontend/react/` で | 純粋な React の流儀比較。常温素材なので焦らない |
| D | 別 backend FW で書き直し（Rails / Elysia / Fastify など） | layered なので比較しやすい |
| G | 比較メトリクス計測（行数、起動時間、bundle size、応答時間） | 比較プロジェクト追加後に |
| 微調整 | `kind → status` の helper 化、`factory.createHandlers` で middleware DRY、`hc<AppType>` で frontend 用 client | 旨味少、後回し |

## コーディング規約・確立済み pattern

### 受信〜返信のフロー（門番チェーン）

```
Request → authMiddleware（必要なら）→ validateJson/validateQuery（必要なら）→ handler
```

- `authMiddleware` は JWT verify + `c.set("userId", number)` まで
- `validateJson(schema)` / `validateQuery(schema)` で zod 検証 + 422 統一
- handler は **「通過済み」前提** で純粋ロジックに集中

### エラー response

RealWorld spec 形式（**field-keyed**、Step 11-B で確定）：

```json
{ "errors": { "<field>": ["<message>"] } }
```

| code | 用途 | 形式例 |
|---|---|---|
| 401 (no token) | token 無し / 改ざん / 期限切れ | `{errors: {token: ["is missing"]}}` |
| 401 (login) | login 失敗（unknown email / wrong password） | `{errors: {credentials: ["invalid"]}}` |
| 403 | 他人のリソースを編集しようとした | `{errors: {article\|comment: ["forbidden"]}}` |
| 404 | リソース無し | `{errors: {article\|comment\|profile\|user: ["not found"]}}` |
| 409 | 重複（signup / PUT /user の email/username） | `{errors: {email\|username: ["has already been taken"]}}` |
| 422 (validation) | zod 失敗 | `{errors: {<field>: ["can't be blank"]}}`（field 名は zod path の最後） |
| 422 (semantics) | self-follow など | `{errors: {profile: ["cannot follow yourself"]}}` |
| 201 | POST create 系（signup, article, comment） | body は通常の create response |
| 200 | login, follow, favorite, GET, PUT | |
| 204 | DELETE 成功 | body 無し |

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
- 抽出済み: validateJson / validateQuery / authMiddleware / optionalAuthMiddleware / toArticleJson / toArticleListJson / toAuthorJson / **isFollowing**（Step 12-B）/ toCommentJson / **toAuthUserJson**（Step 12-B）/ generateSlug / signToken / normalizeNullable（users service 内、Step 12-B で handler から移管）

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

1. このファイルを最初に読む（特に **「Step 12-B で身についたこと」** + **「Step 12-A で身についたこと」** が今後の作業の reference）
2. `git log --oneline -15` で commit history 把握。Step 12-B の refactor commit が 8 個並ぶ：
   ```
   b93b3e4 refactor: lib presenter / slug を feature 配下に再配置
   8662b24 refactor: GET /user + PUT /user を 3 層分離
   6a5762d refactor: signup + login を 3 層分離
   d5accd6 refactor: comments を 3 層分離（POST/GET/DELETE）
   4f56bdd chore: profiles / users handler に phase コメントを追加
   c2a0af9 refactor: POST/DELETE /profiles/:username/follow を 3 層分離
   0017ce1 refactor: GET /profiles/:username を 3 層分離
   964ef00 refactor: isFollowing helper を lib/author に抽出
   ```
3. **全 4 feature が 4 層分離済み + lib 再配置済み**の完成状態で来るはず。articles に加え、profiles / comments / users も reference として読める
4. backend hono は **Step 12-C で一区切り**。次の方向は 2 段階で確定済み：
   - **A. 直近 (backend 内)**: bun test を **型紙だけ** 書いて感覚を掴む（service 1 つで tagged union variant を試す程度、ガチ網羅しない。Bruno で spec 準拠は既に取れてる）。30〜60 min 想定
   - **B. その次 (主軸)**: backend hono は塩漬け、**Hono + Inertia + React の monorepo を別ディレクトリで開始**（`~/dev/sample/real-world/fullstack/hono-inertia-react/` 等）。あさひの SNS 発信路線、Hono 作者の認知獲得が外向きゴール
   - **C. 従軸 (後回し OK)**: React 単独 SPA を `frontend/react/` で。純粋な React の流儀比較、常温素材
5. 新 feature を将来追加する時の refactor 流れ（articles / Step 12-B で確立済み）：
   - **Stage A: repository に DB 操作を集約**（feature 内に `repository.ts` を新設、必要なら別 feature の repo を import）
   - **Stage B: service に orchestration を集約**（feature 内に `service.ts`、tagged union で error variant 表現、list 系は直返し）
   - **Stage C: handler を route 層だけに削る + 不要 import を cleanup → Bruno → commit**
   - presenter は **その feature でしか使わなければ feature 配下** (`features/X/presenter.ts`)、**真の共有なら `lib/`** に置く（lib 配置の判断基準は Step 12-B サマリ参照）
   - 型紙適用フェーズなので、**endpoint 単位 or feature 単位の粗い刻みで OK**（articles の細刻みに引きずられない）
   - 毎 stage で `bunx tsc --noEmit` + Bruno (149/149) verify
6. **「handler は最終形」**: 5 つの仕事（middleware chain / 入力取り出し / service 呼び出し / kind→status mapping / c.json）以下に削らない。controller 化は Hono 公式 NG
7. **既存パターン**：chain + basePath、eager load、optional / required auth、relationName、`toAuthorJson` / `isFollowing` / `toArticleJson` / `toArticleListJson` / `toCommentJson` / `toAuthUserJson`、CHECK 制約は column 名直書き、重複検知は事前 SELECT、error は field-keyed、datetime ISO 化、orderBy stable
8. **spec 準拠検証は Bruno**：`cd ~/dev/sample/real-world/specs/bruno && bru run --env local`（dev server 起動済みで）。149/149 緑が現状値、回帰検出に毎回走らせて良い
9. dev server は `bun run --hot src/index.ts` で起動。**構造変更（route 追加 / sub-app 追加）や lib の transform 変更後は --hot だと反映漏れがあるので再起動推奨**
10. このプロジェクトは **コーチモードがデフォルト**（明示されなくても closed question + 段階的に進める。memory 参照）
11. **handler / service の phase コメント保持**：あさひスタイルとして必須、勝手に削らない（memory 参照）

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
