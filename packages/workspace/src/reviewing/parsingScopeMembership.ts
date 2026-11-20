import { hasOnlyKeys, isRecord } from '../recordCodec.js';
import type { EvidencePath, EvidenceScopeMembership } from '../workspaceEvidence/index.js';
import { ReviewingStateProblem } from './internalTypes.js';
import { parseEvidencePath } from './parsingEvidence.js';
import { decodeReviewingBytesBase64 } from './utils.js';
export function validScopeMembershipPath(value: EvidencePath): boolean {
  const bytes = decodeReviewingBytesBase64(value.bytesBase64);
  if (bytes.byteLength === 0 || bytes[0] === 0x2f || bytes.includes(0)) {
    return false;
  }
  let start = 0;
  while (start <= bytes.byteLength) {
    const slash = bytes.indexOf(0x2f, start);
    const end = slash < 0 ? bytes.byteLength : slash;
    const component = bytes.subarray(start, end);
    if (
      component.byteLength === 0 ||
      (component.byteLength === 1 && component[0] === 0x2e) ||
      (component.byteLength === 2 && component[0] === 0x2e && component[1] === 0x2e)
    ) {
      return false;
    }
    if (slash < 0) return true;
    start = slash + 1;
  }
  return true;
}

export function parseEvidenceScopeMembership(value: unknown): EvidenceScopeMembership {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['selectionPath', 'selectionKind', 'inclusion', 'matchedSides']) ||
    (value.selectionKind !== 'file' && value.selectionKind !== 'directory') ||
    (value.inclusion !== 'ordinary' && value.inclusion !== 'explicit-ignored') ||
    !Array.isArray(value.matchedSides) ||
    value.matchedSides.length < 1 ||
    value.matchedSides.length > 2 ||
    !value.matchedSides.every(side => side === 'old' || side === 'new') ||
    new Set(value.matchedSides).size !== value.matchedSides.length ||
    !['["old"]', '["new"]', '["old","new"]'].includes(JSON.stringify(value.matchedSides)) ||
    (value.inclusion === 'explicit-ignored' && !(value.matchedSides as readonly unknown[]).includes('new'))
  ) {
    throw new ReviewingStateProblem();
  }
  const selectionPath = parseEvidencePath(value.selectionPath);
  if (!validScopeMembershipPath(selectionPath)) {
    throw new ReviewingStateProblem();
  }
  return {
    selectionPath,
    selectionKind: value.selectionKind,
    inclusion: value.inclusion,
    matchedSides: value.matchedSides as readonly ('old' | 'new')[],
  };
}
