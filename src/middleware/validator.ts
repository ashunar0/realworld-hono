import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";

const fieldKeyedErrors = (
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const last = issue.path[issue.path.length - 1];
    const field = String(last ?? "body");
    (errors[field] ||= []).push(issue.message);
  }
  return errors;
};

export const validateJson = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json({ errors: fieldKeyedErrors(result.error.issues) }, 422);
    }
  });

export const validateQuery = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) {
      return c.json({ errors: fieldKeyedErrors(result.error.issues) }, 422);
    }
  });
