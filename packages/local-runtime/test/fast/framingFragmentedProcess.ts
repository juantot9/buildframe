import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

import { FramedSocket, type FramedSocketCloseCode } from '../../src/framing.js';
import { MAX_FRAME_BYTES } from '../../src/protocol.js';

class MemorySocket extends EventEmitter {
  destroyed = false;
  readonly writes: Buffer[] = [];
  writableLength = 0;
  ended = false;

  write(chunk: Uint8Array): boolean {
    this.writes.push(Buffer.from(chunk));
    return true;
  }

  end(): void {
    this.ended = true;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function emitFragments(socket: MemorySocket, bytes: Buffer, fragmentBytes: number): void {
  for (let offset = 0; offset < bytes.byteLength; offset += fragmentBytes) {
    socket.emit('data', bytes.subarray(offset, Math.min(offset + fragmentBytes, bytes.byteLength)));
  }
}

const emptyFrameBytes = Buffer.byteLength(JSON.stringify({ payload: '' }));
const payloadBytes = MAX_FRAME_BYTES - emptyFrameBytes;
const exactBody = Buffer.from(JSON.stringify({ payload: 'x'.repeat(payloadBytes) }), 'utf8');
if (exactBody.byteLength !== MAX_FRAME_BYTES) {
  throw new Error('exact-limit fixture has the wrong byte length');
}
const exactFrame = Buffer.concat([exactBody, Buffer.from('\n')]);

const exactSocket = new MemorySocket();
let exactCloseCode: FramedSocketCloseCode | undefined;
let receivedFrames = 0;
new FramedSocket(exactSocket as unknown as Socket, {
  onFrame: frame => {
    if (
      typeof frame !== 'object' ||
      frame === null ||
      !('payload' in frame) ||
      typeof frame.payload !== 'string' ||
      frame.payload.length !== payloadBytes
    ) {
      throw new Error('fragmented frame changed in transit');
    }
    receivedFrames += 1;
  },
  onClose: code => {
    exactCloseCode = code;
  },
});
for (let frame = 0; frame < 4; frame += 1) {
  emitFragments(exactSocket, exactFrame, 1);
}
if (exactCloseCode !== undefined) {
  throw new Error(`exact-limit framing closed with ${exactCloseCode}`);
}

const oversizedSocket = new MemorySocket();
let oversizedCloseCode: FramedSocketCloseCode | undefined;
new FramedSocket(oversizedSocket as unknown as Socket, {
  onFrame: () => {
    throw new Error('oversized input produced a frame');
  },
  onClose: code => {
    oversizedCloseCode = code;
  },
});
emitFragments(oversizedSocket, Buffer.alloc(MAX_FRAME_BYTES + 1, 0x61), 64 * 1024);
if (oversizedCloseCode !== 'frame-too-large') {
  throw new Error('fragmented overflow did not close as frame-too-large');
}
if (!oversizedSocket.ended) {
  throw new Error('fragmented overflow did not end the socket');
}

const oversizedFrame = JSON.parse(Buffer.concat(oversizedSocket.writes).toString('utf8')) as unknown;
process.stdout.write(
  JSON.stringify({
    exact: {
      frameBytes: exactBody.byteLength,
      receivedFrames,
    },
    oversized: {
      closeCode: oversizedCloseCode,
      ended: oversizedSocket.ended,
      frame: oversizedFrame,
    },
  }),
);
