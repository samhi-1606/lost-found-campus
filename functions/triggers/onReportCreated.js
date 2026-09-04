const {onDocumentCreated} = require("firebase-functions/firestore");
const logger = require("firebase-functions/logger");
const {analyzeItem} = require("../ai/analyzeItem");
const {saveAiResult} = require("../data/reports");
const {AI_STATUS, COLLECTIONS} = require("../lib/constants");
const {runMatchingForReport} = require("../matching/runMatching");
/**
 * Firestore trigger: reports/{reportId} on create.
 *
 * Flow:
 * 1. Receive the newly created report
 * 2. Set aiStatus to processing
 * 3. Call analyzeItem(report)
 * 4. Save the returned AI attributes
 * 5. Set aiStatus to completed
 * 6. On failure, set aiStatus to failed and leave aiAttributes null
 */
const onReportCreated = onDocumentCreated(
    `${COLLECTIONS.REPORTS}/{reportId}`,
    async (event) => {
      const snap = event.data;
      if (!snap) {
        logger.warn("onReportCreated missing snapshot");
        return;
      }

      const reportId = event.params.reportId;
      const data = snap.data();
      const report = {
        id: reportId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        description: data.description,
        category: data.category,
        locationText: data.locationText,
        date: data.date,
        time: data.time,
        imageUrl: data.imageUrl,
        status: data.status,
        createdAt: data.createdAt,
        aiStatus: data.aiStatus,
        aiAttributes: data.aiAttributes,
      };

      try {
        await saveAiResult(reportId, AI_STATUS.PROCESSING, null);
        const aiAttributes = await analyzeItem(report);
        await saveAiResult(
            reportId,
            AI_STATUS.COMPLETED,
            aiAttributes || null,
        );
        await runMatchingForReport(reportId);
      } catch (error) {
        logger.error("Report AI processing failed", {
          reportId,
          message: error && error.message,
        });
        await saveAiResult(reportId, AI_STATUS.FAILED, null);
      }
    },
);

module.exports = {
  onReportCreated,
};
