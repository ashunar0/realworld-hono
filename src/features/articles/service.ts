import { toArticleJson } from "../../lib/article";
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
