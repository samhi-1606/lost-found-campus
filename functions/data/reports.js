const {admin, db} = require("../lib/admin");
const {
  COLLECTIONS,
  REPORT_TYPE,
  REPORT_STATUS,
  AI_STATUS,
} = require("../lib/constants");

const reportsRef = () => db.collection(COLLECTIONS.REPORTS);

const EXACT_LOCATION_FIELDS = [
  "latitude",
  "longitude",
  "geoPoint",
  "exactLocation",
];

/**
 * Exact coordinates must never be stored on reports/{reportId}.
 * @param {object} input Candidate fields.
 * @return {void}
 */
function assertNoExactLocationFields(input) {
  EXACT_LOCATION_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field) &&
        input[field] !== undefined) {
      throw new Error(
          "Exact location fields are not allowed on reports. " +
          "Use submitExactFoundLocation for foundLocations.",
      );
    }
  });
}

/**
 * Builds a report document with required defaults.
 * Does not invent AI attributes — aiAttributes stays null.
 * Coarse locationText only (e.g. "Near the library").
 * @param {object} input Client-provided report fields.
 * @return {object} Firestore report payload.
 */
function buildReportDocument(input) {
  const type = input.type;
  if (type !== REPORT_TYPE.LOST && type !== REPORT_TYPE.FOUND) {
    throw new Error("Report type must be \"lost\" or \"found\".");
  }
  if (!input.userId) {
    throw new Error("Report userId is required.");
  }
  if (!input.title) {
    throw new Error("Report title is required.");
  }
  assertNoExactLocationFields(input);

  return {
    userId: input.userId,
    type,
    title: input.title,
    description: input.description || "",
    category: input.category || "",
    locationText: input.locationText || "",
    date: input.date || "",
    time: input.time || "",
    imageUrl: input.imageUrl || "",
    status: input.status || REPORT_STATUS.OPEN,
    createdAt: input.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    aiStatus: AI_STATUS.PENDING,
    aiAttributes: null,
  };
}

/**
 * Creates a report in Firestore.
 * @param {object} input Report fields.
 * @return {Promise<{id: string, data: object}>} Created report.
 */
async function createReport(input) {
  const data = buildReportDocument(input);
  const docRef = await reportsRef().add(data);
  return {id: docRef.id, data};
}

/**
 * Loads a report by id.
 * @param {string} reportId Report document id.
 * @return {Promise<object|null>} Report or null.
 */
async function getReport(reportId) {
  const snap = await reportsRef().doc(reportId).get();
  if (!snap.exists) {
    return null;
  }
  return {id: snap.id, ...snap.data()};
}

/**
 * Partial update for a report.
 * @param {string} reportId Report document id.
 * @param {object} patch Fields to merge.
 * @return {Promise<void>}
 */
async function updateReport(reportId, patch) {
  assertNoExactLocationFields(patch);
  await reportsRef().doc(reportId).update(patch);
}

/**
 * Saves AI pipeline results onto a report.
 * @param {string} reportId Report document id.
 * @param {string} aiStatus One of AI_STATUS values.
 * @param {object|null} aiAttributes Attributes from analyzeItem, or null.
 * @return {Promise<void>}
 */
async function saveAiResult(reportId, aiStatus, aiAttributes) {
  await reportsRef().doc(reportId).update({
    aiStatus,
    aiAttributes: aiAttributes === undefined ? null : aiAttributes,
  });
}

/**
 * Lists reports for a user, newest first.
 * @param {string} userId Firebase Auth uid.
 * @param {number=} limit Max documents.
 * @return {Promise<object[]>}
 */
async function listReportsByUser(userId, limit) {
  let query = reportsRef()
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc");
  if (limit) {
    query = query.limit(limit);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

/**
 * Lists open reports of a given type.
 * @param {string} type "lost" or "found".
 * @param {number=} limit Max documents.
 * @return {Promise<object[]>}
 */
async function listOpenReportsByType(type, limit) {
  let query = reportsRef()
      .where("type", "==", type)
      .where("status", "==", REPORT_STATUS.OPEN)
      .orderBy("createdAt", "desc");
  if (limit) {
    query = query.limit(limit);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

module.exports = {
  reportsRef,
  buildReportDocument,
  createReport,
  getReport,
  updateReport,
  saveAiResult,
  listReportsByUser,
  listOpenReportsByType,
};
