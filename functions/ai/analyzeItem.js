/**
 * Replaceable AI interface for Person 3 (Featherless).
 *
 * The Firestore trigger calls this function and MUST NOT import any
 * AI provider SDK. Implement Featherless only inside this module.
 *
 * Do not return fake attributes. Until Featherless is wired, this
 * stub throws so the trigger can mark aiStatus as "failed".
 *
 * @typedef {object} ReportForAnalysis
 * @property {string} id
 * @property {string} userId
 * @property {"lost"|"found"} type
 * @property {string} title
 * @property {string} description
 * @property {string} category
 * @property {string} locationText
 * @property {string} date
 * @property {string} time
 * @property {string} imageUrl Cloudinary URL (not Firebase Storage).
 *
 * @typedef {object} AiAttributes
 * @property {string=} itemType
 * @property {string=} brand
 * @property {string=} color
 * @property {string[]=} colors
 * @property {string[]=} distinctiveFeatures
 * @property {object=} extra Provider-specific fields from Featherless.
 */

/**
 * Analyzes a newly created report and returns structured attributes.
 *
 * Person 3: replace the body of this function. Keep the same signature:
 *   analyzeItem(report) -> Promise<AiAttributes>
 *
 * Read secrets from environment / functions config. Do not hardcode keys.
 *
 * @param {ReportForAnalysis} report Newly created report (includes id).
 * @return {Promise<AiAttributes>}
 */
async function analyzeItem(report) {
  void report;
  throw new Error(
      "analyzeItem is not implemented. Person 3 should add Featherless here.",
  );
}

module.exports = {
  analyzeItem,
};
