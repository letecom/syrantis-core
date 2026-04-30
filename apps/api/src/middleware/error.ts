import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (error, c) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";

  return c.json(
    {
      error: "Internal Server Error",
      message
    },
    500,
  );
};
