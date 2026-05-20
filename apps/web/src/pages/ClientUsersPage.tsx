import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createClientUser,
  listClientUsers,
  type ClientUserCreateResponse,
  type ClientUserSafe,
} from "../lib/api-client";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ClientUsersTable({ items }: { items: ClientUserSafe[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-white px-5 py-10 text-center">
        <p className="text-sm font-medium text-ink">No client users yet.</p>
        <p className="mt-1 text-sm text-slate-600">
          Create one when a client pilot account is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="min-w-full divide-y divide-line text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
          <tr>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-3 font-medium text-ink">{item.email}</td>
              <td className="px-4 py-3 text-slate-700">{item.displayName ?? "Not set"}</td>
              <td className="px-4 py-3 text-slate-700">{item.role}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-700">{formatDate(item.createdAt)}</td>
              <td className="px-4 py-3 text-slate-700">{formatDate(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OneTimePasswordPanel({
  created,
  onDismiss,
}: {
  created: ClientUserCreateResponse;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(created.temporaryPassword);
    setCopied(true);
  }

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-amber-950">
            Temporary password for {created.user.email}
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            Copy this password now. It will not be shown again.
          </p>
        </div>
        <button
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </button>
      </div>
      <pre className="mt-4 whitespace-pre-wrap break-all rounded-md border border-amber-200 bg-white p-3 font-mono text-sm text-amber-950">
        {created.temporaryPassword}
      </pre>
      <button
        className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </section>
  );
}

export function ClientUsersPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [created, setCreated] = useState<ClientUserCreateResponse | null>(null);

  const usersQuery = useQuery({
    queryKey: ["client-users"],
    queryFn: listClientUsers,
  });

  const createMutation = useMutation({
    mutationFn: createClientUser,
    onSuccess: async (data) => {
      setCreated(data);
      setEmail("");
      setDisplayName("");
      await queryClient.invalidateQueries({ queryKey: ["client-users"] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    createMutation.mutate({
      email,
      ...(trimmedName ? { displayName: trimmedName } : {}),
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Client Users</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Create controlled client accounts for the current workspace. Temporary passwords are
          shown once.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form className="rounded-md border border-line bg-white p-5" onSubmit={handleSubmit}>
          <h2 className="text-lg font-semibold text-ink">Create client user</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Email
              <input
                autoComplete="email"
                className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
                maxLength={320}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Display name
              <input
                autoComplete="name"
                className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
                maxLength={255}
                onChange={(event) => setDisplayName(event.target.value)}
                type="text"
                value={displayName}
              />
            </label>
            <button
              className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={createMutation.isPending || email.trim().length === 0}
              type="submit"
            >
              {createMutation.isPending ? "Creating..." : "Create client user"}
            </button>
            {createMutation.isError ? (
              <p className="text-sm text-red-700">Client user creation failed.</p>
            ) : null}
          </div>
        </form>

        <div className="grid gap-4">
          {created ? (
            <OneTimePasswordPanel created={created} onDismiss={() => setCreated(null)} />
          ) : null}
          {usersQuery.isLoading ? (
            <p className="text-sm text-slate-600" role="status">
              Loading client users...
            </p>
          ) : usersQuery.isError ? (
            <p className="text-sm text-red-700">Client users unavailable.</p>
          ) : (
            <ClientUsersTable items={usersQuery.data ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}
