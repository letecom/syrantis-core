import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { logout } from "../lib/api-client";
import type { CurrentUser } from "../lib/api-client";

type ClientShellProps = {
  user: CurrentUser;
  children?: ReactNode;
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-3 py-2 text-sm font-semibold transition",
    isActive
      ? "bg-white text-teal-900 shadow-sm"
      : "text-slate-600 hover:bg-white/70 hover:text-teal-900",
  ].join(" ");

export function ClientShell({ user, children }: ClientShellProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const displayName = user.name?.trim() || user.email;

  async function handleLogout() {
    try {
      await logout();
    } finally {
      queryClient.clear();
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-ink">
      <div className="grid min-h-screen lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-100 px-5 py-5 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Syrantis</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">Espace client</h1>
          </div>
          <nav className="mt-6 flex gap-2 lg:grid" aria-label="Navigation client">
            <NavLink className={navLinkClass} to="/dashboard">
              Tableau de bord
            </NavLink>
            <NavLink className={navLinkClass} to="/inbox">
              Boîte de réception
            </NavLink>
            <NavLink className={navLinkClass} to="/config">
              Configuration
            </NavLink>
          </nav>
        </aside>
        <div className="flex min-h-screen flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-4">
            <p className="text-sm font-medium text-slate-700">{displayName}</p>
            <button
              className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={handleLogout}
              type="button"
            >
              Logout
            </button>
          </header>
          <main className="flex-1">{children ?? <Outlet context={user} />}</main>
        </div>
      </div>
    </div>
  );
}
