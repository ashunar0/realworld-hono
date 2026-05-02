import { Hono } from "hono";
import users from "./features/users";
import articles from "./features/articles";
import tags from "./features/tags";
import type { AuthVariables } from "./middleware/auth";

const app = new Hono<{ Variables: AuthVariables }>();

const routes = app
  .get("/", (c) => c.text("Hello Hono!"))
  .route("/api", users)
  .route("/api", articles)
  .route("/api", tags);

export default app;
export type AppType = typeof routes;
