import { z } from "zod";

/**
 * Every tab carries a trailing, non-authoritative `_row_version` column (bumped on every write) so all
 * six tabs get uniform optimistic-concurrency conflict detection, even the four that have no edited_at
 * column of their own. See lib/repositories/types.ts.
 */
const rowVersion = z.object({ _row_version: z.number().int().positive() });

export const gameSchema = z
  .object({
    game_id: z.string(),
    name: z.string().min(1),
    version: z.string().default(""),
    casinos: z.string().default(""), // pipe-delimited
    filing: z.string().default(""),
    edge_text: z.string().default(""),
    edge_pct: z.number(), // stored as a decimal, e.g. 0.01123 — formatted at the display layer only
    verified: z.boolean().default(false),
    exposure_mult: z.number(),
    fee_text: z.string().default(""),
    rules: z.string().default(""),
    settlement_order: z.string().default(""),
    notes: z.string().default(""),
    edited_by: z.string().default(""),
    edited_at: z.string().default(""),
    owner_id: z.string().default(""),
  })
  .merge(rowVersion);
export type Game = z.infer<typeof gameSchema>;
export const gameCreateSchema = gameSchema.omit({ game_id: true, _row_version: true }).partial({
  version: true,
  casinos: true,
  filing: true,
  edge_text: true,
  fee_text: true,
  rules: true,
  settlement_order: true,
  notes: true,
  edited_by: true,
  edited_at: true,
  owner_id: true,
  verified: true,
});
export const gamePatchSchema = gameSchema.omit({ game_id: true, _row_version: true }).partial();

export const sidebetSchema = z
  .object({
    sidebet_id: z.string(),
    game_id: z.string(),
    name: z.string().min(1),
    top_payout: z.string().default(""),
    limits: z.string().default(""),
    edge_pct: z.number(),
    verified: z.boolean().default(false),
    note: z.string().default(""),
  })
  .merge(rowVersion);
export type Sidebet = z.infer<typeof sidebetSchema>;
export const sidebetCreateSchema = sidebetSchema.omit({ sidebet_id: true, _row_version: true }).partial({
  top_payout: true,
  limits: true,
  verified: true,
  note: true,
});
export const sidebetPatchSchema = sidebetSchema.omit({ sidebet_id: true, _row_version: true }).partial();

export const paytableSchema = z
  .object({
    paytable_id: z.string(),
    sidebet_id: z.string(),
    ordinal: z.number().int(),
    outcome: z.string().min(1),
    payout: z.string().default(""),
  })
  .merge(rowVersion);
export type Paytable = z.infer<typeof paytableSchema>;
export const paytableCreateSchema = paytableSchema.omit({ paytable_id: true, _row_version: true });
export const paytablePatchSchema = paytableSchema.omit({ paytable_id: true, _row_version: true }).partial();

export const feeScheduleSchema = z
  .object({
    schedule_id: z.string(),
    casino: z.string().default(""),
    game_id: z.string(),
    option_label: z.string().default(""),
    table_limit: z.string().default(""),
    basis: z.enum(["flat", "tta"]),
    tier_min: z.number(),
    tier_max: z.number().nullable(),
    pd_fee: z.number(),
    player_fee: z.number().default(0),
  })
  .merge(rowVersion);
export type FeeSchedule = z.infer<typeof feeScheduleSchema>;
export const feeScheduleCreateSchema = feeScheduleSchema.omit({ schedule_id: true, _row_version: true }).partial({
  casino: true,
  option_label: true,
  table_limit: true,
  player_fee: true,
});
export const feeSchedulePatchSchema = feeScheduleSchema.omit({ schedule_id: true, _row_version: true }).partial();

export const sessionSchema = z
  .object({
    session_id: z.string(),
    date: z.string(),
    casino: z.string().default(""),
    buy_in: z.number().nonnegative().default(0),
    buy_out: z.number().nonnegative().nullable().default(null),
    time_in: z.string().default(""),
    time_out: z.string().default(""),
    // Kept for compatibility with existing round analytics, but new sessions are not tied to a game.
    game_id: z.string().default(""),
    schedule_option: z.string().default(""),
    rounds_banked: z.number().int().nullable().default(null),
    action_offered: z.number().nullable().default(null),
    action_booked: z.number().nullable().default(null),
    coverage_pct: z.number().nullable().default(null), // action_booked / action_offered — required to close a session
    bonus_action_booked: z.number().nullable().default(null),
    collection_paid: z.number().nullable().default(null),
    gross_wl: z.number().nullable().default(null),
    net_pnl: z.number().nullable().default(null),
    peak_drawdown: z.number().nullable().default(null),
    partners: z.string().default(""),
    split_terms: z.string().default(""),
    notes: z.string().default(""),
    logged_by: z.string(),
    logged_at: z.string(),
    owner_id: z.string().default(""),
  })
  .merge(rowVersion);
