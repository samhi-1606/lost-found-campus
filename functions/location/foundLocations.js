const {admin, db} = require("../lib/admin");
const {COLLECTIONS} = require("../lib/constants");

const foundLocationsRef = () => db.collection(COLLECTIONS.FOUND_LOCATIONS);

/**
 * Exact found-item coordinates. Admin SDK only.
 * Never write these fields onto reports/{reportId}.
 * @param {object} input
 * @return {object} Firestore payload.
 */
function buildFoundLocationDocument(input) {
  if (!input.foundReportId) {
    throw new Error("foundReportId is required.");
  }
  if (typeof input.latitude !== "number" ||
      typeof input.longitude !== "number") {
    throw new Error("latitude and longitude are required numbers.");
  }

  return {
    foundReportId: input.foundReportId,
    submittedByUserId: input.submittedByUserId || "",
    latitude: input.latitude,
    longitude: input.longitude,
    exactLocation: input.exactLocation || "",
    createdAt: input.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Writes exact location under the found report id.
 * @param {string} foundReportId Found report document id.
 * @param {object} input Exact coordinate fields.
 * @return {Promise<void>}
 */
async function saveFoundLocation(foundReportId, input) {
  const data = buildFoundLocationDocument({
    ...input,
    foundReportId,
  });
  await foundLocationsRef().doc(foundReportId).set(data);
}

/**
 * Loads exact found location. Do not return this to clients except
 * via getVerifiedFoundLocation after successful verification.
 * @param {string} foundReportId Found report document id.
 * @return {Promise<object|null>}
 */
async function getFoundLocation(foundReportId) {
  const snap = await foundLocationsRef().doc(foundReportId).get();
  if (!snap.exists) {
    return null;
  }
  return {id: snap.id, ...snap.data()};
}

module.exports = {
  foundLocationsRef,
  buildFoundLocationDocument,
  saveFoundLocation,
  getFoundLocation,
};
