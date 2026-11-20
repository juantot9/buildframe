import type { EvidenceContentAvailability, EvidenceContentIdentity, EvidenceContentLimitation } from './contracts.js';

export interface EvidenceGeneratedClassification {
  readonly classification: 'generated';
  readonly source: 'git-attribute';
  readonly attribute: 'linguist-generated' | 'generated';
}

export interface EvidenceLargeFilePointer {
  readonly kind: 'git-lfs-pointer-v1';
  readonly pointer: {
    readonly byteLength: number;
    readonly contentIdentity: EvidenceContentIdentity;
    readonly bytesBase64: string;
  };
  readonly declaredPayload: {
    readonly objectIdentity: EvidenceContentIdentity;
    readonly byteLength: number;
  };
  readonly sideRepresentation: 'pointer' | 'payload' | 'unverified';
  readonly localPayload: {
    readonly availability: 'available' | 'unavailable' | 'unverified';
    readonly contentAvailability: EvidenceContentAvailability;
    readonly contentIdentity?: EvidenceContentIdentity;
    readonly contentLimitation?: EvidenceContentLimitation;
  };
}

/**
 * How Git turns a working-tree file's CRLF into LF when it reads it, from its
 * `text`, `crlf` and `eol` attributes and `core.autocrlf`: always (`text`), or
 * only when Git takes the content for text and the version it compares
 * against has no CR (`auto`). Recorded only on a working-tree file that has a
 * CRLF, so a file Git leaves alone keeps exactly the evidence it had before.
 */
export type EvidenceLineEndingConversion = 'text' | 'auto';
