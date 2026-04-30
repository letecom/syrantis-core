import { Hono } from "hono";

import { errorHandler } from "./middleware/error.js";
import { routes } from "./routes/index.js";

export const app = new Hono();

app.onError(errorHandler);
app.route("/", routes);
