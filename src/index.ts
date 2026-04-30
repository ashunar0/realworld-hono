import { Hono } from "hono";
import users from "./features/users";
import articles from "./features/articles";
import type { AuthVariables } from "./middleware/auth";

const app = new Hono<{ Variables: AuthVariables }>();

app.get("/", (c) => c.text("Hello Hono!"));

app.route("/api", users);
app.route("/api", articles);

export default app;