export type Session = z.infer<typeof sessionSchema>;
export const sessionCreateSchema = sessionSchema
  .omit({ session_id: true, _row_version: true })
  .partial({
    buy_in: true,
    buy_out: true,
    time_in: true,
    time_out: true,
    game_id: true,
    schedule_option: true,
    rounds_banked: true,
    action_offered: true,
    action_booked: true,
    coverage_pct: true,
    bonus_action_booked: true,
    collection_paid: true,
    gross_wl: true,
    net_pnl: true,
    peak_drawdown: true,
    partners: true,
    split_terms: true,
    notes: true,
    owner_id: true,
  })
  .extend({
    casino: z.string().trim().min(1),
    buy_in: z.number().nonnegative(),
    time_in: z.string().min(1),
    logged_by: z.string().trim().min(1),
  });
export const sessionPatchSchema = sessionSchema.omit({ session_id: true, _row_version: true }).partial();

export const roundFieldsSchema = z
  .object({
    round_id: z.string(),
    session_id: z.string(),
    seq: z.number().int().positive(),
    tta: z.number().nonnegative(),
    booked: z.number().nonnegative(),
    bonus_action: z.number().nonnegative().nullable().default(null),
    fee_tier: z.string().default(""),
    fee_paid: z.number().nonnegative(),
    result: z.number(), // signed PD result for the round
    note: z.string().default(""),
  })
  .merge(rowVersion);

function bookedCannotExceedTta(
  round: { booked: number; tta: number },
  context: z.RefinementCtx,
): void {
  if (round.booked > round.tta) {
    context.addIssue({
      code: "custom",
      path: ["booked"],
      message: "Booked action cannot exceed offered TTA",
    });
  }
}

export const roundSchema = roundFieldsSchema.superRefine(bookedCannotExceedTta);
export type Round = z.infer<typeof roundSchema>;
export const roundCreateSchema = roundFieldsSchema
  .omit({ round_id: true, _row_version: true })
  .partial({
    bonus_action: true,
    fee_tier: true,
    note: true,
  })
  .superRefine(bookedCannotExceedTta);
export const roundPatchSchema = roundFieldsSchema.omit({ round_id: true, _row_version: true }).partial();

/* ------------------------------------------------------------------------------------------------
 * Big-loss reporting. These three tabs are append-only: `LossReports` and `LossEvidence` have no
 * patch schema at all, and the single mutation path — a reviewer decision — is the narrow
 * `lossDecisionSchema` below. The absence of a general patch schema is the append-only guarantee,
 * enforced at the type level rather than by convention.
 * ---------------------------------------------------------------------------------------------- */

export const LOSS_STATUSES = ["submitted", "in_review", "verified", "disputed", "rejected"] as const;
export type LossStatus = (typeof LOSS_STATUSES)[number];

/** Terminal-ish states a reviewer can move a report into. `submitted` is only ever set on receipt. */
export const LOSS_DECISION_STATUSES = ["in_review", "verified", "disputed", "rejected"] as const;
export type LossDecisionStatus = (typeof LOSS_DECISION_STATUSES)[number];

export const lossReportSchema = z
  .object({
    loss_id: z.string(),
    session_id: z.string().default(""),
    casino: z.string().default(""),
    game_id: z.string().default(""),
    table_no: z.string().default(""),
    /** What the employee claims. Compare against reported_at — the gap is a review signal. */
    occurred_at: z.string(),
    /** Stamped server-side on receipt. Never accepted from a request body. */
    reported_at: z.string(),
    amount: z.number().nonnegative(),
    circumstances: z.string().default(""),
    witness_name: z.string().default(""),
    status: z.enum(LOSS_STATUSES).default("submitted"),
    /** Taken from the session server-side, never from the request body. */
    submitted_by: z.string(),
    owner_id: z.string().default(""),
    reviewed_by: z.string().default(""),
    reviewed_at: z.string().default(""),
    review_note: z.string().default(""),
    second_attestor: z.string().default(""),
  })
  .merge(rowVersion);
export type LossReport = z.infer<typeof lossReportSchema>;

/**
 * What a submitter is allowed to put in the request body. Every field the reviewer or the server
 * owns is simply absent, so zod's default object stripping drops them rather than trusting them.
 */
