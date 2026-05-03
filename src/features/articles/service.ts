import { type SQL, and, eq, inArray } from "drizzle-orm";
import { articles } from "../../db/schema";
import { generateSlug } from "../../lib/slug";
import { toArticleJson, toArticleListJson } from "../../lib/article";
import { isFollowing } from "../../lib/author";
import type {
  ArticlesQuery,
  ArticlesResponse,
  CreateArticleRequest,
  FeedQuery,
  UpdateArticleRequest,
} from "../../schemas/article";
import { userRepo } from "../users/repository";
import { articleRepo } from "./repository";

// findBySlugWithRelations の戻り値から undefined を取り除いた型
type ArticleWithRelations = NonNullable<
  Awaited<ReturnType<typeof articleRepo.findBySlugWithRelations>>
>;

// articleRepo.list の要素型（favoritedBy も eager load 済み）
type ArticleListRow = Awaited<ReturnType<typeof articleRepo.list>>[number];

// favoritesCount + following を計算して toArticleJson に流す共通処理
async function presentArticleWithViewerContext(
  article: ArticleWithRelations,
  viewerId: number | undefined,
  favorited: boolean,
) {
  // いいね数を取得
  const favoritesCount = await articleRepo.countFavorites(article.id);
  // 自身がフォローしているかを判定
  const following = isFollowing(article.author, viewerId);

  return toArticleJson(
    article,
    article.author,
    article.articleTags.map((at) => at.tag.name),
    favorited,
    favoritesCount,
    following,
  );
}

// list 1 件用 presenter。eager load 済みの favoritedBy / followers を in-memory で集計（N+1 回避）
function presentArticleListItem(
  article: ArticleListRow,
  viewerId: number | undefined,
) {
  const favorited =
    viewerId !== undefined &&
    article.favoritedBy.some((f) => f.userId === viewerId);
  const favoritesCount = article.favoritedBy.length;
  const following = isFollowing(article.author, viewerId);

  return toArticleListJson(
    article,
    article.author,
    article.articleTags.map((at) => at.tag.name),
    favorited,
    favoritesCount,
    following,
  );
}

// 記事 1 件取得の orchestration。
// 戻り値は tagged union: { kind: "ok", article } | { kind: "not_found" }
export async function getArticleBySlug(
  slug: string,
  viewerId: number | undefined,
) {
  // 記事データを取得
  const article = await articleRepo.findBySlugWithRelations(slug);
  if (!article) return { kind: "not_found" as const };

  // 自身がいいねしているかを判定（ログイン中のみ DB 確認）
  const favorited =
    viewerId !== undefined
      ? await articleRepo.isFavoritedBy(article.id, viewerId)
      : false;

  return {
    kind: "ok" as const,
    article: await presentArticleWithViewerContext(
      article,
      viewerId,
      favorited,
    ),
  };
}

// 記事更新の orchestration。
// 戻り値は tagged union: { kind: "ok", article } | { kind: "not_found" } | { kind: "forbidden" }
export async function updateArticle(
  slug: string,
  viewerId: number,
  input: UpdateArticleRequest["article"],
) {
  // 記事データを取得
  const existing = await articleRepo.findBySlugWithRelations(slug);
  if (!existing) return { kind: "not_found" as const };

  // 作者が viewer 本人か判定
  if (existing.authorId !== viewerId) return { kind: "forbidden" as const };

  // 記事を更新
  const updated = await articleRepo.update(existing.id, input);

  // タグリストを更新（input にあれば置換、無ければ既存 tags をそのまま使う）
  let resultTagList: string[];
  if (input.tagList !== undefined) {
    const tagList = [...new Set(input.tagList)];
    await articleRepo.replaceArticleTags(existing.id, tagList);
    resultTagList = tagList;
  } else {
    resultTagList = existing.articleTags.map((at) => at.tag.name);
  }

  return {
    kind: "ok" as const,
    article: toArticleJson(updated, existing.author, resultTagList),
  };
}

// 記事作成の orchestration。
// 戻り値は tagged union: { kind: "ok", article }
// 1 variant のみだが、将来 slug_conflict 等のエラー追加の布石として pattern を揃える
export async function createArticle(
  viewerId: number,
  input: CreateArticleRequest["article"],
) {
  // スラグ生成 + tagList の重複除去
  const slug = generateSlug(input.title);
  const tagList = [...new Set(input.tagList ?? [])];

  // 記事を作成
  const created = await articleRepo.create({
    slug,
    title: input.title,
    description: input.description,
    body: input.body,
    authorId: viewerId,
  });

  // タグを作成
  if (tagList.length > 0) {
    await articleRepo.replaceArticleTags(created.id, tagList);
  }

  // 作者データを取得
  const author = await userRepo.findById(viewerId);
  if (!author) throw new Error("author not found");

  return {
    kind: "ok" as const,
    article: toArticleJson(created, author, tagList),
  };
}

