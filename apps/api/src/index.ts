import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { errorHandler } from "./middleware/error";
import { routes } from "./routes";

export const app = new Hono();

app.onError(errorHandler);
app.route("/", routes);

const port = Number(process.env.PORT ?? 8787);

if (import.meta.url === `file://${process.argv[1]}`) {
  serve(
    {
      fetch: app.fetch,
      port
    },
    (info) => {
      console.log(`Syrantis API listening on http://127.0.0.1:${info.port}`);
    },
  );
}
