import { z } from "zod";

export const ContactContextWarningCodeSchema = z.enum([
  "no_contact_key",
  "shared_inbox_possible",
  "repeated_inbound_recent",
  "recently_contacted",
  "prior_bounce",
  "prior_complaint",
]);

export const ContactContextDeliveryStatusSchema = z.enum(["delivered", "bounced", "complained"]);

export const ContactContextMatchedBySchema = z.enum(["contact_id", "email"]);

export const LeadContactContextDtoSchema = z.object({
  leadId: z.string().uuid(),
  contactKeyPresent: z.boolean(),
  matchedBy: ContactContextMatchedBySchema.nullable(),
  hasPriorContext: z.boolean(),
  previousLeadCount: z.number().int().min(0),
  previousDraftCount: z.number().int().min(0),
  previousOutboundCount: z.number().int().min(0),
  lastPriorLeadAt: z.string().datetime().nullable(),
  lastOutboundAt: z.string().datetime().nullable(),
  lastOutboundDeliveryStatus: ContactContextDeliveryStatusSchema.nullable(),
  warnings: z.array(ContactContextWarningCodeSchema),
});

export const LeadContactContextSuccessSchema = z.object({
  success: z.literal(true),
  data: LeadContactContextDtoSchema,
});

export type ContactContextWarningCode = z.infer<typeof ContactContextWarningCodeSchema>;
export type ContactContextDeliveryStatus = z.infer<typeof ContactContextDeliveryStatusSchema>;
export type ContactContextMatchedBy = z.infer<typeof ContactContextMatchedBySchema>;
export type LeadContactContextDto = z.infer<typeof LeadContactContextDtoSchema>;
export type LeadContactContextSuccess = z.infer<typeof LeadContactContextSuccessSchema>;
