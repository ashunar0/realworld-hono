import { generateSlug } from "../../lib/slug";
import { toArticleJson } from "../../lib/article";
import type {
  CreateArticleRequest,
  UpdateArticleRequest,
} from "../../schemas/article";
import { userRepo } from "../users/repository";
import { articleRepo } from "./repository";

// 記事 1 件取得の orchestration。repo を 3 回呼び、presenter で組み立てて返す。
// 戻り値は tagged union: { kind: "ok", article } | { kind: "not_found" }
export async function getArticleBySlug(
  slug: string,
  viewerId: number | undefined,
) {
  // 記事データを取得
  const article = await articleRepo.findBySlugWithRelations(slug);
  if (!article) return { kind: "not_found" as const };

  // 記事のいいね数を取得
  const favoritesCount = await articleRepo.countFavorites(article.id);

  // 自身がいいねしているかを判定（ログイン中のみ DB 確認）
  const favorited =
    viewerId !== undefined
      ? await articleRepo.isFavoritedBy(article.id, viewerId)
      : false;

  // 自身がフォローしているかを判定
  const following =
    viewerId !== undefined &&
    article.author.followers.some((f) => f.followerId === viewerId);

  return {
    kind: "ok" as const,
    article: toArticleJson(
      article,
      article.author,
      article.articleTags.map((at) => at.tag.name),
      favorited,
      favoritesCount,
      following,
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
