/**
 * Trusted campus landmark reference data.
 *
 * Populated with the 7 landmarks confirmed by the team's UI prototype. Location
 * normalization treats this data as authoritative; the AI can only suggest one
 * of these existing landmarks, never invent a new one.
 *
 * SECURITY: a `CampusLandmark` is COARSE reference data only. It deliberately
 * has NO latitude/longitude. Exact coordinates belong to the later
 * verified-location flow (`prepareVerifiedLocationResponse`), never here.
 *
 * Aliases are conservative linguistic variations of the confirmed names only —
 * no invented physical features (e.g. "library steps", "north library").
 */

export interface CampusLandmark {
  /** Stable identifier, e.g. "main-gate". */
  id: string;
  /** Canonical display name, e.g. "Main Gate". */
  name: string;
  /** Alternative names/phrases users might type, e.g. ["main entrance", "front gate"]. */
  aliases: string[];
  /** Coarse zone/area label, e.g. "entrance". */
  zone: string;
}

/** The 7 confirmed campus landmarks. No coordinates; coarse zones only. */
export const CAMPUS_LANDMARKS: CampusLandmark[] = [
  {
    id: 'library',
    name: 'Library',
    aliases: ['lib', 'the library'],
    zone: 'academic',
  },
  {
    id: 'student-services',
    name: 'Student Services',
    aliases: ['student service', 'student services'],
    zone: 'services',
  },
  {
    id: 'reception',
    name: 'Reception',
    aliases: ['reception desk', 'the reception'],
    zone: 'services',
  },
  {
    id: 'security',
    name: 'Security',
    aliases: ['security office'],
    zone: 'security',
  },
  {
    id: 'main-gate',
    name: 'Main Gate',
    aliases: ['main entrance', 'front gate'],
    zone: 'entrance',
  },
  {
    id: 'cafeteria',
    name: 'Cafeteria',
    aliases: ['canteen', 'cafe'],
    zone: 'food',
  },
  {
    id: 'main-campus-security-desk',
    name: 'Main Campus Security Desk',
    aliases: ['security desk', 'campus security desk', 'main security desk'],
    zone: 'security',
  },
];