// 記事 favorite の orchestration。
// 戻り値は tagged union: { kind: "ok", article } | { kind: "not_found" }
export async function favoriteArticle(slug: string, viewerId: number) {
  // 記事データを取得
  const article = await articleRepo.findBySlugWithRelations(slug);
  if (!article) return { kind: "not_found" as const };

  // いいねを追加
  await articleRepo.favorite(article.id, viewerId);

  return {
    kind: "ok" as const,
    article: await presentArticleWithViewerContext(article, viewerId, true),
  };
}

// 記事 unfavorite の orchestration。
// 戻り値は tagged union: { kind: "ok", article } | { kind: "not_found" }
export async function unfavoriteArticle(slug: string, viewerId: number) {
  // 記事データを取得
  const article = await articleRepo.findBySlugWithRelations(slug);
  if (!article) return { kind: "not_found" as const };

  // いいねを解除
  await articleRepo.unfavorite(article.id, viewerId);

  return {
    kind: "ok" as const,
    article: await presentArticleWithViewerContext(article, viewerId, false),
  };
}

// 記事削除の orchestration。
// 戻り値は tagged union: { kind: "ok" } | { kind: "not_found" } | { kind: "forbidden" }
export async function deleteArticle(slug: string, viewerId: number) {
  // 記事データを shallow 取得（関連は不要、authorId だけ確認できれば良い）
  const existing = await articleRepo.findBySlug(slug);
  if (!existing) return { kind: "not_found" as const };

  // 作者が viewer 本人か判定
  if (existing.authorId !== viewerId) return { kind: "forbidden" as const };

  // 記事を削除
  await articleRepo.delete(existing.id);

  return { kind: "ok" as const };
}

// 記事一覧の orchestration。
// list 系はエラー variant 不要（filter 不一致 = 空配列で正常終了）なので tagged union 使わず、
// ArticlesResponse 形を直返し
export async function listArticles(
  filter: ArticlesQuery,
  viewerId: number | undefined,
): Promise<ArticlesResponse> {
  // 入力値を取得
  const { limit, offset, author, tag, favorited } = filter;
  const conditions: SQL[] = [];

  // 作者で絞り込み
  if (author !== undefined) {
    const u = await userRepo.findByUsername(author);
    if (!u) return { articles: [], articlesCount: 0 };
    conditions.push(eq(articles.authorId, u.id));
  }

  // タグで絞り込み
  if (tag !== undefined) {
    const t = await articleRepo.findTagByName(tag);
    if (!t) return { articles: [], articlesCount: 0 };
    const articleIds = await articleRepo.findArticleIdsByTagId(t.id);
    if (articleIds.length === 0) return { articles: [], articlesCount: 0 };
    conditions.push(inArray(articles.id, articleIds));
  }

  // いいねしているユーザーで絞り込み
  if (favorited !== undefined) {
    const u = await userRepo.findByUsername(favorited);
    if (!u) return { articles: [], articlesCount: 0 };
    const articleIds = await articleRepo.findArticleIdsFavoritedBy(u.id);
    if (articleIds.length === 0) return { articles: [], articlesCount: 0 };
    conditions.push(inArray(articles.id, articleIds));
  }

  // 絞り込み条件を AND 結合
  const where = conditions.length ? and(...conditions) : undefined;

  // 記事一覧と総数を取得
  const list = await articleRepo.list(where, limit, offset);
  const articlesCount = await articleRepo.count(where);

  // 記事データを返す
  return {
    articles: list.map((a) => presentArticleListItem(a, viewerId)),
    articlesCount,
  };
}

// 自分の feed の orchestration。フォローしてる人の記事だけを返す。
export async function feedArticles(
  viewerId: number,
  filter: FeedQuery,
): Promise<ArticlesResponse> {
  // 入力値を取得
  const { limit, offset } = filter;

  // 自分がフォローしてる user の ID 一覧を取得
  const followingIds = await userRepo.findFollowingIds(viewerId);
  if (followingIds.length === 0) return { articles: [], articlesCount: 0 };

  // フォローしてる人の記事だけを取得
  const where = inArray(articles.authorId, followingIds);
  const list = await articleRepo.list(where, limit, offset);
  const articlesCount = await articleRepo.count(where);

  // 記事データを返す
  return {
    articles: list.map((a) => presentArticleListItem(a, viewerId)),
    articlesCount,
  };
}
