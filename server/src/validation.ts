import { z } from "zod";
import { HttpError } from "./errors.js";

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new HttpError(
      400,
      "invalid_request",
      `${path}${issue?.message ?? "The request body is invalid."}`,
    );
  }
  return result.data;
}
