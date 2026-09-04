const {
    REPORT_TYPE,
    MATCH_STATUS,
  } = require("../lib/constants");
  
  const {
    listOpenReportsByType,
    getReport,
  } = require("../data/reports");
  
  const {
    createMatch,
  } = require("../data/matches");
  
  let aiModulePromise;
  
  async function getAiModule() {
    if (!aiModulePromise) {
      aiModulePromise = import("@lfc/ai");
    }
  
    return aiModulePromise;
  }
  
  function toTimestamp(report) {
    if (report.date && report.time) {
      const parsed = new Date(`${report.date}T${report.time}`);
  
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  
    if (
      report.createdAt &&
      typeof report.createdAt.toDate === "function"
    ) {
      return report.createdAt.toDate().toISOString();
    }
  
    if (report.createdAt instanceof Date) {
      return report.createdAt.toISOString();
    }
  
    return new Date().toISOString();
  }
  
  function toAiReport(report) {
    return {
      id: report.id,
      type: report.type,
      description: [
        report.title,
        report.description,
        report.category,
      ]
        .filter(Boolean)
        .join(". "),
      imageUrl: report.imageUrl || null,
      locationDescription: report.locationText || "",
      timestamp: toTimestamp(report),
    };
  }
  
  function toPipelineReport(report) {
    return {
      report: toAiReport(report),
      attributes: report.aiAttributes || null,
    };
  }
  
  async function saveMatches(result) {
    for (const match of result.matches) {
      await createMatch({
        lostReportId: result.lostReportId,
        foundReportId: match.candidateId,
        status: MATCH_STATUS.PENDING,
        score: Math.round(match.decision.score * 100),
        confidence: match.decision.score,
        matchedAttributes: match.comparison.matchingFeatures,
        contradictions: match.comparison.conflictingFeatures,
        reasons: match.decision.evidence,
        recommendation: match.decision.tier,
      });
    }
  }
  
  async function runMatchingForReport(reportId) {
    const report = await getReport(reportId);
  
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }
  
    const ai = await getAiModule();
  
    const config = ai.loadConfig();
    ai.assertApiKey(config);
  
    const client = ai.createFeatherlessClient(config);
  
    if (report.type === REPORT_TYPE.LOST) {
      const foundReports = await listOpenReportsByType(
          REPORT_TYPE.FOUND,
      );
  
      if (foundReports.length === 0) {
        return {
          status: "no_candidates",
          lostReportId: report.id,
          matches: [],
          rankedCandidateCount: 0,
          comparedCandidateCount: 0,
          warnings: [],
        };
      }
  
      const result = await ai.runMatchingPipeline(
          toPipelineReport(report),
          foundReports.map(toPipelineReport),
          {
            client,
            config,
          },
          {
            topK: 10,
          },
      );
  
      await saveMatches(result);
  
      return result;
    }
  
    if (report.type === REPORT_TYPE.FOUND) {
      const lostReports = await listOpenReportsByType(
          REPORT_TYPE.LOST,
      );
  
      if (lostReports.length === 0) {
        return {
          status: "no_candidates",
          lostReportId: null,
          matches: [],
          rankedCandidateCount: 0,
          comparedCandidateCount: 0,
          warnings: [],
        };
      }
  
      const results = [];
  
      for (const lostReport of lostReports) {
        const result = await ai.runMatchingPipeline(
            toPipelineReport(lostReport),
            [toPipelineReport(report)],
            {
              client,
              config,
            },
            {
              topK: 1,
            },
        );
  
        await saveMatches(result);
  
        for (const match of result.matches) {
          results.push({
            ...match,
            lostReportId: lostReport.id,
          });
        }
      }
  
      return {
        status: results.length > 0 ? "ok" : "no_candidates",
        lostReportId: null,
        matches: results,
        rankedCandidateCount: results.length,
        comparedCandidateCount: results.length,
        warnings: [],
      };
    }
  
    throw new Error(
        `Unsupported report type: ${report.type}`,
    );
  }
  
  module.exports = {
    runMatchingForReport,
  };