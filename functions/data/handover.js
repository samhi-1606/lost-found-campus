const {admin, db} = require("../lib/admin");
const {COLLECTIONS, HANDOVER_STATUS} = require("../lib/constants");

const handoversRef = () => db.collection(COLLECTIONS.HANDOVERS);

/**
 * Builds a handover record after a match is confirmed.
 * @param {object} input Handover fields.
 * @return {object} Firestore handover payload.
 */
function buildHandoverDocument(input) {
  if (!input.matchId) {
    throw new Error("matchId is required.");
  }

  return {
    matchId: input.matchId,
    lostReportId: input.lostReportId || "",
    foundReportId: input.foundReportId || "",
    ownerUserId: input.ownerUserId || "",
    finderUserId: input.finderUserId || "",
    // Optional agreed meetup text only. Never copy exact found
    // location from foundLocations into this document.
    locationText: input.locationText || "",
    scheduledAt: input.scheduledAt || null,
    status: input.status || HANDOVER_STATUS.PENDING,
    createdAt: input.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Creates a handover document.
 * @param {object} input Handover fields.
 * @return {Promise<{id: string, data: object}>}
 */
async function createHandover(input) {
  const data = buildHandoverDocument(input);
  const docRef = await handoversRef().add(data);
  return {id: docRef.id, data};
}

/**
 * Loads a handover by id.
 * @param {string} handoverId Handover document id.
 * @return {Promise<object|null>}
 */
async function getHandover(handoverId) {
  const snap = await handoversRef().doc(handoverId).get();
  if (!snap.exists) {
    return null;
  }
  return {id: snap.id, ...snap.data()};
}

/**
 * Updates handover status and optional schedule/location.
 * @param {string} handoverId Handover document id.
 * @param {object} patch Status and scheduling fields.
 * @return {Promise<void>}
 */
async function updateHandover(handoverId, patch) {
  await handoversRef().doc(handoverId).update({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Lists handovers for a match.
 * @param {string} matchId Match document id.
 * @return {Promise<object[]>}
 */
async function listHandoversForMatch(matchId) {
  const snap = await handoversRef()
      .where("matchId", "==", matchId)
      .get();
  return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

module.exports = {
  handoversRef,
  buildHandoverDocument,
  createHandover,
  getHandover,
  updateHandover,
  listHandoversForMatch,
};
