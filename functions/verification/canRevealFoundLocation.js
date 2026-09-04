const {VERIFICATION_STATUS} = require("../lib/constants");
const {getVerification} = require("../data/verification");

/**
 * Backend gate for revealing exact found-item coordinates.
 *
 * Person 4: keep verification status updates here / in data/verification.
 * This function must return true only when ALL of the following hold:
 * - uid is the claimant on the verification
 * - verification.foundReportId matches the requested found report
 * - verification.status is successful
 *
 * Pending and failed must return false. Do not treat matches or
 * login as sufficient.
 *
 * @param {object} input
 * @param {string} input.uid Authenticated claimant uid.
 * @param {string} input.foundReportId Found report id.
 * @param {string} input.verificationId Verification document id.
 * @return {Promise<boolean>}
 */
async function canRevealFoundLocation(input) {
  const uid = input && input.uid;
  const foundReportId = input && input.foundReportId;
  const verificationId = input && input.verificationId;
  if (!uid || !foundReportId || !verificationId) {
    return false;
  }

  const verification = await getVerification(verificationId);
  return isSuccessfulForClaimant(verification, uid, foundReportId);
}

/**
 * @param {object|null} verification Verification document.
 * @param {string} uid Claimant uid.
 * @param {string} foundReportId Found report id.
 * @return {boolean}
 */
function isSuccessfulForClaimant(verification, uid, foundReportId) {
  if (!verification) {
    return false;
  }
  if (verification.status === VERIFICATION_STATUS.PENDING ||
      verification.status === VERIFICATION_STATUS.FAILED) {
    return false;
  }
  return verification.status === VERIFICATION_STATUS.SUCCESSFUL &&
      verification.claimantUserId === uid &&
      verification.foundReportId === foundReportId;
}

module.exports = {
  canRevealFoundLocation,
  isSuccessfulForClaimant,
};
