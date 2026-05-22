import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ClientConfigResponsePolicyUpdateSchema } from "@syrantis/shared";

import {
  getClientConfigResponsePolicy,
  putClientConfigResponsePolicy,
  type ClientConfigResponsePolicyData,
  type ClientConfigResponsePolicyInput,
} from "../lib/api-client";

type ExampleReplyForm = {
  label: string;
  body: string;
};

type PolicyForm = ClientConfigResponsePolicyInput;

const emptyForm: PolicyForm = {
  language: "auto",
  tone: "professional",
  customToneNotes: null,
  defaultGreeting: null,
  defaultClosing: null,
  signature: null,
  structureLines: [],
  businessRules: [],
  forbiddenClaims: [],
  escalationRules: [],
  offerNotes: [],
  catalogSummary: null,
  exampleReplies: [],
};

type ArrayField =
  | "structureLines"
  | "businessRules"
  | "forbiddenClaims"
  | "escalationRules"
  | "offerNotes";

function textOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
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

function formFromPolicy(policy: ClientConfigResponsePolicyData): PolicyForm {
  return {
    language: policy.language,
    tone: policy.tone,
    customToneNotes: policy.customToneNotes,
    defaultGreeting: policy.defaultGreeting,
    defaultClosing: policy.defaultClosing,
    signature: policy.signature,
    structureLines: policy.structureLines,
    businessRules: policy.businessRules,
    forbiddenClaims: policy.forbiddenClaims,
    escalationRules: policy.escalationRules,
    offerNotes: policy.offerNotes,
    catalogSummary: policy.catalogSummary,
    exampleReplies: policy.exampleReplies,
  };
}

