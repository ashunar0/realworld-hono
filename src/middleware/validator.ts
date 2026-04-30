import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";

export const validateJson = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      );
      return c.json({ errors: { body: messages } }, 422);
    }
  });

export const validateQuery = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      );
      return c.json({ errors: { body: messages } }, 422);
    }
  });
