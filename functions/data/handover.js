const crypto = require("crypto");
const {admin, db} = require("../lib/admin");
const {COLLECTIONS, HANDOVER_STATUS} = require("../lib/constants");

const handoversRef = () => db.collection(COLLECTIONS.HANDOVERS);

function hashCode(code) {
  return crypto
      .createHash("sha256")
      .update(code)
      .digest("hex");
}

function generateCode() {
  return `LF-${crypto.randomInt(100000, 1000000)}`;
}

/**
 * Builds a handover record.
 * The one-time code is stored only as a hash.
 *
 * @param {object} input Handover fields.
 * @return {object} Firestore handover payload.
 */
function buildHandoverDocument(input) {
  if (!input.matchId) {
    throw new Error("matchId is required.");
  }

  if (!input.lostReportId) {
    throw new Error("lostReportId is required.");
  }

  if (!input.foundReportId) {
    throw new Error("foundReportId is required.");
  }

  if (!input.ownerUserId) {
    throw new Error("ownerUserId is required.");
  }

  if (!input.finderUserId) {
    throw new Error("finderUserId is required.");
  }

  return {
    matchId: input.matchId,
    lostReportId: input.lostReportId,
    foundReportId: input.foundReportId,
    ownerUserId: input.ownerUserId,
    finderUserId: input.finderUserId,
    locationText: input.locationText || "",
    scheduledAt: input.scheduledAt || null,

    codeHash: input.codeHash || null,
    codeUsed: false,
    codeExpiresAt: input.codeExpiresAt || null,

    status: input.status || HANDOVER_STATUS.PENDING,
    createdAt: input.createdAt ||
      admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Creates a handover with a secure one-time code.
 *
 * @param {object} input Handover fields.
 * @return {Promise<object>} Handover and one-time code.
 */
async function createHandover(input) {
  const code = generateCode();
  const codeHash = hashCode(code);

  const data = buildHandoverDocument({
    ...input,
    codeHash,
  });

  const docRef = await handoversRef().add(data);

  return {
    id: docRef.id,
    code,
    data,
  };
}

/**
 * Loads a handover by id.
 *
 * @param {string} handoverId Handover document id.
 * @return {Promise<object|null>}
 */
async function getHandover(handoverId) {
  const snap = await handoversRef().doc(handoverId).get();

  if (!snap.exists) {
    return null;
  }

  return {
    id: snap.id,
    ...snap.data(),
  };
}

/**
 * Updates a handover.
 *
 * @param {string} handoverId Handover document id.
 * @param {object} patch Fields to update.
 * @return {Promise<void>}
 */
async function updateHandover(handoverId, patch) {
  await handoversRef().doc(handoverId).update({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Redeems the one-time handover code.
 *
 * @param {string} handoverId Handover document id.
 * @param {string} code One-time handover code.
 * @return {Promise<object>} Redemption result.
 */
async function redeemHandoverCode(handoverId, code) {
  if (!code || typeof code !== "string") {
    throw new Error("Handover code is required.");
  }

  const handoverRef = handoversRef().doc(handoverId);

  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(handoverRef);

    if (!snap.exists) {
      throw new Error("Handover not found.");
    }

    const handover = snap.data();

    if (handover.codeUsed) {
      throw new Error("Handover code has already been used.");
    }

    if (handover.status === HANDOVER_STATUS.CANCELLED) {
      throw new Error("Handover has been cancelled.");
    }

    if (handover.codeExpiresAt) {
      const expiresAt = handover.codeExpiresAt.toDate ?
        handover.codeExpiresAt.toDate() :
        new Date(handover.codeExpiresAt);

      if (expiresAt <= new Date()) {
        throw new Error("Handover code has expired.");
      }
    }

    const suppliedHash = hashCode(code.trim());

    if (suppliedHash !== handover.codeHash) {
      throw new Error("Invalid handover code.");
    }

    transaction.update(handoverRef, {
      codeUsed: true,
      status: HANDOVER_STATUS.COMPLETED,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      handoverId,
      completed: true,
    };
  });

  return result;
}

/**
 * Lists handovers for a match.
 *
 * @param {string} matchId Match document id.
 * @return {Promise<object[]>}
 */
async function listHandoversForMatch(matchId) {
  const snap = await handoversRef()
      .where("matchId", "==", matchId)
      .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

module.exports = {
  handoversRef,
  buildHandoverDocument,
  createHandover,
  getHandover,
  updateHandover,
  redeemHandoverCode,
  listHandoversForMatch,
};
