const {admin, db} = require("../lib/admin");
const {COLLECTIONS, VERIFICATION_STATUS} = require("../lib/constants");

const verificationsRef = () => db.collection(COLLECTIONS.VERIFICATIONS);

/**
 * Builds a verification record for a proposed match.
 * Person 4 implements how status becomes successful or failed.
 * @param {object} input Verification fields.
 * @return {object} Firestore verification payload.
 */
function buildVerificationDocument(input) {
  if (!input.matchId) {
    throw new Error("matchId is required.");
  }
  if (!input.foundReportId) {
    throw new Error("foundReportId is required.");
  }
  if (!input.claimantUserId) {
    throw new Error("claimantUserId is required.");
  }

  return {
    matchId: input.matchId,
    foundReportId: input.foundReportId,
    lostReportId: input.lostReportId || "",
    claimantUserId: input.claimantUserId,
    reportId: input.reportId || input.lostReportId || "",
    method: input.method || "question",
    prompt: input.prompt || "",
    response: input.response || "",
    status: input.status || VERIFICATION_STATUS.PENDING,
    createdAt: input.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Creates a verification document (Admin SDK / Cloud Functions only).
 * @param {object} input Verification fields.
 * @return {Promise<{id: string, data: object}>}
 */
async function createVerification(input) {
  const data = buildVerificationDocument(input);
  const docRef = await verificationsRef().add(data);
  return {id: docRef.id, data};
}

/**
 * Loads a verification by id.
 * @param {string} verificationId Verification document id.
 * @return {Promise<object|null>}
 */
async function getVerification(verificationId) {
  const snap = await verificationsRef().doc(verificationId).get();
  if (!snap.exists) {
    return null;
  }
  return {id: snap.id, ...snap.data()};
}

/**
 * Sets verification to pending, successful, or failed.
 * @param {string} verificationId Verification document id.
 * @param {string} status VERIFICATION_STATUS value.
 * @param {string=} response Optional claimant response.
 * @return {Promise<void>}
 */
async function updateVerificationStatus(verificationId, status, response) {
  const allowed = Object.values(VERIFICATION_STATUS);
  if (allowed.indexOf(status) === -1) {
    throw new Error("Invalid verification status.");
  }
  const patch = {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (response !== undefined) {
    patch.response = response;
  }
  await verificationsRef().doc(verificationId).update(patch);
}

/**
 * Lists verifications for a match.
 * @param {string} matchId Match document id.
 * @return {Promise<object[]>}
 */
async function listVerificationsForMatch(matchId) {
  const snap = await verificationsRef()
      .where("matchId", "==", matchId)
      .get();
  return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

/**
 * Successful verifications for a claimant and found report.
 * Used by the location-reveal gate.
 * @param {string} claimantUserId Claimant uid.
 * @param {string} foundReportId Found report id.
 * @return {Promise<object[]>}
 */
async function listSuccessfulVerifications(claimantUserId, foundReportId) {
  const snap = await verificationsRef()
      .where("claimantUserId", "==", claimantUserId)
      .where("foundReportId", "==", foundReportId)
      .where("status", "==", VERIFICATION_STATUS.SUCCESSFUL)
      .get();
  return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

module.exports = {
  verificationsRef,
  buildVerificationDocument,
  createVerification,
  getVerification,
  updateVerificationStatus,
  listVerificationsForMatch,
  listSuccessfulVerifications,
};
