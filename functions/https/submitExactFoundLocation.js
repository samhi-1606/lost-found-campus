const {onCall, HttpsError} = require("firebase-functions/https");
const {REPORT_TYPE} = require("../lib/constants");
const {getReport} = require("../data/reports");
const {saveFoundLocation} = require("../location/foundLocations");

/**
 * Trusted write path for exact FOUND coordinates.
 *
 * Clients cannot write foundLocations (rules deny all). The finder
 * must call this after creating a FOUND report that contains only a
 * coarse locationText. Coordinates are never stored on reports/.
 *
 * Does not return coordinates. Claimants receive them only from
 * getVerifiedFoundLocation after successful verification.
 *
 * Request data:
 * { foundReportId, latitude, longitude, exactLocation? }
 */
const submitExactFoundLocation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
        "unauthenticated",
        "Sign in required to submit a found location.",
    );
  }

  const data = request.data || {};
  const foundReportId = data.foundReportId;
  const latitude = data.latitude;
  const longitude = data.longitude;
  const exactLocation = data.exactLocation;

  if (!foundReportId || typeof foundReportId !== "string") {
    throw new HttpsError("invalid-argument", "foundReportId is required.");
  }
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    throw new HttpsError(
        "invalid-argument",
        "latitude and longitude must be finite numbers.",
    );
  }
  if (latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) {
    throw new HttpsError("invalid-argument", "Coordinates are out of range.");
  }

  const report = await getReport(foundReportId);
  if (!report || report.type !== REPORT_TYPE.FOUND) {
    throw new HttpsError("not-found", "Found report was not found.");
  }
  if (report.userId !== request.auth.uid) {
    throw new HttpsError(
        "permission-denied",
        "Only the finder who created the report may submit its location.",
    );
  }

  await saveFoundLocation(foundReportId, {
    submittedByUserId: request.auth.uid,
    latitude,
    longitude,
    exactLocation: typeof exactLocation === "string" ? exactLocation : "",
  });

  return {ok: true, foundReportId};
});

/**
 * @param {*} value Candidate number.
 * @return {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

module.exports = {
  submitExactFoundLocation,
};
