import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ClientConfigResponsePolicyUpdateSchema,
  ClientResponseProfileCreateSchema,
  ClientResponseProfileUpdateSchema,
} from "@syrantis/shared";

import {
  createClientResponseProfile,
  deactivateClientResponseProfile,
  getClientConfigResponsePolicy,
  listClientResponseProfiles,
  putClientConfigResponsePolicy,
  updateClientResponseProfile,
  type ClientConfigResponsePolicyData,
  type ClientConfigResponsePolicyInput,
  type ClientResponseProfileCreateInput,
  type ClientResponseProfileData,
  type ClientResponseProfileUpdateInput,
} from "../lib/api-client";

type ExampleReplyForm = {
  label: string;
  body: string;
};

type PolicyForm = ClientConfigResponsePolicyInput;
type ProfileForm = ClientResponseProfileUpdateInput;

const toneLabels: Record<ProfileForm["tone"], string> = {
  professional: "Professionnel",
  friendly: "Chaleureux",
  formal: "Formel",
  empathetic: "Empathique",
  concise: "Concis",
  direct: "Direct",
};

const authorityLabels: Record<ProfileForm["authorityLevel"], string> = {
  standard: "Standard",
  manager: "Manager",
  direction: "Direction",
};

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

const emptyProfileForm: ProfileForm = {
  name: "",
  senderName: "",
  roleLabel: "",
  description: null,
  tone: "professional",
  styleNotes: null,
  authorityLevel: "standard",
  appliesToCategories: [],
  specificRules: [],
  escalationRules: [],
  forbiddenClaims: [],
  isDefault: false,
  sortOrder: 0,
};

type ArrayField =
  | "structureLines"
  | "businessRules"
  | "forbiddenClaims"
  | "escalationRules"
  | "offerNotes";

type ProfileArrayField =
  | "appliesToCategories"
  | "specificRules"
  | "escalationRules"
  | "forbiddenClaims";

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

