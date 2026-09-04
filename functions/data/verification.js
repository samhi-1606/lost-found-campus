const {admin, db} = require("../lib/admin");
const {COLLECTIONS, VERIFICATION_STATUS} = require("../lib/constants");

const verificationsRef = () => db.collection(COLLECTIONS.VERIFICATIONS);

/**
 * Builds a verification record for a proposed match.
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

    // Stored server-side and never exposed publicly.
    expectedAnswers: Array.isArray(input.expectedAnswers) ?
      input.expectedAnswers : [],

    status: input.status || VERIFICATION_STATUS.PENDING,
    createdAt: input.createdAt ||
      admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Creates a verification document.
 * @param {object} input Verification fields.
 * @return {Promise<{id: string, data: object}>}
 */
async function createVerification(input) {
  const data = buildVerificationDocument(input);
  const docRef = await verificationsRef().add(data);

  return {
    id: docRef.id,
    data,
  };
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

  return {
    id: snap.id,
    ...snap.data(),
  };
}

/**
 * Sets verification status.
 * @param {string} verificationId Verification document id.
 * @param {string} status Verification status.
 * @param {string=} response Optional claimant response.
 * @return {Promise<void>}
 */
async function updateVerificationStatus(
    verificationId,
    status,
    response,
) {
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
 * Verifies a claimant's answers against server-side answers.
 *
 * All answers are normalized before comparison.
 * The expected answers remain stored on the server.
 *
 * @param {string} verificationId Verification document id.
 * @param {string[]} answers Claimant answers.
 * @return {Promise<object>} Verification result.
 */
async function verifyOwnership(verificationId, answers) {
  const verification = await getVerification(verificationId);

  if (!verification) {
    throw new Error("Verification not found.");
  }

  if (verification.status !== VERIFICATION_STATUS.PENDING) {
    throw new Error("Verification has already been completed.");
  }

  if (!Array.isArray(answers)) {
    throw new Error("Answers must be an array.");
  }

  const expectedAnswers = Array.isArray(
      verification.expectedAnswers,
  ) ? verification.expectedAnswers : [];

  if (expectedAnswers.length === 0) {
    throw new Error("Verification questions are not configured.");
  }

  let correct = 0;

  for (let i = 0; i < expectedAnswers.length; i++) {
    const expected = String(expectedAnswers[i] || "")
        .trim()
        .toLowerCase();

    const actual = String(answers[i] || "")
        .trim()
        .toLowerCase();

    if (expected && actual && expected === actual) {
      correct++;
    }
  }

  const successful = correct === expectedAnswers.length;

  await updateVerificationStatus(
      verificationId,
      successful ?
        VERIFICATION_STATUS.SUCCESSFUL :
        VERIFICATION_STATUS.FAILED,
      answers.join(" | "),
  );

  return {
    verificationId,
    successful,
    correct,
    total: expectedAnswers.length,
  };
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

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Successful verifications for a claimant and found report.
 * Used by the location-reveal gate.
 * @param {string} claimantUserId Claimant uid.
 * @param {string} foundReportId Found report id.
 * @return {Promise<object[]>}
 */
async function listSuccessfulVerifications(
    claimantUserId,
    foundReportId,
) {
  const snap = await verificationsRef()
      .where("claimantUserId", "==", claimantUserId)
      .where("foundReportId", "==", foundReportId)
      .where("status", "==", VERIFICATION_STATUS.SUCCESSFUL)
      .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

module.exports = {
  verificationsRef,
  buildVerificationDocument,
  createVerification,
  getVerification,
  updateVerificationStatus,
  verifyOwnership,
  listVerificationsForMatch,
  listSuccessfulVerifications,
};
