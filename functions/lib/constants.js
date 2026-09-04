/** Firestore collection names. */
const COLLECTIONS = {
  REPORTS: "reports",
  MATCHES: "matches",
  VERIFICATIONS: "verifications",
  HANDOVERS: "handovers",
  FOUND_LOCATIONS: "foundLocations",
};

/** Report type: lost item vs found item. */
const REPORT_TYPE = {
  LOST: "lost",
  FOUND: "found",
};

/** Lifecycle status for a lost/found report. */
const REPORT_STATUS = {
  OPEN: "open",
  MATCHED: "matched",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

/**
 * AI pipeline status written by Cloud Functions.
 * Frontend should create reports with "pending" only.
 */
const AI_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

const MATCH_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
};

const VERIFICATION_STATUS = {
  PENDING: "pending",
  SUCCESSFUL: "successful",
  FAILED: "failed",
};

const HANDOVER_STATUS = {
  PENDING: "pending",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

module.exports = {
  COLLECTIONS,
  REPORT_TYPE,
  REPORT_STATUS,
  AI_STATUS,
  MATCH_STATUS,
  VERIFICATION_STATUS,
  HANDOVER_STATUS,
};
