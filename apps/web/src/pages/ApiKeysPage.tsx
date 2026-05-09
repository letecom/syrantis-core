import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
  type WorkspaceApiKeyCreateResponse,
  type WorkspaceApiKeySafe,
} from "../lib/api-client";

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function keyLabel(item: WorkspaceApiKeySafe) {
  return `${item.keyPrefix}...${item.last4}`;
}

function ApiKeyTable({
  items,
  onRevoke,
  revokingId,
}: {
  items: WorkspaceApiKeySafe[];
  onRevoke: (item: WorkspaceApiKeySafe) => void;
  revokingId: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-white px-5 py-10 text-center">
        <p className="text-sm font-medium text-ink">No API keys yet.</p>
        <p className="mt-1 text-sm text-slate-600">
          Create one when an external intake source is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="min-w-full divide-y divide-line text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Key</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Last used</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="max-w-[18rem] px-4 py-3 font-medium text-ink">{item.name}</td>
              <td className="px-4 py-3 font-mono text-slate-700">{keyLabel(item)}</td>
              <td className="px-4 py-3">
                <span
                  className={[
                    "inline-flex rounded-md px-2 py-1 text-xs font-semibold capitalize",
                    item.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-700">{formatDate(item.lastUsedAt)}</td>
              <td className="px-4 py-3 text-slate-700">{formatDate(item.createdAt)}</td>
              <td className="px-4 py-3">
                {item.status === "active" ? (
                  <button
                    className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    disabled={revokingId === item.id}
                    onClick={() => onRevoke(item)}
                    type="button"
                  >
                    {revokingId === item.id ? "Revoking..." : "Revoke"}
                  </button>
                ) : (
                  <span className="text-sm text-slate-500">Revoked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateApiKeyDialog({
  created,
  isCreating,
  onClose,
  onSubmit,
}: {
  created: WorkspaceApiKeyCreateResponse | null;
  isCreating: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(name);
  }

  async function handleCopy() {
    if (!created) {
      return;
    }

    await navigator.clipboard.writeText(created.plaintextApiKey);
    setCopied(true);
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/40 px-4">
      <div
        aria-modal="true"
        className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Create API key</h2>
            <p className="mt-1 text-sm text-slate-600">
              Copy this key now. It will never be shown again.
            </p>
          </div>
          <button
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {created ? (
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-ink">{created.name}</p>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border border-line bg-slate-50 p-3 font-mono text-sm text-slate-800">
                {created.plaintextApiKey}
              </pre>
            </div>
            <button
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              onClick={handleCopy}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-ink" htmlFor="api-key-name">
                Name
              </label>
              <input
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                id="api-key-name"
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
                type="text"
                value={name}
              />
            </div>
            <button
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={isCreating || name.trim().length === 0}
              type="submit"
            >
              {isCreating ? "Creating..." : "Create API key"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<WorkspaceApiKeyCreateResponse | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ["workspace-api-keys"],
    queryFn: listWorkspaceApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createWorkspaceApiKey,
    onSuccess: async (data) => {
      setCreated(data);
      await queryClient.invalidateQueries({ queryKey: ["workspace-api-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeWorkspaceApiKey,
    onSettled: async () => {
      setRevokingId(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace-api-keys"] });
    },
  });

  function closeCreate() {
    setCreated(null);
    setCreateOpen(false);
    createMutation.reset();
  }

  function handleRevoke(item: WorkspaceApiKeySafe) {
    const confirmed = window.confirm(
      "This immediately breaks integrations using this key. Continue?",
    );

    if (!confirmed) {
      return;
    }

    setRevokingId(item.id);
    revokeMutation.mutate(item.id);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">API Keys</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Create API keys for public machine-to-machine intake. Keys are shown once.
          </p>
        </div>
        <button
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          Create API key
        </button>
      </div>

      <div className="mt-6">
        {keysQuery.isLoading ? (
          <p className="text-sm text-slate-600" role="status">
            Loading API keys...
          </p>
        ) : keysQuery.isError ? (
          <p className="text-sm text-red-700">API keys unavailable.</p>
        ) : (
          <ApiKeyTable
            items={keysQuery.data ?? []}
            onRevoke={handleRevoke}
            revokingId={revokingId}
          />
        )}
      </div>

      {createMutation.isError ? (
        <p className="mt-4 text-sm text-red-700">API key creation failed.</p>
      ) : null}
      {revokeMutation.isError ? (
        <p className="mt-4 text-sm text-red-700">API key revocation failed.</p>
      ) : null}

      {createOpen ? (
        <CreateApiKeyDialog
          created={created}
          isCreating={createMutation.isPending}
          onClose={closeCreate}
          onSubmit={(name) => createMutation.mutate({ name })}
        />
      ) : null}
    </div>
  );
}
