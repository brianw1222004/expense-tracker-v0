const TOTAL_PERCENT_BASIS = 10000;
const BASIS_PER_PERCENT = 100;

function parsePercent(value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function clampBasis(value) {
  return Math.max(0, Math.min(TOTAL_PERCENT_BASIS, Math.round(parsePercent(value) * BASIS_PER_PERCENT)));
}

function basisToText(basis) {
  const n = Math.round(basis) / BASIS_PER_PERCENT;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function distributeBasis(totalBasis, ids) {
  if (ids.length === 0) return {};
  const base = Math.floor(totalBasis / ids.length);
  let remainder = totalBasis - base * ids.length;
  const result = {};

  for (const id of ids) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    result[id] = base + extra;
  }

  return result;
}

function lockedSetFrom(lockedIds) {
  if (lockedIds instanceof Set) return lockedIds;
  if (Array.isArray(lockedIds)) return new Set(lockedIds);
  return new Set(Object.keys(lockedIds || {}).filter((id) => lockedIds[id]));
}

export function equalPercentShares(participantIds = []) {
  const ids = participantIds.filter(Boolean);
  const basis = distributeBasis(TOTAL_PERCENT_BASIS, ids);
  return Object.fromEntries(ids.map((id) => [id, basisToText(basis[id])]));
}

export function getPercentTotal(shares = {}, participantIds = []) {
  const ids = participantIds.filter(Boolean);
  const totalBasis = ids.reduce((sum, id) => sum + clampBasis(shares[id]), 0);
  return totalBasis / BASIS_PER_PERCENT;
}

export function estimatedPercentAmount(totalAmount, percent) {
  const total = Number(totalAmount);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return (total * clampBasis(percent)) / TOTAL_PERCENT_BASIS;
}

export function normalizePercentShares(shares = {}, participantIds = []) {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return {};

  const basis = Object.fromEntries(ids.map((id) => [id, clampBasis(shares[id])]));
  const total = ids.reduce((sum, id) => sum + basis[id], 0);
  if (total === 0) return equalPercentShares(ids);
  if (total === TOTAL_PERCENT_BASIS) {
    return Object.fromEntries(ids.map((id) => [id, basisToText(basis[id])]));
  }

  let diff = TOTAL_PERCENT_BASIS - total;
  for (let i = ids.length - 1; i >= 0 && diff !== 0; i -= 1) {
    const id = ids[i];
    const next = Math.max(0, Math.min(TOTAL_PERCENT_BASIS, basis[id] + diff));
    diff -= next - basis[id];
    basis[id] = next;
  }

  return Object.fromEntries(ids.map((id) => [id, basisToText(basis[id])]));
}

export function redistributePercentShares(
  changedParticipantId,
  newPercent,
  currentShares = {},
  lockedIds = {},
  participantIds = []
) {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return {};

  const locked = lockedSetFrom(lockedIds);
  const changedCanMove = ids.includes(changedParticipantId) && !locked.has(changedParticipantId);
  const basis = Object.fromEntries(ids.map((id) => [id, clampBasis(currentShares[id])]));

  if (!changedCanMove) {
    return Object.fromEntries(ids.map((id) => [id, basisToText(basis[id])]));
  }

  const lockedTotal = ids.reduce((sum, id) => (
    locked.has(id) ? sum + basis[id] : sum
  ), 0);
  const remainingCapacity = Math.max(0, TOTAL_PERCENT_BASIS - lockedTotal);
  const flexibleIds = ids.filter((id) => !locked.has(id) && id !== changedParticipantId);

  if (flexibleIds.length === 0) {
    basis[changedParticipantId] = remainingCapacity;
  } else {
    basis[changedParticipantId] = Math.min(clampBasis(newPercent), remainingCapacity);
    const distributed = distributeBasis(
      Math.max(0, TOTAL_PERCENT_BASIS - lockedTotal - basis[changedParticipantId]),
      flexibleIds
    );
    for (const id of flexibleIds) basis[id] = distributed[id];
  }

  return Object.fromEntries(ids.map((id) => [id, basisToText(basis[id])]));
}