export const lossReportSubmitSchema = z.object({
  session_id: z.string().default(""),
  casino: z.string().trim().min(1),
  game_id: z.string().default(""),
  table_no: z.string().default(""),
  occurred_at: z.string().min(1),
  amount: z.number().positive(),
  circumstances: z.string().trim().min(1),
  witness_name: z.string().default(""),
});
export type LossReportSubmission = z.infer<typeof lossReportSubmitSchema>;

/**
 * Repository-level create. The eight server- and reviewer-owned fields are optional here because the
 * authorized layer supplies them — but `reported_at` and `submitted_by` have no schema default, so a
 * create that skips the authorized layer fails to parse rather than landing an unattributed report.
 */
export const lossReportCreateSchema = lossReportSchema.omit({ loss_id: true, _row_version: true }).partial({
  reported_at: true,
  status: true,
  submitted_by: true,
  owner_id: true,
  reviewed_by: true,
  reviewed_at: true,
  review_note: true,
  second_attestor: true,
});

/** The only fields a reviewer decision may touch. reviewed_by/reviewed_at are stamped server-side. */
export const lossDecisionSchema = z.object({
  status: z.enum(LOSS_DECISION_STATUSES),
  review_note: z.string().default(""),
  second_attestor: z.string().default(""),
});
export type LossDecisionInput = z.infer<typeof lossDecisionSchema>;

/**
 * Repository-level decision patch — the reviewer's fields plus the server's stamps. `status` is the
 * narrow decision enum, so no write path can put a report back into `submitted`.
 */
export const lossDecisionPatchSchema = lossReportSchema
  .pick({ review_note: true, second_attestor: true, reviewed_by: true, reviewed_at: true })
  .extend({ status: z.enum(LOSS_DECISION_STATUSES) });
export type LossDecisionPatch = z.infer<typeof lossDecisionPatchSchema>;

export const lossEvidenceSchema = z
  .object({
    evidence_id: z.string(),
    loss_id: z.string(),
    ordinal: z.number().int().nonnegative(),
    kind: z.string().default("photo"),
    blob_key: z.string().min(1),
    /** SHA-256 of the resized bytes actually stored — hashed after downscaling, not before. */
    content_hash: z.string().min(1),
    byte_size: z.number().int().nonnegative(),
    mime: z.string().default(""),
    width: z.number().int().nullable().default(null),
    height: z.number().int().nullable().default(null),
    captured_at_exif: z.string().default(""),
    uploaded_at: z.string(),
    uploaded_by: z.string(),
  })
  .merge(rowVersion);
export type LossEvidence = z.infer<typeof lossEvidenceSchema>;

/** Client-supplied half of an evidence row; the server stamps uploaded_at/uploaded_by. */
export const lossEvidenceSubmitSchema = z.object({
  loss_id: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  kind: z.string().default("photo"),
  blob_key: z.string().min(1),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/, "content_hash must be a hex SHA-256 digest"),
  byte_size: z.number().int().nonnegative(),
  mime: z.string().default(""),
  width: z.number().int().nullable().default(null),
  height: z.number().int().nullable().default(null),
  captured_at_exif: z.string().default(""),
});
export type LossEvidenceSubmission = z.infer<typeof lossEvidenceSubmitSchema>;

/** `uploaded_at`/`uploaded_by` are stamped by the authorized layer, as with a report's receipt time. */
export const lossEvidenceCreateSchema = lossEvidenceSchema.omit({ evidence_id: true, _row_version: true }).partial({
  uploaded_at: true,
  uploaded_by: true,
});

export const auditEntrySchema = z
  .object({
    entry_id: z.string(),
    loss_id: z.string(),
    at: z.string(),
    actor: z.string(),
    from_status: z.string().default(""),
    to_status: z.string().default(""),
    note: z.string().default(""),
  })
  .merge(rowVersion);
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditEntryCreateSchema = auditEntrySchema.omit({ entry_id: true, _row_version: true });

/** Which statuses a report may legally move into from where. `submitted` is only ever the entry state. */
export const LOSS_STATUS_TRANSITIONS: Record<LossStatus, readonly LossDecisionStatus[]> = {
  submitted: ["in_review", "verified", "disputed", "rejected"],
  in_review: ["verified", "disputed", "rejected"],
  // A dispute is an open question, so it can still resolve either way once investigated.
  disputed: ["verified", "rejected"],
  // A settled report is not re-decided; it is superseded by a new report if the facts change.
  verified: [],
  rejected: [],
};
