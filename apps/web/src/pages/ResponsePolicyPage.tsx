import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getClientResponsePolicy,
  putClientResponsePolicy,
  type ClientResponsePolicy,
  type ClientResponsePolicyInput,
} from "../lib/api-client";

type ExampleReplyForm = {
  label: string;
  bodyText: string;
};

type PolicyForm = Omit<ClientResponsePolicyInput, "exampleReplies"> & {
  exampleReplies: ExampleReplyForm[];
};

const emptyForm: PolicyForm = {
  language: "auto",
  tone: "professional",
  customToneNotes: null,
  signature: null,
  defaultGreeting: null,
  defaultClosing: null,
  responseStructure: [],
  businessRules: [],
  forbiddenClaims: [],
  escalationRules: [],
  offerNotes: [],
  catalogSummary: null,
  exampleReplies: [],
};

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function linesText(value: string[]): string {
  return value.join("\n");
}

function formFromPolicy(policy: ClientResponsePolicy): PolicyForm {
  return {
    language: policy.language,
    tone: policy.tone,
    customToneNotes: policy.customToneNotes,
    signature: policy.signature,
    defaultGreeting: policy.defaultGreeting,
    defaultClosing: policy.defaultClosing,
    responseStructure: policy.responseStructure,
    businessRules: policy.businessRules,
    forbiddenClaims: policy.forbiddenClaims,
    escalationRules: policy.escalationRules,
    offerNotes: policy.offerNotes,
    catalogSummary: policy.catalogSummary,
    exampleReplies: policy.exampleReplies,
  };
}

