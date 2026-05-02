import { Hono } from "hono";
import { db } from "../../db";

const app = new Hono()
  // タグ一覧 GET /api/tags
  .get("/tags", async (c) => {
    const rows = await db.query.tags.findMany();
    return c.json({ tags: rows.map((t) => t.name) });
  });

export default app;
