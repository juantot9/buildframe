import type {
  ReviewBasisIdentity,
  ReviewBasisPayload,
  ReviewIdentity,
  ReviewMessageRepositoryState,
} from '../reviewing/index.js';
import { sha256 } from '../sha256.js';
import type { CurrentChangesCaptureReadyView } from '../workspaceEvidence/index.js';
import type { ReviewMessageCommitmentAssessmentInput } from './commitmentPolicy.js';
import type { DirectReviewCapabilityContract, HarnessInvocationIdentity } from './contracts.js';
import {
  HarnessStateProblem,
  type HarnessAttachmentIndexEntry,
  type PreparedReviewMessageTarget,
} from './internalTypes.js';
import { MESSAGE_TEMPLATE_PLACEHOLDER } from './limits.js';
import { cloneFrozen, exactUtf8, maximumBacktickRun } from './utils.js';

export function reviewMessageRepositoryState(capture: CurrentChangesCaptureReadyView): ReviewMessageRepositoryState {
  return cloneFrozen({
    kind: 'current-repository-state',
    basis: capture.basis,
    comparedState: capture.comparedState,
    manifest: capture.manifest,
  });
}

export function repositoryStatesMatch(
  left: ReviewMessageRepositoryState,
  right: ReviewMessageRepositoryState,
): boolean {
  return (
    JSON.stringify(left.basis) === JSON.stringify(right.basis) &&
    JSON.stringify(left.comparedState) === JSON.stringify(right.comparedState) &&
    left.manifest.totalFiles === right.manifest.totalFiles &&
    JSON.stringify(left.manifest.digest) === JSON.stringify(right.manifest.digest)
  );
}

export function historicalOriginLabel(basis: ReviewBasisPayload): string {
  if (basis.kind === 'git-commit') {
    return `${basis.commit.abbreviatedObjectIdentity} · ${basis.commit.subject}`;
  }
  if (basis.kind === 'saved-review-point') return 'saved review point';
  if (basis.kind === 'change-event') return 'changes observed after this Response';
  throw new HarnessStateProblem();
}

/** The accepted template placeholder set; `source`/`origin` carry saved-origin facts. */
export const MESSAGE_TEMPLATE_NAMES: ReadonlySet<string> = new Set(['message', 'location', 'source', 'origin']);

export type ReviewMessageTemplateShape =
  | { readonly status: 'valid'; readonly historical: boolean }
  | { readonly status: 'invalid' };

/** Validates the exact placeholder contract once, for live and saved-origin rendering alike. */
export function reviewMessageTemplateShape(template: string): ReviewMessageTemplateShape {
  const names = [...template.matchAll(MESSAGE_TEMPLATE_PLACEHOLDER)].map(match => match[1]!);
  const count = (name: string): number => names.filter(candidate => candidate === name).length;
  if (names.some(name => !MESSAGE_TEMPLATE_NAMES.has(name))) return { status: 'invalid' };
  if (count('message') !== 1) return { status: 'invalid' };
  const location = count('location');
  const source = count('source');
  const origin = count('origin');
  if (source !== origin || source > 1) return { status: 'invalid' };
  // A live template must carry the location; a historical one already names it in
  // the origin and source facts, so it may use `{{location}}` at most once.
  if (source === 0 ? location !== 1 : location > 1) return { status: 'invalid' };
  return { status: 'valid', historical: source === 1 };
}

export interface ReviewMessageTemplateFacts {
  readonly body: string;
  readonly locationLabel: string;
  /** Present only for a saved-origin Message; absent facts refuse a historical template. */
  readonly historical?: {
    readonly origin: string;
    readonly source: string;
  };
}

/** Renders one validated user template over the exact facts; undefined refuses the send. */
export function renderReviewMessageTemplate(template: string, facts: ReviewMessageTemplateFacts): string | undefined {
  const shape = reviewMessageTemplateShape(template);
  if (shape.status !== 'valid') return undefined;
  if (shape.historical && facts.historical === undefined) return undefined;
  // One pass only: a body that literally contains a placeholder stays text.
  return template.replace(MESSAGE_TEMPLATE_PLACEHOLDER, (whole, name: string) => {
    if (name === 'message') return facts.body;
    if (name === 'location') return facts.locationLabel;
    if (name === 'source') return facts.historical?.source ?? whole;
    if (name === 'origin') return facts.historical?.origin ?? whole;
    return whole;
  });
}

