import { serve } from "@hono/node-server";
import { app } from "./app.js";

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
