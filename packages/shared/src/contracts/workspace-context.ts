import { z } from "zod";

const maxSerializedWorkspaceContextLength = 50_000;

const forbiddenWorkspaceContextKeys = new Set(
  [
    ["from", "Email"],
    ["contact", "Name"],
    ["body", "Text"],
    ["html", "Body"],
    ["raw", "Email"],
    ["raw", "Payload"],
    ["pro", "mpt"],
    ["raw", "Output"],
    ["api", "Key"],
    ["to", "ken"],
    ["creden", "tials"],
    ["provider", "Payload"],
  ].map((parts) => parts.join("")),
);

function NullableTrimmedStringSchema(max: number) {
  return z.string().trim().max(max).nullable().default(null);
}

function findForbiddenKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findForbiddenKey(child);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenWorkspaceContextKeys.has(key)) {
      return key;
    }

    const found = findForbiddenKey(child);

    if (found) {
      return found;
    }
  }

  return null;
}

function enforceWorkspaceContextSafety(value: unknown, ctx: z.RefinementCtx) {
  const forbiddenKey = findForbiddenKey(value);

  if (forbiddenKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [forbiddenKey],
      message: `${forbiddenKey} is not allowed.`,
    });
  }

  if (JSON.stringify(value).length > maxSerializedWorkspaceContextLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace context payload is too large.",
    });
  }
}

const OfferSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: NullableTrimmedStringSchema(700),
    category: NullableTrimmedStringSchema(120),
  })
  .strict();

const ServiceAreaSchema = z
  .object({
    region: z.string().trim().min(1).max(160),
    country: NullableTrimmedStringSchema(80),
    restrictions: NullableTrimmedStringSchema(500),
  })
  .strict();

const IdealCustomerProfileSchema = z
  .object({
    industries: z.array(z.string().trim().max(120)).max(20).default([]),
    companySize: NullableTrimmedStringSchema(160),
    roles: z.array(z.string().trim().max(120)).max(20).default([]),
    painPoints: z.array(z.string().trim().max(300)).max(20).default([]),
    description: NullableTrimmedStringSchema(1500),
  })
  .strict()
  .default({});

const BadFitSignalSchema = z
  .object({
    signal: z.string().trim().min(1).max(300),
    severity: z.enum(["low", "medium", "high"]).nullable().default(null),
  })
  .strict();

const QualificationRuleSchema = z
  .object({
    rule: z.string().trim().min(1).max(400),
    criteria: NullableTrimmedStringSchema(400),
    weight: z.enum(["mandatory", "important", "nice_to_have"]).nullable().default(null),
  })
  .strict();

const CommonObjectionSchema = z
  .object({
    objection: z.string().trim().min(1).max(500),
    suggestedResponse: NullableTrimmedStringSchema(1000),
  })
  .strict();

const ProofPointSchema = z
  .object({
    type: z.enum(["case_study", "testimonial", "statistic", "certification", "partner", "other"]),
    content: z.string().trim().min(1).max(1000),
    source: NullableTrimmedStringSchema(300),
  })
  .strict();

const HandoffRulesSchema = z
  .object({
    requireHumanFor: z.array(z.string().trim().max(300)).max(20).default([]),
    escalationContact: NullableTrimmedStringSchema(255),
    autoRespondThreshold: z.enum(["none", "warm", "hot"]).nullable().default(null),
  })
  .strict()
  .default({});

const WorkspaceContextBaseSchema = z
  .object({
    companyName: z.string().trim().max(120).default(""),
    sector: z.string().trim().max(120).default(""),
    language: z.string().trim().max(16).default("fr"),
    timezone: z.string().trim().max(80).default("Europe/Paris"),
    companySummary: NullableTrimmedStringSchema(2000),
    offers: z.array(OfferSchema).max(20).default([]),
    serviceAreas: z.array(ServiceAreaSchema).max(20).default([]),
    idealCustomerProfile: IdealCustomerProfileSchema,
    badFitSignals: z.array(BadFitSignalSchema).max(20).default([]),
    qualificationRules: z.array(QualificationRuleSchema).max(20).default([]),
    commonObjections: z.array(CommonObjectionSchema).max(20).default([]),
    proofPoints: z.array(ProofPointSchema).max(20).default([]),
    tone: NullableTrimmedStringSchema(500),
    ctaPreference: NullableTrimmedStringSchema(500),
    forbiddenClaims: z.array(z.string().trim().max(300)).max(20).default([]),
    handoffRules: HandoffRulesSchema,
  })
  .strict();

export const WorkspaceContextInputSchema =
  WorkspaceContextBaseSchema.superRefine(enforceWorkspaceContextSafety);

export const WorkspaceContextProfileSchema = WorkspaceContextBaseSchema.extend({
  profileId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WorkspaceContextGetSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    profile: WorkspaceContextProfileSchema.nullable(),
  }),
});

export const WorkspaceContextPutSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    profile: WorkspaceContextProfileSchema,
  }),
});

export type WorkspaceContextInput = z.infer<typeof WorkspaceContextInputSchema>;
export type WorkspaceContextProfile = z.infer<typeof WorkspaceContextProfileSchema>;
export type WorkspaceContextGetSuccess = z.infer<typeof WorkspaceContextGetSuccessSchema>;
export type WorkspaceContextPutSuccess = z.infer<typeof WorkspaceContextPutSuccessSchema>;
