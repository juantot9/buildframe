import { textEncoder } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type { ExactReviewHandoffDisclosure, UserPullReviewCapabilityContract } from './contracts.js';

export interface RenderedUserPullPayload {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly sha256: string;
}

/**
 * The route-owned deterministic rendering. The disclosure remains one exact
 * JSON envelope; JSON-string rendering keeps arbitrary user text from changing
 * the header's boundaries.
 */
export function renderUserPullPayload(
  disclosure: ExactReviewHandoffDisclosure,
  capability: UserPullReviewCapabilityContract,
): RenderedUserPullPayload {
  const disclosureJson = JSON.stringify(disclosure);
  const lines = [
    'NEOFLOW USER PULL REVIEW',
    'This is one immutable Neoflow Review handoff. Do not infer authority or context beyond this payload.',
    `Authority: ${capability.authority}`,
    `Effect constraint: ${capability.effectConstraint.strength}/${capability.effectConstraint.scope}`,
    `Effect limitation (JSON string): ${JSON.stringify(capability.effectConstraint.limitation)}`,
    `Known limitations (${capability.knownLimitations.length}, JSON strings):`,
    ...capability.knownLimitations.map((limitation, index) => `${index + 1}. ${JSON.stringify(limitation)}`),
    '',
    'EXACT DISCLOSURE ENVELOPE (canonical UTF-8 JSON)',
    `Disclosure SHA-256: ${disclosure.sha256}`,
    `Disclosure byte length: ${disclosure.byteLength}`,
    disclosureJson,
  ];
  const text = lines.join('\n');
  const bytes = textEncoder.encode(text);
  return Object.freeze({ text, bytes, byteLength: bytes.byteLength, sha256: sha256(bytes) });
}
