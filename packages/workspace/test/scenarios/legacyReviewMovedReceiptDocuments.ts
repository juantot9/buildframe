/** Legacy receipt documents for the moved-receipt scenarios. */

export function receiptDocument(workspacePaths: readonly string[], marker = 'sanitized'): Buffer {
  const timestamp = '2026-09-02T12:00:00.000Z';
  return Buffer.from(
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: timestamp,
        batches: workspacePaths.map((workspace, index) => ({
          id: `${marker}-batch-${index}`,
          workspace,
          annotations: [
            {
              id: `${marker}-annotation-${index}`,
              kind: 'question',
              anchor: { side: 'file' },
              text: `${marker} private legacy question ${index}`,
            },
          ],
          harness: {
            id: `${marker}-harness`,
            name: `${marker} Private Harness`,
            sessionId: `${marker}-private-session-${index}`,
            model: `${marker}-private-model-${index}`,
            workspace,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
          harnessOutcome: 'pending',
          queueDisposition: 'pending',
        })),
      },
      null,
      2,
    )}\n`,
  );
}

export function pathOnlyReceiptDocument(workspacePaths: readonly string[]): Buffer {
  const timestamp = '2026-09-02T12:00:00.000Z';
  return Buffer.from(
    `${JSON.stringify({
      version: 1,
      updatedAt: timestamp,
      batches: workspacePaths.map((workspace, index) => ({
        id: `batch-${index}`,
        workspace,
        annotations: [
          {
            id: `annotation-${index}`,
            kind: 'question',
            anchor: { side: 'file' },
            text: 'sanitized',
          },
        ],
        harness: {
          id: 'harness',
          name: 'Harness',
          sessionId: `session-${index}`,
          workspace,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        harnessOutcome: 'pending',
        queueDisposition: 'pending',
      })),
    })}\n`,
  );
}