function payloadFromForm(form: PolicyForm): ClientConfigResponsePolicyInput {
  return {
    language: form.language,
    tone: form.tone,
    customToneNotes: textOrNull(form.customToneNotes),
    defaultGreeting: textOrNull(form.defaultGreeting),
    defaultClosing: textOrNull(form.defaultClosing),
    signature: textOrNull(form.signature),
    structureLines: form.structureLines.map((item) => item.trim()).filter(Boolean),
    businessRules: form.businessRules.map((item) => item.trim()).filter(Boolean),
    forbiddenClaims: form.forbiddenClaims.map((item) => item.trim()).filter(Boolean),
    escalationRules: form.escalationRules.map((item) => item.trim()).filter(Boolean),
    offerNotes: form.offerNotes.map((item) => item.trim()).filter(Boolean),
    catalogSummary: textOrNull(form.catalogSummary),
    exampleReplies: form.exampleReplies
      .map((reply) => ({ label: reply.label.trim(), body: reply.body.trim() }))
      .filter((reply) => reply.label.length > 0 || reply.body.length > 0),
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function examplesEqual(left: ExampleReplyForm[], right: ExampleReplyForm[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (reply, index) => reply.label === right[index]?.label && reply.body === right[index]?.body,
    )
  );
}

function payloadsEqual(
  left: ClientConfigResponsePolicyInput,
  right: ClientConfigResponsePolicyInput,
): boolean {
  return (
    left.language === right.language &&
    left.tone === right.tone &&
    left.customToneNotes === right.customToneNotes &&
    left.defaultGreeting === right.defaultGreeting &&
    left.defaultClosing === right.defaultClosing &&
    left.signature === right.signature &&
    arraysEqual(left.structureLines, right.structureLines) &&
    arraysEqual(left.businessRules, right.businessRules) &&
    arraysEqual(left.forbiddenClaims, right.forbiddenClaims) &&
    arraysEqual(left.escalationRules, right.escalationRules) &&
    arraysEqual(left.offerNotes, right.offerNotes) &&
    left.catalogSummary === right.catalogSummary &&
    examplesEqual(left.exampleReplies, right.exampleReplies)
  );
}

function completionFor(form: PolicyForm) {
  const payload = payloadFromForm(form);
  const checks = [
    payload.language !== "auto",
    payload.tone !== "professional" || Boolean(payload.customToneNotes),
    Boolean(payload.defaultGreeting),
    Boolean(payload.defaultClosing),
    Boolean(payload.signature),
    payload.structureLines.length > 0,
    payload.businessRules.length > 0,
    payload.forbiddenClaims.length > 0,
    payload.escalationRules.length > 0,
    payload.offerNotes.length > 0 || Boolean(payload.catalogSummary),
    payload.exampleReplies.length > 0,
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  if (score <= 35) {
    return { score, label: "Configuration initiale" };
  }

  if (score <= 75) {
    return { score, label: "Configuration intermédiaire" };
  }

  return { score, label: "Configuration solide" };
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "Jamais";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Field({
  children,
  error,
  hint,
  label,
}: {
  children: ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-950">{label}</span>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
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
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
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
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-brand"
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      rows={minRows}
      value={value ?? ""}
    />
  );
}

function Section({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
    </section>
  );
}

function collectFieldErrors(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return {};
  }

  const issues = (error as { issues: { path: (string | number)[] }[] }).issues;
  return Object.fromEntries(
    issues.map((issue) => [
      issue.path.join("."),
      "Vérifie la longueur, le nombre d'éléments et les champs autorisés.",
    ]),
  );
}

export function ClientConfigPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PolicyForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["client-config-response-policy"],
    queryFn: getClientConfigResponsePolicy,
  });

  useEffect(() => {
    if (configQuery.data) {
      setForm(formFromPolicy(configQuery.data));
      setFieldErrors({});
      setFormError(null);
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: putClientConfigResponsePolicy,
    onSuccess: async (policy) => {
      setForm(formFromPolicy(policy));
      setFieldErrors({});
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["client-config-response-policy"] });
    },
    onError: () => {
      setFormError("La configuration n'a pas pu être enregistrée.");
    },
  });

  const dirty = useMemo(() => {
    if (!configQuery.data) {
      return false;
    }

    return !payloadsEqual(payloadFromForm(form), payloadFromForm(formFromPolicy(configQuery.data)));
  }, [configQuery.data, form]);

  const completion = useMemo(() => completionFor(form), [form]);
  const configured = configQuery.data?.configured ?? false;

  function update<K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLines(key: ArrayField) {
    return (value: string) => update(key, lines(value));
  }

  function handleExampleChange(index: number, key: keyof ExampleReplyForm) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => {
        const nextReplies = [...current.exampleReplies];
        const existing = nextReplies[index] ?? { label: "", body: "" };
        nextReplies[index] = { ...existing, [key]: event.target.value };
        return { ...current, exampleReplies: nextReplies.slice(0, 5) };
      });
    };
  }

  function addExample() {
    setForm((current) => ({
      ...current,
      exampleReplies: [...current.exampleReplies, { label: "", body: "" }].slice(0, 5),
    }));
  }

  function removeExample(index: number) {
    setForm((current) => ({
      ...current,
      exampleReplies: current.exampleReplies.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function resetLocal() {
    setFieldErrors({});
    setFormError(null);
    setForm(configQuery.data ? formFromPolicy(configQuery.data) : emptyForm);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ClientConfigResponsePolicyUpdateSchema.safeParse(payloadFromForm(form));

    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      setFormError("Certains champs dépassent les limites prévues.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    saveMutation.mutate(parsed.data);
  }

  if (configQuery.isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-5 py-6">
        <p className="text-sm text-slate-600">Chargement de la configuration...</p>
      </section>
    );
  }

  if (configQuery.isError) {
    return (
      <section className="mx-auto w-full max-w-6xl px-5 py-6">
        <p className="text-sm font-medium text-red-700">Configuration indisponible.</p>
      </section>
    );
  }

  return (
    <section className="h-full overflow-auto px-5 py-6">
      <div className="mx-auto grid w-full max-w-6xl gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Configuration de l'assistant</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Définis comment Syrantis prépare les réponses avant validation humaine.
          </p>
        </div>

        <div className="grid gap-3 rounded-md border border-line bg-white p-5 shadow-sm md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Statut</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {configured ? "Configurée" : "À compléter"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Complétude</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{completion.score}%</p>
            <p className="text-xs text-slate-500">{completion.label}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Dernière mise à jour</p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {formatUpdatedAt(configQuery.data?.updatedAt ?? null)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Qualité</p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {completion.score <= 35
                ? "Ajoute les règles clés avant de t'appuyer sur les brouillons."
                : "La base est exploitable pour la préparation des réponses."}
            </p>
          </div>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <Section
            description="Langue principale, style attendu et nuance commerciale."
            title="Identité & ton"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field error={fieldErrors.language} label="Langue">
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                  onChange={(event) => update("language", event.target.value as PolicyForm["language"])}
                  value={form.language}
                >
                  <option value="auto">Automatique</option>
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                </select>
              </Field>
              <Field error={fieldErrors.tone} label="Ton">
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                  onChange={(event) => update("tone", event.target.value as PolicyForm["tone"])}
                  value={form.tone}
                >
                  <option value="professional">Professionnel</option>
                  <option value="warm">Chaleureux</option>
                  <option value="direct">Direct</option>
                  <option value="premium">Premium</option>
                  <option value="technical">Technique</option>
                  <option value="custom">Personnalisé</option>
                </select>
              </Field>
            </div>
            <Field error={fieldErrors.customToneNotes} label="Notes de ton">
              <TextArea
                maxLength={1000}
                onChange={(value) => update("customToneNotes", value)}
                value={form.customToneNotes}
              />
            </Field>
          </Section>

          <Section title="Formules & signature">
            <div className="grid gap-4 md:grid-cols-2">
              <Field error={fieldErrors.defaultGreeting} label="Salutation par défaut">
                <TextInput
                  maxLength={300}
                  onChange={(value) => update("defaultGreeting", value)}
                  value={form.defaultGreeting}
                />
              </Field>
              <Field error={fieldErrors.defaultClosing} label="Clôture par défaut">
                <TextInput
                  maxLength={500}
                  onChange={(value) => update("defaultClosing", value)}
                  value={form.defaultClosing}
                />
              </Field>
            </div>
            <Field error={fieldErrors.signature} label="Signature">
              <TextArea
                maxLength={1000}
                onChange={(value) => update("signature", value)}
                value={form.signature}
              />
            </Field>
          </Section>

          <Section
            description="Une ligne par étape attendue dans les réponses."
            title="Structure de réponse"
          >
            <Field error={fieldErrors.structureLines} label="Lignes de structure">
              <TextArea
                maxLength={2400}
                onChange={updateLines("structureLines")}
                value={linesText(form.structureLines)}
              />
            </Field>
          </Section>

          <Section description="Une ligne par règle métier importante." title="Règles métier">
            <Field error={fieldErrors.businessRules} label="Règles">
              <TextArea
                maxLength={10000}
                minRows={5}
                onChange={updateLines("businessRules")}
                value={linesText(form.businessRules)}
              />
            </Field>
          </Section>

          <Section description="Ce que les réponses ne doivent jamais promettre." title="Mentions interdites">
            <Field error={fieldErrors.forbiddenClaims} label="Mentions">
              <TextArea
                maxLength={6000}
                minRows={5}
                onChange={updateLines("forbiddenClaims")}
                value={linesText(form.forbiddenClaims)}
              />
            </Field>
          </Section>

          <Section description="Situations qui doivent revenir à un humain." title="Escalade humaine">
            <Field error={fieldErrors.escalationRules} label="Règles d'escalade">
              <TextArea
                maxLength={10000}
                minRows={5}
                onChange={updateLines("escalationRules")}
                value={linesText(form.escalationRules)}
              />
            </Field>
          </Section>

          <Section title="Offre & catalogue">
            <Field error={fieldErrors.offerNotes} label="Notes d'offre">
              <TextArea
                maxLength={10000}
                minRows={4}
                onChange={updateLines("offerNotes")}
                value={linesText(form.offerNotes)}
              />
            </Field>
            <Field error={fieldErrors.catalogSummary} label="Résumé catalogue">
              <TextArea
                maxLength={3000}
                minRows={5}
                onChange={(value) => update("catalogSummary", value)}
                value={form.catalogSummary}
              />
            </Field>
          </Section>

          <Section description="Jusqu'à 5 exemples avec un libellé et un corps de réponse." title="Exemples de réponses">
            <div className="grid gap-4">
              {form.exampleReplies.map((reply, index) => (
                <div className="grid gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0" key={index}>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field
                      error={fieldErrors[`exampleReplies.${index}.label`]}
                      label={`Libellé ${index + 1}`}
                    >
                      <input
                        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                        maxLength={100}
                        onChange={handleExampleChange(index, "label")}
                        type="text"
                        value={reply.label}
                      />
                    </Field>
                    <button
                      className="self-end rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => removeExample(index)}
                      type="button"
                    >
                      Retirer
                    </button>
                  </div>
                  <Field
                    error={fieldErrors[`exampleReplies.${index}.body`]}
                    label={`Réponse ${index + 1}`}
                  >
                    <textarea
                      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-brand"
                      maxLength={1500}
                      onChange={handleExampleChange(index, "body")}
                      rows={5}
                      value={reply.body}
                    />
                  </Field>
                </div>
              ))}
              <button
                className="w-fit rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={form.exampleReplies.length >= 5}
                onClick={addExample}
                type="button"
              >
                Ajouter un exemple
              </button>
              {fieldErrors.exampleReplies ? (
                <p className="text-xs font-medium text-red-700">{fieldErrors.exampleReplies}</p>
              ) : null}
            </div>
          </Section>

          {formError ? <p className="text-sm font-medium text-red-700">{formError}</p> : null}
          {saveMutation.isSuccess ? (
            <p className="text-sm font-medium text-emerald-700">Configuration enregistrée.</p>
          ) : null}

          <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-line bg-slate-50 py-4">
            <button
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={!dirty || saveMutation.isPending}
              type="submit"
            >
              {saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={!dirty || saveMutation.isPending}
              onClick={resetLocal}
              type="button"
            >
              Réinitialiser
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
