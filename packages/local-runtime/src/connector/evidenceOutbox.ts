import type {
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
} from '@buildframe/workspace/harness-interaction';

const MAX_QUEUED_EVIDENCE = 128;
const STATE_VERSION_RETRIES = 3;

function retryLater(acknowledgement: HarnessEvidenceAcknowledgement): boolean {
  return (
    acknowledgement.status === 'refused' &&
    (acknowledgement.reason === 'state-version-changed' || acknowledgement.reason === 'state-unavailable')
  );
}

/**
 * Delivers evidence to the Workspace, holding what could not be delivered
 * until the next connection. Only the latest availability is kept; nothing
 * else is dropped while room remains, and nothing is ever resent once applied.
 */
export class EvidenceOutbox {
  readonly #pending = new Map<string, NormalizedHarnessEvidence>();
  #sink: HarnessEvidenceSink | undefined;
  #flushing = false;

  connect(sink: HarnessEvidenceSink): void {
    this.#sink = sink;
  }

  /** Delivers now when possible; undefined when the evidence was queued unacknowledged. */
  async emit(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement | undefined> {
    const sink = this.#sink;
    if (sink === undefined) {
      this.#queue(evidence);
      return undefined;
    }
    let acknowledgement: HarnessEvidenceAcknowledgement | undefined;
    for (let attempt = 0; attempt < STATE_VERSION_RETRIES; attempt += 1) {
      try {
        acknowledgement = await sink.accept(evidence);
      } catch {
        this.#queue(evidence);
        return undefined;
      }
      if (acknowledgement.status !== 'refused' || acknowledgement.reason !== 'state-version-changed') break;
    }
    if (acknowledgement !== undefined && retryLater(acknowledgement)) {
      this.#queue(evidence);
    } else if (acknowledgement?.status === 'applied') {
      this.#pending.delete(evidence.evidenceIdentity);
    }
    return acknowledgement;
  }

  /** Resends queued evidence in order, stopping at the first that must wait again. */
  async flush(): Promise<void> {
    if (this.#flushing || this.#sink === undefined) return;
    this.#flushing = true;
    try {
      for (const evidence of [...this.#pending.values()]) {
        if (this.#sink === undefined) return;
        let acknowledgement: HarnessEvidenceAcknowledgement;
        try {
          acknowledgement = await this.#sink.accept(evidence);
        } catch {
          return;
        }
        if (retryLater(acknowledgement)) return;
        this.#pending.delete(evidence.evidenceIdentity);
      }
    } finally {
      this.#flushing = false;
    }
  }

  #queue(evidence: NormalizedHarnessEvidence): void {
    if (evidence.kind === 'harness.availability.observed') {
      for (const [identity, pending] of this.#pending) {
        if (pending.kind === 'harness.availability.observed') this.#pending.delete(identity);
      }
    }
    if (this.#pending.size >= MAX_QUEUED_EVIDENCE) {
      const removable = [...this.#pending].find(([, pending]) => pending.kind === 'harness.availability.observed');
      if (removable !== undefined) this.#pending.delete(removable[0]);
      else if (evidence.kind === 'harness.availability.observed') return;
    }
    this.#pending.set(evidence.evidenceIdentity, evidence);
  }
}
