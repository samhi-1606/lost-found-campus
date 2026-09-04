/**
 * Firebase Cloud Functions entrypoint.
 * Keep this file thin: wire triggers and HTTPS callables only.
 */

const {setGlobalOptions} = require("firebase-functions");
require("./lib/admin");

const {onReportCreated} = require("./triggers/onReportCreated");
const {getVerifiedFoundLocation} =
  require("./https/getVerifiedFoundLocation");
const {submitExactFoundLocation} =
  require("./https/submitExactFoundLocation");

setGlobalOptions({maxInstances: 10});

exports.onReportCreated = onReportCreated;
exports.submitExactFoundLocation = submitExactFoundLocation;
exports.getVerifiedFoundLocation = getVerifiedFoundLocation;
