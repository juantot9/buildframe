import type {
  LegacyReviewSourceKind,
  LegacyReviewSourceRecognition,
  LegacyReviewSourceRequest,
} from '../legacyReviewSource.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type {
  LegacyReviewMovedReceiptRecognitionSummary,
  LegacyReviewMovedReceiptSearch,
  LegacyReviewMovedReceiptSearchSummary,
  LegacyReviewReceiptRecognitionSummary,
  LegacyReviewRecognitionFailure,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceLocation,
} from './contracts.js';
import {
  LegacyReviewImportStateProblem,
  type LegacyReviewMovedReceiptLocator,
  type LegacyReviewMovedReceiptLocatorSearch,
  type LegacyReviewSourceDescriptor,
  type LegacyReviewSourceOccurrencePayload,
} from './internalTypes.js';
import { LEGACY_CHECKOUT_HASH_PATTERN, LEGACY_PATH_WINDOW_BYTES, MAX_MOVED_RECEIPT_SEARCH_ENTRIES } from './limits.js';
import { textWindow } from './projections.js';
import { errorCode } from './utils.js';
import type { BigIntStats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export function sourceIdentityFor(
  sourceKind_: LegacyReviewSourceKind,
  location: LegacyReviewSourceLocation | 'moved-legacy-state',
  request: LegacyReviewSourceRequest,
): LegacyReviewSourceIdentity {
  const sourcePath = path.join(path.resolve(request.trustedRoot), ...request.relativePath);
  return `lgs_${sha256(
    `neoflow-legacy-review-source-v1\0${sourceKind_}\0${location}\0${sourcePath}`,
  )}` as LegacyReviewSourceIdentity;
}

export function sourceDescriptors(
  canonicalCheckout: string,
  legacyStateRoot: string,
): readonly [LegacyReviewSourceDescriptor, LegacyReviewSourceDescriptor] {
  const queueRequest: LegacyReviewSourceRequest = {
    sourceKind: 'queue',
    trustedRoot: canonicalCheckout,
    relativePath: ['.neoflow', 'review.json'],
  };
  const legacyCheckoutHash = sha256(canonicalCheckout);
  const receiptRequest: LegacyReviewSourceRequest = {
    sourceKind: 'receipts',
    trustedRoot: legacyStateRoot,
    relativePath: ['neoflow', 'workspaces', legacyCheckoutHash, 'review-receipts.json'],
  };
  return [
    {
      sourceIdentity: sourceIdentityFor('queue', 'current-checkout', queueRequest),
      sourceKind: 'queue',
      location: 'current-checkout',
      request: queueRequest,
    },
    {
      sourceIdentity: sourceIdentityFor('receipts', 'current-legacy-state', receiptRequest),
      sourceKind: 'receipts',
      location: 'current-legacy-state',
      request: receiptRequest,
    },
  ];
}

export function movedReceiptDescriptor(
  legacyStateRoot: string,
  legacyCheckoutHash: string,
): LegacyReviewMovedReceiptLocator {
  const request: LegacyReviewSourceRequest = {
    sourceKind: 'receipts',
    trustedRoot: legacyStateRoot,
    relativePath: ['neoflow', 'workspaces', legacyCheckoutHash, 'review-receipts.json'],
  };
  return {
    legacyCheckoutHash,
    descriptor: {
      sourceIdentity: sourceIdentityFor('receipts', 'moved-legacy-state', request),
      sourceKind: 'receipts',
      location: 'moved-legacy-state',
      request,
    },
  };
}

export function sameDirectoryIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

export async function inspectMovedReceiptDirectory(
  legacyStateRoot: string,
  currentCheckoutHash: string,
): Promise<LegacyReviewMovedReceiptLocatorSearch> {
  const directories = [
    legacyStateRoot,
    path.join(legacyStateRoot, 'neoflow'),
    path.join(legacyStateRoot, 'neoflow', 'workspaces'),
  ];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before: BigIntStats[] = [];
    let missing = false;
    for (const directory of directories) {
      try {
        const information = await fs.lstat(directory, { bigint: true });
        if (information.isSymbolicLink() || !information.isDirectory()) {
          return { status: 'unavailable', reason: 'search-root-unavailable' };
        }
        before.push(information);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') {
          missing = true;
          break;
        }
        return { status: 'unavailable', reason: 'search-root-unavailable' };
      }
    }
    if (missing) return { status: 'available', locators: [] };

    const hashes: string[] = [];
    let entriesSeen = 0;
    try {
      const workspaceDirectory = directories[2];
      if (workspaceDirectory === undefined) {
        throw new LegacyReviewImportStateProblem();
      }
      const directory = await fs.opendir(workspaceDirectory);
      for await (const entry of directory) {
        entriesSeen += 1;
        if (entriesSeen > MAX_MOVED_RECEIPT_SEARCH_ENTRIES) {
          return { status: 'unavailable', reason: 'search-entry-limit' };
        }
        if (LEGACY_CHECKOUT_HASH_PATTERN.test(entry.name) && entry.name !== currentCheckoutHash) {
          hashes.push(entry.name);
        }
      }
    } catch {
      return { status: 'unavailable', reason: 'search-root-unavailable' };
    }

    const after: BigIntStats[] = [];
    let stable = true;
    for (const [index, directory] of directories.entries()) {
      try {
        const information = await fs.lstat(directory, { bigint: true });
        const prior = before[index];
        if (
          prior === undefined ||
          information.isSymbolicLink() ||
          !information.isDirectory() ||
          !sameDirectoryIdentity(prior, information)
        ) {
          stable = false;
          break;
        }
        after.push(information);
      } catch {
        stable = false;
        break;
      }
    }
    if (!stable || after.length !== directories.length) continue;
    hashes.sort();
    return {
      status: 'available',
      locators: hashes.map(hash => movedReceiptDescriptor(legacyStateRoot, hash)),
    };
  }
  return { status: 'unavailable', reason: 'search-root-unavailable' };
}

