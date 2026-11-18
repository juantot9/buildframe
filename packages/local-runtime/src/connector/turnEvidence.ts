import { sha256, sha256Parts } from '@buildframe/workspace/sha256';
import type {
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessDirectiveObservation,
  NormalizedReviewResponseResult,
} from '@buildframe/workspace/harness-interaction';

import type { ConnectorDispatchDirective, ConnectorNaming } from './contracts.js';

export type NotDispatchedReason = 'harness-rejected' | 'host-unavailable' | 'capability-withdrawn';

/** Decodes the exact committed Review Message bytes, refusing material that does not round-trip. */
export function exactReviewMessageText(directive: DispatchDirectReviewMessageInvocationDirective): string {
  const material = directive.disclosure.outgoingMaterial;
  const bytes = Buffer.from(material.bytesBase64, 'base64');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (
    bytes.toString('base64') !== material.bytesBase64 ||
    bytes.byteLength !== material.byteLength ||
    [...text].length !== material.characterLength ||
    sha256(bytes) !== material.sha256 ||
    material.sha256 !== directive.disclosure.sha256
  ) {
    throw new TypeError('Invalid exact Review Message material');
  }
  return text;
}

/** Every identity one connector session writes, prefixed so connectors never collide. */
export class ConnectorIdentities {
  readonly #naming: ConnectorNaming;
  readonly #sessionEpoch: string;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly attachmentEvidenceIdentity: string;
  #availabilitySequence = 0;
  #bridgeLossSequence = 0;

  constructor(naming: ConnectorNaming, parts: readonly string[], sessionEpoch: string) {
    this.#naming = naming;
    this.#sessionEpoch = sessionEpoch;
    this.attachmentIdentity =
      `att_${sha256Parts([naming.attachmentSeed, ...parts, sessionEpoch])}` as HarnessAttachmentIdentity;
    this.attachmentEvidenceIdentity = `${naming.attachmentEvidence}:${sha256Parts([this.attachmentIdentity, sessionEpoch])}`;
  }

  dispatchId(directive: ConnectorDispatchDirective): string {
    return `${this.#naming.turnPrefix}_${sha256Parts([
      this.attachmentIdentity,
      directive.invocationIdentity,
      this.#sessionEpoch,
    ])}`;
  }

  turnEvidence(directive: ConnectorDispatchDirective, dispatchId: string, phase: string): string {
    return `${this.#naming.namespace}-evidence:${sha256Parts([
      this.attachmentIdentity,
      directive.invocationIdentity,
      dispatchId,
      phase,
    ])}`;
  }

  availability(phase: string): string {
    this.#availabilitySequence += 1;
    return `${this.#naming.namespace}-availability:${sha256Parts([
      this.attachmentIdentity,
      this.#sessionEpoch,
      phase,
      this.#availabilitySequence.toString(36),
    ])}`;
  }

  nextBridgeLossOccurrence(): string {
    this.#bridgeLossSequence += 1;
    return `client-${this.#bridgeLossSequence.toString(36)}`;
  }

  notDispatched(
    directive: ConnectorDispatchDirective | { readonly invocationIdentity: string },
    reason: NotDispatchedReason,
  ): Extract<HarnessDirectiveObservation, { readonly status: 'proven-not-dispatched' }> {
    return {
      status: 'proven-not-dispatched',
      evidenceIdentity: `${this.#naming.namespace}-dispatch:${sha256Parts([
        this.attachmentIdentity,
        directive.invocationIdentity,
        reason,
      ])}`,
      reason,
    };
  }
}

/** A Response only from a non-empty answer within the contract's bound; anything else settles without one. */
export function responseResult(
  directive: ConnectorDispatchDirective,
  answer: string | undefined,
): NormalizedReviewResponseResult | undefined {
  const contract = directive.capabilitySnapshot.capability.artifactResultContract;
  if (answer === undefined || answer.length === 0) return undefined;
  const byteLength = Buffer.byteLength(answer, 'utf8');
  if (byteLength > contract.maximumBytes) return undefined;
  return {
    contractVersion: 1,
    contractIdentity: contract.contractIdentity,
    source: contract.source,
    body: answer,
    byteLength,
    sha256: sha256(answer),
  };
}
