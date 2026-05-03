import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";

export const userRepo = {
  // ID から user を取得。存在しなければ undefined
  findById(id: number) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },
};