export function distinctLegacyWorkspacePaths(
  recognition: Extract<LegacyReviewSourceRecognition, { readonly format: 'receipts-v1' }>,
): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const batch of recognition.value.batches) {
    for (const candidate of [batch.workspace, batch.harness.workspace]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      result.push(candidate);
    }
  }
  return result;
}

export function movedRecognitionSummary(
  recognition: LegacyReviewSourceRecognition,
): LegacyReviewMovedReceiptRecognitionSummary | LegacyReviewRecognitionFailure {
  if (recognition.status === 'unrecognized') {
    return {
      status: 'unrecognized',
      reason: recognition.reason,
      ...(recognition.observedVersion === undefined ? {} : { observedVersion: recognition.observedVersion }),
    };
  }
  if (recognition.format !== 'receipts-v1') {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    status: 'recognized',
    format: 'receipts-v1',
    totalBatches: recognition.value.batches.length,
    totalAnnotations: recognition.value.batches.reduce((total, batch) => total + batch.annotations.length, 0),
    totalLegacyWorkspacePaths: distinctLegacyWorkspacePaths(recognition).length,
  };
}

export function movedSearchSummary(search: LegacyReviewMovedReceiptSearch): LegacyReviewMovedReceiptSearchSummary {
  return search.kind === 'legacy-state-directory'
    ? { kind: 'legacy-state-directory' }
    : {
        kind: 'former-checkout-path',
        exactFormerCanonicalCheckout: textWindow(search.exactFormerCanonicalCheckout, LEGACY_PATH_WINDOW_BYTES),
      };
}

export function workspacePathSummary(
  recognition: Extract<LegacyReviewSourceRecognition, { readonly format: 'receipts-v1' }>,
): LegacyReviewReceiptRecognitionSummary['legacyWorkspacePaths'] {
  const paths = new Set<string>();
  for (const batch of recognition.value.batches) {
    paths.add(batch.workspace);
    paths.add(batch.harness.workspace);
  }
  const values = [...paths].filter(value => Buffer.byteLength(value) <= 4_096).slice(0, 32);
  return deepFreeze({
    totalDistinct: paths.size,
    values,
    omitted: paths.size - values.length,
  });
}

export function recognitionSummary(
  sourceKind_: LegacyReviewSourceKind,
  recognition: LegacyReviewSourceRecognition,
): LegacyReviewSourceOccurrencePayload['recognition'] {
  if (recognition.status === 'unrecognized') {
    return deepFreeze({
      status: 'unrecognized',
      reason: recognition.reason,
      ...(recognition.observedVersion === undefined ? {} : { observedVersion: recognition.observedVersion }),
    });
  }
  if (sourceKind_ === 'queue') {
    if (recognition.format === 'receipts-v1' || !('annotations' in recognition.value)) {
      throw new LegacyReviewImportStateProblem();
    }
    return deepFreeze({
      status: 'recognized',
      format: recognition.format,
      totalAnnotations: recognition.value.annotations.length,
    });
  }
  if (recognition.format !== 'receipts-v1' || !('batches' in recognition.value)) {
    throw new LegacyReviewImportStateProblem();
  }
  return deepFreeze({
    status: 'recognized',
    format: recognition.format,
    totalBatches: recognition.value.batches.length,
    totalAnnotations: recognition.value.batches.reduce((total, batch) => total + batch.annotations.length, 0),
    legacyWorkspacePaths: workspacePathSummary(recognition),
  });
}