function payloadFromForm(form: PolicyForm): ClientResponsePolicyInput {
  return {
    ...form,
    customToneNotes: form.customToneNotes ? textOrNull(form.customToneNotes) : null,
    signature: form.signature ? textOrNull(form.signature) : null,
    defaultGreeting: form.defaultGreeting ? textOrNull(form.defaultGreeting) : null,
    defaultClosing: form.defaultClosing ? textOrNull(form.defaultClosing) : null,
    catalogSummary: form.catalogSummary ? textOrNull(form.catalogSummary) : null,
    exampleReplies: form.exampleReplies
      .map((reply) => ({
        label: reply.label.trim(),
        bodyText: reply.bodyText.trim(),
      }))
      .filter((reply) => reply.label.length > 0 || reply.bodyText.length > 0),
  };
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({
  maxLength,
  onChange,
  value,
}: {
  maxLength: number;
  onChange: (value: string) => void;
  value: string | null;
}) {
  return (
    <input
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      type="text"
      value={value ?? ""}
    />
  );
}

function TextArea({
  maxLength,
  minRows = 3,
  onChange,
  value,
}: {
  maxLength: number;
  minRows?: number;
  onChange: (value: string) => void;
  value: string | null;
}) {
  return (
    <textarea
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-brand"
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      rows={minRows}
      value={value ?? ""}
    />
  );
}

function Section({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function ResponsePolicyPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PolicyForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ["client-response-policy"],
    queryFn: getClientResponsePolicy,
  });

  useEffect(() => {
    if (policyQuery.data) {
      setForm(formFromPolicy(policyQuery.data));
    }
  }, [policyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: putClientResponsePolicy,
    onSuccess: async (policy) => {
      setError(null);
      setForm(formFromPolicy(policy));
      await queryClient.invalidateQueries({ queryKey: ["client-response-policy"] });
    },
    onError: () => {
      setError("Response policy could not be saved. Check field lengths and sensitive material.");
    },
  });

  const status = policyQuery.data?.status ?? "empty";
  const dirty = useMemo(() => {
    if (!policyQuery.data) {
      return false;
    }

    return JSON.stringify(payloadFromForm(form)) !== JSON.stringify(payloadFromForm(formFromPolicy(policyQuery.data)));
  }, [form, policyQuery.data]);

  function update<K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleLineChange(key: keyof Pick<PolicyForm, "responseStructure" | "businessRules" | "forbiddenClaims" | "escalationRules" | "offerNotes">) {
    return (value: string) => update(key, lines(value));
  }

  function handleExampleChange(index: number, key: keyof ExampleReplyForm) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => {
        const nextReplies = [...current.exampleReplies];
        const existing = nextReplies[index] ?? { label: "", bodyText: "" };
        nextReplies[index] = { ...existing, [key]: event.target.value };
        return { ...current, exampleReplies: nextReplies.slice(0, 5) };
      });
    };
  }

  function addExample() {
    setForm((current) => ({
      ...current,
      exampleReplies: [...current.exampleReplies, { label: "", bodyText: "" }].slice(0, 5),
    }));
  }

  function removeExample(index: number) {
    setForm((current) => ({
      ...current,
      exampleReplies: current.exampleReplies.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function resetLocal() {
    setError(null);
    setForm(policyQuery.data ? formFromPolicy(policyQuery.data) : emptyForm);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    saveMutation.mutate(payloadFromForm(form));
  }

  if (policyQuery.isLoading) {
    return <p className="text-sm text-slate-600">Loading response policy...</p>;
  }

  if (policyQuery.isError) {
    return <p className="text-sm text-red-700">Response policy unavailable.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Response Policy</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure how generated drafts should answer for this client.
          </p>
        </div>
        <span
          className={[
            "rounded-md px-3 py-2 text-sm font-semibold capitalize",
            status === "configured"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-700",
          ].join(" ")}
        >
          {status}
        </span>
      </div>

      {status === "empty" ? (
        <div className="mt-5 rounded-md border border-dashed border-line bg-white px-5 py-4 text-sm text-slate-700">
          No response policy configured yet.
        </div>
      ) : null}

      <form className="mt-6 space-y-6 rounded-md border border-line bg-white p-5" onSubmit={handleSubmit}>
        <Section title="Language and tone">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Language">
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                onChange={(event) =>
                  update("language", event.target.value as PolicyForm["language"])
                }
                value={form.language}
              >
                <option value="auto">Auto</option>
                <option value="fr">French</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Tone">
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                onChange={(event) => update("tone", event.target.value as PolicyForm["tone"])}
                value={form.tone}
              >
                <option value="professional">Professional</option>
                <option value="warm">Warm</option>
                <option value="direct">Direct</option>
                <option value="premium">Premium</option>
                <option value="technical">Technical</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
          </div>
          <Field label="Custom tone notes">
            <TextArea
              maxLength={1000}
              onChange={(value) => update("customToneNotes", value)}
              value={form.customToneNotes}
            />
          </Field>
        </Section>

        <Section title="Greeting, closing, signature">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Default greeting">
              <TextInput
                maxLength={300}
                onChange={(value) => update("defaultGreeting", value)}
                value={form.defaultGreeting}
              />
            </Field>
            <Field label="Default closing">
              <TextInput
                maxLength={500}
                onChange={(value) => update("defaultClosing", value)}
                value={form.defaultClosing}
              />
            </Field>
          </div>
          <Field label="Signature">
            <TextArea
              maxLength={1000}
              onChange={(value) => update("signature", value)}
              value={form.signature}
            />
          </Field>
        </Section>

        <Section title="Response structure">
          <Field label="Structure lines">
            <TextArea
              maxLength={2400}
              onChange={handleLineChange("responseStructure")}
              value={linesText(form.responseStructure)}
            />
          </Field>
        </Section>

        <Section title="Business rules">
          <Field label="Rules">
            <TextArea
              maxLength={10000}
              minRows={5}
              onChange={handleLineChange("businessRules")}
              value={linesText(form.businessRules)}
            />
          </Field>
        </Section>

        <Section title="Forbidden claims">
          <Field label="Claims">
            <TextArea
              maxLength={6000}
              minRows={5}
              onChange={handleLineChange("forbiddenClaims")}
              value={linesText(form.forbiddenClaims)}
            />
          </Field>
        </Section>

        <Section title="Escalation rules">
          <Field label="Rules">
            <TextArea
              maxLength={10000}
              minRows={5}
              onChange={handleLineChange("escalationRules")}
              value={linesText(form.escalationRules)}
            />
          </Field>
        </Section>

        <Section title="Offer notes">
          <Field label="Notes">
            <TextArea
              maxLength={10000}
              minRows={5}
              onChange={handleLineChange("offerNotes")}
              value={linesText(form.offerNotes)}
            />
          </Field>
        </Section>

        <Section title="Catalog summary">
          <Field label="Services, products, pricing notes">
            <TextArea
              maxLength={3000}
              minRows={6}
              onChange={(value) => update("catalogSummary", value)}
              value={form.catalogSummary}
            />
          </Field>
        </Section>

        <Section title="Example replies">
          <div className="grid gap-4">
            {form.exampleReplies.map((reply, index) => (
              <div className="rounded-md border border-line bg-field p-4" key={index}>
                <div className="flex items-start justify-between gap-3">
                  <Field label={`Example ${index + 1} label`}>
                    <input
                      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                      maxLength={100}
                      onChange={handleExampleChange(index, "label")}
                      type="text"
                      value={reply.label}
                    />
                  </Field>
                  <button
                    className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => removeExample(index)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3">
                  <Field label={`Example ${index + 1} body`}>
                    <textarea
                      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-brand"
                      maxLength={1500}
                      onChange={handleExampleChange(index, "bodyText")}
                      rows={5}
                      value={reply.bodyText}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              className="w-fit rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={form.exampleReplies.length >= 5}
              onClick={addExample}
              type="button"
            >
              Add example reply
            </button>
          </div>
        </Section>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {saveMutation.isSuccess ? <p className="text-sm text-emerald-700">Saved.</p> : null}

        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <button
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            disabled={saveMutation.isPending}
            type="submit"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          <button
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={!dirty || saveMutation.isPending}
            onClick={resetLocal}
            type="button"
          >
            Reset local changes
          </button>
        </div>
      </form>
    </div>
  );
}