function formFromProfile(profile: ClientResponseProfileData): ProfileForm {
  return {
    name: profile.name,
    senderName: profile.senderName,
    roleLabel: profile.roleLabel,
    description: profile.description,
    tone: profile.tone,
    styleNotes: profile.styleNotes,
    authorityLevel: profile.authorityLevel,
    appliesToCategories: profile.appliesToCategories,
    specificRules: profile.specificRules,
    escalationRules: profile.escalationRules,
    forbiddenClaims: profile.forbiddenClaims,
    isDefault: profile.isDefault,
    sortOrder: profile.sortOrder,
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

function payloadFromProfileForm(form: ProfileForm): ClientResponseProfileUpdateInput {
  return {
    name: form.name.trim(),
    senderName: form.senderName.trim(),
    roleLabel: form.roleLabel.trim(),
    description: textOrNull(form.description),
    tone: form.tone,
    styleNotes: textOrNull(form.styleNotes),
    authorityLevel: form.authorityLevel,
    appliesToCategories: form.appliesToCategories.map((item) => item.trim()).filter(Boolean),
    specificRules: form.specificRules.map((item) => item.trim()).filter(Boolean),
    escalationRules: form.escalationRules.map((item) => item.trim()).filter(Boolean),
    forbiddenClaims: form.forbiddenClaims.map((item) => item.trim()).filter(Boolean),
    isDefault: form.isDefault,
    sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 0,
  };
}

function payloadFromProfileCreateForm(form: ProfileForm): ClientResponseProfileCreateInput {
  const payload = payloadFromProfileForm(form);
  return {
    ...payload,
    isDefault: payload.isDefault,
    sortOrder: payload.sortOrder,
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

function profilePayloadsEqual(left: ProfileForm, right: ProfileForm): boolean {
  return (
    left.name === right.name &&
    left.senderName === right.senderName &&
    left.roleLabel === right.roleLabel &&
    left.description === right.description &&
    left.tone === right.tone &&
    left.styleNotes === right.styleNotes &&
    left.authorityLevel === right.authorityLevel &&
    arraysEqual(left.appliesToCategories, right.appliesToCategories) &&
    arraysEqual(left.specificRules, right.specificRules) &&
    arraysEqual(left.escalationRules, right.escalationRules) &&
    arraysEqual(left.forbiddenClaims, right.forbiddenClaims) &&
    left.isDefault === right.isDefault &&
    left.sortOrder === right.sortOrder
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
  const [selectedProfileId, setSelectedProfileId] = useState<string | "new" | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});
  const [profileFormError, setProfileFormError] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["client-config-response-policy"],
    queryFn: getClientConfigResponsePolicy,
  });

  const profilesQuery = useQuery({
    queryKey: ["client-response-profiles"],
    queryFn: listClientResponseProfiles,
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

  useEffect(() => {
    if (!profilesQuery.data) {
      return;
    }

    if (selectedProfileId === "new") {
      return;
    }

    if (profilesQuery.data.length === 0) {
      setSelectedProfileId(null);
      setProfileForm(emptyProfileForm);
      return;
    }

    const selected =
      profilesQuery.data.find((profile) => profile.id === selectedProfileId) ??
      profilesQuery.data.find((profile) => profile.isDefault) ??
      profilesQuery.data[0];

    if (selected) {
      setSelectedProfileId(selected.id);
      setProfileForm(formFromProfile(selected));
      setProfileFieldErrors({});
      setProfileFormError(null);
    }
  }, [profilesQuery.data, selectedProfileId]);

  const createProfileMutation = useMutation({
    mutationFn: createClientResponseProfile,
    onSuccess: async (profile) => {
      setSelectedProfileId(profile.id);
      setProfileForm(formFromProfile(profile));
      setProfileFieldErrors({});
      setProfileFormError(null);
      setProfileFeedback("Profil créé.");
      await queryClient.invalidateQueries({ queryKey: ["client-response-profiles"] });
    },
    onError: () => {
      setProfileFormError("Le profil n'a pas pu être créé.");
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientResponseProfileUpdateInput }) =>
      updateClientResponseProfile(id, input),
    onSuccess: async (profile) => {
      setSelectedProfileId(profile.id);
      setProfileForm(formFromProfile(profile));
      setProfileFieldErrors({});
      setProfileFormError(null);
      setProfileFeedback("Profil enregistré.");
      await queryClient.invalidateQueries({ queryKey: ["client-response-profiles"] });
    },
    onError: () => {
      setProfileFormError("Le profil n'a pas pu être enregistré.");
    },
  });

  const deactivateProfileMutation = useMutation({
    mutationFn: deactivateClientResponseProfile,
    onSuccess: async () => {
      setProfileFeedback("Profil désactivé.");
      setSelectedProfileId(null);
      await queryClient.invalidateQueries({ queryKey: ["client-response-profiles"] });
    },
    onError: () => {
      setProfileFormError("Le profil n'a pas pu être désactivé.");
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
  const selectedProfile = useMemo(
    () => profilesQuery.data?.find((profile) => profile.id === selectedProfileId) ?? null,
    [profilesQuery.data, selectedProfileId],
  );
  const profileDirty = useMemo(() => {
    if (selectedProfileId === "new") {
      return !profilePayloadsEqual(profileForm, emptyProfileForm);
    }

    if (!selectedProfile) {
      return false;
    }

    return !profilePayloadsEqual(
      payloadFromProfileForm(profileForm),
      payloadFromProfileForm(formFromProfile(selectedProfile)),
    );
  }, [profileForm, selectedProfile, selectedProfileId]);
  const profileMutationPending =
    createProfileMutation.isPending ||
    updateProfileMutation.isPending ||
    deactivateProfileMutation.isPending;

  function update<K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLines(key: ArrayField) {
    return (value: string) => update(key, lines(value));
  }

  function updateProfile<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setProfileFeedback(null);
    setProfileForm((current) => ({ ...current, [key]: value }));
  }

  function updateProfileLines(key: ProfileArrayField) {
    return (value: string) => updateProfile(key, lines(value));
  }

  function selectProfile(profile: ClientResponseProfileData) {
    setSelectedProfileId(profile.id);
    setProfileForm(formFromProfile(profile));
    setProfileFieldErrors({});
    setProfileFormError(null);
    setProfileFeedback(null);
  }

  function startNewProfile() {
    setSelectedProfileId("new");
    setProfileForm({
      ...emptyProfileForm,
      isDefault: (profilesQuery.data?.length ?? 0) === 0,
    });
    setProfileFieldErrors({});
    setProfileFormError(null);
    setProfileFeedback(null);
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

  function resetProfileLocal() {
    setProfileFieldErrors({});
    setProfileFormError(null);
    setProfileFeedback(null);

    if (selectedProfileId === "new" || !selectedProfile) {
      startNewProfile();
      return;
    }

    setProfileForm(formFromProfile(selectedProfile));
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

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = payloadFromProfileForm(profileForm);
    const parsed =
      selectedProfileId === "new"
        ? ClientResponseProfileCreateSchema.safeParse(payloadFromProfileCreateForm(profileForm))
        : ClientResponseProfileUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      setProfileFieldErrors(collectFieldErrors(parsed.error));
      setProfileFormError("Certains champs du profil sont à vérifier.");
      return;
    }

    setProfileFieldErrors({});
    setProfileFormError(null);
    setProfileFeedback(null);

    if (selectedProfileId === "new") {
      createProfileMutation.mutate(parsed.data as ClientResponseProfileCreateInput);
      return;
    }

    if (typeof selectedProfileId === "string") {
      updateProfileMutation.mutate({
        id: selectedProfileId,
        input: parsed.data as ClientResponseProfileUpdateInput,
      });
    }
  }

  function handleDeactivateProfile() {
    if (!selectedProfile || selectedProfile.isDefault || profileMutationPending) {
      return;
    }

    const confirmed = window.confirm("Désactiver ce profil de réponse ?");

    if (confirmed) {
      setProfileFeedback(null);
      deactivateProfileMutation.mutate(selectedProfile.id);
    }
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

        <section className="rounded-md border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Profils de réponse</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Configure les voix d'équipe disponibles pour les prochaines réponses assistées.
              </p>
            </div>
            <button
              className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={startNewProfile}
              type="button"
            >
              Ajouter un profil
            </button>
          </div>

          {profilesQuery.isLoading ? (
            <p className="mt-5 text-sm text-slate-600">Chargement des profils...</p>
          ) : null}
          {profilesQuery.isError ? (
            <p className="mt-5 text-sm font-medium text-red-700">Profils indisponibles.</p>
          ) : null}
          {!profilesQuery.isLoading && !profilesQuery.isError ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
              <div className="grid content-start gap-3">
                {(profilesQuery.data?.length ?? 0) === 0 && selectedProfileId !== "new" ? (
                  <p className="rounded-md border border-dashed border-line p-4 text-sm leading-6 text-slate-600">
                    Crée ton premier profil de réponse. Il deviendra le profil par défaut.
                  </p>
                ) : null}
                {profilesQuery.data?.map((profile) => (
                  <button
                    className={`w-full rounded-md border px-4 py-3 text-left text-sm transition ${
                      selectedProfileId === profile.id
                        ? "border-brand bg-slate-50"
                        : "border-line bg-white hover:bg-slate-50"
                    }`}
                    key={profile.id}
                    onClick={() => selectProfile(profile)}
                    type="button"
                  >
                    <span className="block font-semibold text-slate-950">{profile.name}</span>
                    <span className="mt-1 block text-xs text-slate-600">{profile.roleLabel}</span>
                    <span className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {toneLabels[profile.tone]}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {authorityLabels[profile.authorityLevel]}
                      </span>
                      {profile.isDefault ? (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Par défaut
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>

              {selectedProfileId ? (
                <form className="grid gap-4" onSubmit={handleProfileSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field error={profileFieldErrors.name} label="Nom du profil">
                      <TextInput
                        maxLength={100}
                        onChange={(value) => updateProfile("name", value)}
                        value={profileForm.name}
                      />
                    </Field>
                    <Field
                      error={profileFieldErrors.senderName}
                      label="Nom utilisé dans la réponse"
                    >
                      <TextInput
                        maxLength={100}
                        onChange={(value) => updateProfile("senderName", value)}
                        value={profileForm.senderName}
                      />
                    </Field>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field error={profileFieldErrors.roleLabel} label="Rôle">
                      <TextInput
                        maxLength={120}
                        onChange={(value) => updateProfile("roleLabel", value)}
                        value={profileForm.roleLabel}
                      />
                    </Field>
                    <Field error={profileFieldErrors.sortOrder} label="Ordre d'affichage">
                      <input
                        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                        min={0}
                        onChange={(event) =>
                          updateProfile("sortOrder", Math.max(0, Number(event.target.value) || 0))
                        }
                        type="number"
                        value={profileForm.sortOrder}
                      />
                    </Field>
                  </div>
                  <Field error={profileFieldErrors.description} label="Description">
                    <TextArea
                      maxLength={500}
                      onChange={(value) => updateProfile("description", value)}
                      value={profileForm.description}
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field error={profileFieldErrors.tone} label="Ton">
                      <select
                        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                        onChange={(event) =>
                          updateProfile("tone", event.target.value as ProfileForm["tone"])
                        }
                        value={profileForm.tone}
                      >
                        {Object.entries(toneLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field error={profileFieldErrors.authorityLevel} label="Niveau d'autorité">
                      <select
                        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                        onChange={(event) =>
                          updateProfile(
                            "authorityLevel",
                            event.target.value as ProfileForm["authorityLevel"],
                          )
                        }
                        value={profileForm.authorityLevel}
                      >
                        {Object.entries(authorityLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field error={profileFieldErrors.styleNotes} label="Notes de style">
                    <TextArea
                      maxLength={1000}
                      onChange={(value) => updateProfile("styleNotes", value)}
                      value={profileForm.styleNotes}
                    />
                  </Field>
                  <Field
                    error={profileFieldErrors.appliesToCategories}
                    hint="Une ligne par catégorie."
                    label="Catégories concernées"
                  >
                    <TextArea
                      maxLength={2400}
                      onChange={updateProfileLines("appliesToCategories")}
                      value={linesText(profileForm.appliesToCategories)}
                    />
                  </Field>
                  <Field
                    error={profileFieldErrors.specificRules}
                    hint="Une ligne par règle."
                    label="Règles spécifiques"
                  >
                    <TextArea
                      maxLength={2400}
                      minRows={4}
                      onChange={updateProfileLines("specificRules")}
                      value={linesText(profileForm.specificRules)}
                    />
                  </Field>
                  <Field
                    error={profileFieldErrors.escalationRules}
                    hint="Une ligne par règle."
                    label="Règles d'escalade"
                  >
                    <TextArea
                      maxLength={2400}
                      minRows={4}
                      onChange={updateProfileLines("escalationRules")}
                      value={linesText(profileForm.escalationRules)}
                    />
                  </Field>
                  <Field
                    error={profileFieldErrors.forbiddenClaims}
                    hint="Une ligne par mention."
                    label="Mentions interdites complémentaires"
                  >
                    <TextArea
                      maxLength={2400}
                      minRows={4}
                      onChange={updateProfileLines("forbiddenClaims")}
                      value={linesText(profileForm.forbiddenClaims)}
                    />
                  </Field>
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
                    <input
                      checked={profileForm.isDefault}
                      className="h-4 w-4 rounded border-line text-brand"
                      onChange={(event) => updateProfile("isDefault", event.target.checked)}
                      type="checkbox"
                    />
                    Définir comme profil par défaut
                  </label>

                  {profileFormError ? (
                    <p className="text-sm font-medium text-red-700">{profileFormError}</p>
                  ) : null}
                  {profileFeedback ? (
                    <p className="text-sm font-medium text-emerald-700">{profileFeedback}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                    <button
                      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                      disabled={!profileDirty || profileMutationPending}
                      type="submit"
                    >
                      {profileMutationPending ? "Enregistrement..." : "Enregistrer le profil"}
                    </button>
                    <button
                      className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      disabled={!profileDirty || profileMutationPending}
                      onClick={resetProfileLocal}
                      type="button"
                    >
                      Réinitialiser le profil
                    </button>
                    {selectedProfileId !== "new" ? (
                      <button
                        className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        disabled={
                          profileMutationPending || !selectedProfile || selectedProfile.isDefault
                        }
                        onClick={handleDeactivateProfile}
                        type="button"
                      >
                        Désactiver
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>

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
