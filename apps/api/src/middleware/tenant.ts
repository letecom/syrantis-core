import { createMiddleware } from "hono/factory";

// Protected placeholder: tenant identification and enforcement require explicit human approval.
export const tenantPlaceholder = createMiddleware(async (_c, next) => {
  await next();
});
