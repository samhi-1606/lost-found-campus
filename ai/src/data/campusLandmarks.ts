/**
 * Trusted campus landmark reference data.
 *
 * =====================  PLACEHOLDER — NOT REAL DATA  =====================
 * The real campus landmark dataset will be supplied by the team later. This
 * file intentionally ships an EMPTY list: no landmarks, no coordinates, no
 * invented places. Location normalization treats this data as authoritative,
 * so until it is populated every AI suggestion will resolve to "unmatched".
 *
 * SECURITY: a `CampusLandmark` is COARSE reference data only. It deliberately
 * has NO latitude/longitude. Exact coordinates belong to the later
 * verified-location flow (`prepareVerifiedLocationResponse`), never here.
 * =========================================================================
 */

export interface CampusLandmark {
  /** Stable identifier, e.g. "main-library". */
  id: string;
  /** Canonical display name, e.g. "Main Library". */
  name: string;
  /** Alternative names/phrases users might type, e.g. ["central library", "lib"]. */
  aliases: string[];
  /** Coarse zone/area label, e.g. "Academic Zone". */
  zone: string;
}

/**
 * Empty placeholder. Populate with the team's trusted dataset (or inject a
 * landmark list into the normalization service). Do NOT add invented landmarks
 * or coordinates here.
 */
export const CAMPUS_LANDMARKS: CampusLandmark[] = [];
