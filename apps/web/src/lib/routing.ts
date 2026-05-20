import type { CurrentUser } from "./api-client";

const clientAppHosts = new Set(["app.syrantis.fr"]);

export function isClientAppHost(hostname = window.location.hostname): boolean {
  return clientAppHosts.has(hostname);
}

export function getAuthenticatedHomePath(user: CurrentUser): string {
  return user.role === "client" || isClientAppHost() ? "/inbox" : "/app";
}
