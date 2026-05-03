import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { follows, users } from "../../db/schema";

export const userRepo = {
  // ID から user を取得。存在しなければ undefined
  findById(id: number) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },

  // username から user を取得。存在しなければ undefined
  findByUsername(username: string) {
    return db.query.users.findFirst({
      where: eq(users.username, username),
    });
  },

  // プロフィール表示用に followers を eager load した user を取得
  findByUsernameWithFollowers(username: string) {
    return db.query.users.findFirst({
      where: eq(users.username, username),
      with: { followers: true },
    });
  },

  // この user がフォローしている user の ID 一覧
  async findFollowingIds(userId: number) {
    const rows = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return rows.map((r) => r.id);
  },

  // フォロー関係を作成。重複は無視
  async createFollow(followerId: number, followingId: number) {
    await db
      .insert(follows)
      .values({ followerId, followingId })
      .onConflictDoNothing();
  },

  // フォロー関係を削除
  async deleteFollow(followerId: number, followingId: number) {
    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId),
        ),
      );
  },
};
