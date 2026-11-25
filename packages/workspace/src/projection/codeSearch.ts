import type { ReviewSnapshotPayload } from '../reviewing/index.js';
import type { WorkspaceEvidence } from '../workspaceEvidence/index.js';
import type {
  ReviewCodeSearchSource,
  ReviewCodeSearchView,
  ReviewCodeSearchViewRequest,
} from './codeSearchContracts.js';
import { MAX_REVIEW_SEARCH_QUERY_BYTES, REVIEW_ID_PATTERN, WORKSPACE_PROJECTION_VERSION } from './limits.js';

const MAX_CODE_SEARCH_MATCHES = 200;
const MAX_CODE_SEARCH_LINE_BYTES = 512;

export function normalizeCodeSearchRequest(
  request: Record<string, unknown>,
  value: unknown,
): ReviewCodeSearchViewRequest {
  const path = request.pathBytesBase64;
  if (
    typeof request.reviewIdentity !== 'string' ||
    !REVIEW_ID_PATTERN.test(request.reviewIdentity) ||
    typeof request.query !== 'string' ||
    request.query.trim().length === 0 ||
    Buffer.byteLength(request.query) > MAX_REVIEW_SEARCH_QUERY_BYTES ||
    /[\u0000-\u001f\u007f]/u.test(request.query) ||
    (path !== undefined &&
      (typeof path !== 'string' || path.length === 0 || Buffer.from(path, 'base64').toString('base64') !== path))
  ) {
    throw new TypeError('Invalid Code search request');
  }
  return value as ReviewCodeSearchViewRequest;
}

/** A live Review searches the code as it is now; a fixed one, the files of the commit it compared. */
function searchedSource(snapshot: ReviewSnapshotPayload): ReviewCodeSearchSource {
  const compared = snapshot.comparedState;
  return compared.kind === 'commit' || compared.kind === 'tree'
    ? {
        kind: 'commit',
        objectIdentity: compared.objectIdentity,
        abbreviatedObjectIdentity: compared.abbreviatedObjectIdentity,
      }
    : { kind: 'now' };
}

export async function codeSearchView(
  request: ReviewCodeSearchViewRequest,
  stateVersion: number,
  snapshot: ReviewSnapshotPayload | undefined,
  evidence: Pick<WorkspaceEvidence, 'searchCode'>,
): Promise<ReviewCodeSearchView> {
  const header = {
    kind: 'review.code-search',
    projectionVersion: WORKSPACE_PROJECTION_VERSION,
    stateVersion,
    reviewIdentity: request.reviewIdentity,
    query: request.query,
  } as const;
  if (snapshot === undefined) return { ...header, status: 'not-found', reason: 'review-not-found' };
  const searched = searchedSource(snapshot);
  const result = await evidence.searchCode({
    query: request.query,
    ...(searched.kind === 'commit' ? { objectIdentity: searched.objectIdentity } : {}),
    ...(request.pathBytesBase64 === undefined ? {} : { pathBytes: Buffer.from(request.pathBytesBase64, 'base64') }),
    maxMatches: MAX_CODE_SEARCH_MATCHES,
    maxLineBytes: MAX_CODE_SEARCH_LINE_BYTES,
  });
  if (result.status !== 'available') return { ...header, status: 'unavailable', reason: result.reason };
  return { ...header, status: 'available', searched, matches: result.matches, totalMatches: result.totalMatches };
}
