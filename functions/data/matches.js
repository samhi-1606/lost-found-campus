const {admin, db} = require("../lib/admin");
const {COLLECTIONS, MATCH_STATUS} = require("../lib/constants");

const matchesRef = () => db.collection(COLLECTIONS.MATCHES);

/**
 * Builds a match linking a lost report to a found report.
 * Person 4 can extend scoring fields later.
 * @param {object} input Match fields.
 * @return {object} Firestore match payload.
 */
function buildMatchDocument(input) {
  if (!input.lostReportId || !input.foundReportId) {
    throw new Error("lostReportId and foundReportId are required.");
  }

  return {
    lostReportId: input.lostReportId,
    foundReportId: input.foundReportId,
    status: input.status || MATCH_STATUS.PENDING,
    score: input.score === undefined ? null : input.score,
    createdAt: input.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Creates a match document.
 * @param {object} input Match fields.
 * @return {Promise<{id: string, data: object}>}
 */
async function createMatch(input) {
  const data = buildMatchDocument(input);
  const docRef = await matchesRef().add(data);
  return {id: docRef.id, data};
}

/**
 * Loads a match by id.
 * @param {string} matchId Match document id.
 * @return {Promise<object|null>}
 */
async function getMatch(matchId) {
  const snap = await matchesRef().doc(matchId).get();
  if (!snap.exists) {
    return null;
  }
  return {id: snap.id, ...snap.data()};
}

/**
 * Updates match status (confirm / reject).
 * @param {string} matchId Match document id.
 * @param {string} status MATCH_STATUS value.
 * @return {Promise<void>}
 */
async function updateMatchStatus(matchId, status) {
  await matchesRef().doc(matchId).update({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Lists matches that reference a report as lost or found.
 * @param {string} reportId Report document id.
 * @return {Promise<object[]>}
 */
async function listMatchesForReport(reportId) {
  const [lostSnap, foundSnap] = await Promise.all([
    matchesRef().where("lostReportId", "==", reportId).get(),
    matchesRef().where("foundReportId", "==", reportId).get(),
  ]);
  const byId = new Map();
  lostSnap.docs.concat(foundSnap.docs).forEach((doc) => {
    byId.set(doc.id, {id: doc.id, ...doc.data()});
  });
  return Array.from(byId.values());
}

module.exports = {
  matchesRef,
  buildMatchDocument,
  createMatch,
  getMatch,
  updateMatchStatus,
  listMatchesForReport,
};