export type ReviewMessageMaterialComposition =
  | {
      readonly status: 'composed';
      readonly representation: 'live-repository-reference' | 'saved-origin';
      readonly bytes: Uint8Array;
      readonly characterLength: number;
    }
  | { readonly status: 'template-invalid' }
  | { readonly status: 'unrenderable' };

export function composeReviewMessageMaterial(
  body: string,
  target: PreparedReviewMessageTarget,
  outgoingTemplate?: string,
): ReviewMessageMaterialComposition {
  let text: string;
  let representation: 'live-repository-reference' | 'saved-origin';
  const locationLabel = `${target.location.file.display}:${target.location.line}`;
  if (target.originBasis.kind === 'live') {
    representation = 'live-repository-reference';
    if (outgoingTemplate === undefined) {
      text = `${body}\n\n${locationLabel}`;
    } else {
      const rendered = renderReviewMessageTemplate(outgoingTemplate, { body, locationLabel });
      if (rendered === undefined) return { status: 'template-invalid' };
      text = rendered;
    }
  } else {
    representation = 'saved-origin';
    const line = target.historicalLine === undefined ? undefined : exactUtf8(target.historicalLine);
    if (line === undefined || line.includes('\u0000')) return { status: 'unrenderable' };
    const fence = '`'.repeat(Math.max(3, maximumBacktickRun(line) + 1));
    const separator = line.endsWith('\n') ? '' : '\n';
    const origin = `From ${historicalOriginLabel(target.originBasis)} — ${locationLabel}:`;
    const source = `${fence}\n${line}${separator}${fence}\n\n${locationLabel} — historical source (saved review point, not current code)`;
    let rendered: string | undefined;
    if (outgoingTemplate !== undefined) {
      const shape = reviewMessageTemplateShape(outgoingTemplate);
      if (shape.status === 'invalid') return { status: 'template-invalid' };
      if (shape.historical) {
        rendered = renderReviewMessageTemplate(outgoingTemplate, {
          body,
          locationLabel,
          historical: { origin, source },
        });
      }
    }
    // A template without the historical placeholders keeps the fixed quoted-source structure.
    text = rendered ?? `${body}\n\n${origin}\n\n${source}`;
  }
  return {
    status: 'composed',
    representation,
    bytes: new TextEncoder().encode(text),
    characterLength: [...text].length,
  };
}

export function reviewMessageInspectionIdentity(input: {
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly body: string;
  readonly target: PreparedReviewMessageTarget;
  readonly attachment: HarnessAttachmentIndexEntry;
  readonly capability: DirectReviewCapabilityContract;
  readonly commitmentAssessmentIdentity: string;
  readonly outgoingMaterialSha256: string;
}): string {
  return sha256(
    JSON.stringify({
      contractVersion: 1,
      stateVersion: input.stateVersion,
      reviewIdentity: input.reviewIdentity,
      originReviewBasisIdentity: input.originReviewBasisIdentity,
      location: input.target.location,
      body: input.body,
      originBasis: input.target.originBasis,
      sourceSha256: input.target.sourceSha256,
      historicalLineSha256: input.target.historicalLine === undefined ? null : sha256(input.target.historicalLine),
      outgoingMaterialSha256: input.outgoingMaterialSha256,
      attachmentIdentity: input.attachment.attachmentIdentity,
      compatibilityIdentity: input.attachment.compatibilityIdentity,
      capabilityIdentity: input.capability.capabilityIdentity,
      artifactResultContract: input.capability.artifactResultContract,
      commitmentAssessmentIdentity: input.commitmentAssessmentIdentity,
    }),
  );
}

export function reviewMessageCommitmentInput(
  stateVersion: number,
  reviewIdentity: ReviewIdentity,
  originReviewBasisIdentity: ReviewBasisIdentity,
  attachment: HarnessAttachmentIndexEntry,
  material: Extract<ReviewMessageMaterialComposition, { readonly status: 'composed' }>,
  activeInvocationIdentities: readonly HarnessInvocationIdentity[],
  unresolvedInvocationIdentities: readonly HarnessInvocationIdentity[],
): ReviewMessageCommitmentAssessmentInput {
  return {
    stateVersion,
    reviewIdentity,
    originReviewBasisIdentity,
    attachmentIdentity: attachment.attachmentIdentity,
    destinationFingerprint: sha256(
      JSON.stringify({ attachmentIdentity: attachment.attachmentIdentity, destination: attachment.destination }),
    ),
    representation: material.representation,
    outgoingMaterial: material.bytes,
    activeInvocationIdentities,
    unresolvedInvocationIdentities,
  };
}
