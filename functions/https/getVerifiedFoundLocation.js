const {onCall, HttpsError} = require("firebase-functions/https");
const {canRevealFoundLocation} =
  require("../verification/canRevealFoundLocation");
const {getFoundLocation} = require("../location/foundLocations");

/**
 * Returns exact found coordinates only after successful verification.
 *
 * Coordinates are loaded from foundLocations AFTER the gate passes.
 * Pending or failed verification never reaches that read for the client.
 *
 * Request data: { foundReportId: string, verificationId: string }
 */
const getVerifiedFoundLocation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
        "unauthenticated",
        "Sign in required to request a found location.",
    );
  }

  const data = request.data || {};
  const foundReportId = data.foundReportId;
  const verificationId = data.verificationId;
  if (!foundReportId || typeof foundReportId !== "string") {
    throw new HttpsError(
        "invalid-argument",
        "foundReportId is required.",
    );
  }
  if (!verificationId || typeof verificationId !== "string") {
    throw new HttpsError(
        "invalid-argument",
        "verificationId is required.",
    );
  }

  const allowed = await canRevealFoundLocation({
    uid: request.auth.uid,
    foundReportId,
    verificationId,
  });
  if (!allowed) {
    throw new HttpsError(
        "permission-denied",
        "Exact found location is available only after successful " +
        "ownership verification.",
    );
  }

  const location = await getFoundLocation(foundReportId);
  if (!location) {
    throw new HttpsError(
        "not-found",
        "No protected found location is stored for this report.",
    );
  }

  return {
    foundReportId: location.foundReportId,
    latitude: location.latitude,
    longitude: location.longitude,
    exactLocation: location.exactLocation || "",
  };
});

module.exports = {
  getVerifiedFoundLocation,
};
