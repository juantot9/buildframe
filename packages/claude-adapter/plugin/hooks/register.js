// BuildFrame Direct Review: attaches this Claude Code conversation to the BuildFrame
// runtime through a private Node helper. The Mod submits only text the helper
// hands it for one committed Review Message, and only while Claude is idle. It
// reports native lifecycle facts, plus the final answer of the turn its own
// submission started; the helper's Adapter decides correlation. Normal user
// turns, their text, tools, and permission prompts are left untouched.

const PROTOCOL_VERSION = 1;
const MAX_FACTS_PER_POST = 64;
const POLL_FAILURE_LIMIT = 3;
/** The Response bound is 16 KiB of UTF-8; a longer string can never fit it. */
const MAX_ANSWER_CHARACTERS = 16 * 1024;

/** The launched helper: `{ port, token }`, or undefined while detached. */
let link;
/** This Mod's own unsettled submission: `{ dispatchId, text }`. */
let pending;
/** The main-loop turn this Mod's submission started: its turnId, `unseen` when only the submit resolution proved it. */
let ownTurn;
let turnRunning = false;
/** Whether a main-loop `turn.start` was heard since this Mod's last submit call. */
let turnSeenSince = false;
let foreignPending = false;
let outbox = [];
let posting = false;
/** The light beside the prompt: `{ text, tone }`, or undefined when there is none. */
let light;
/** Whether Claude Code has drawn the cell beside the prompt in this session. */
let cellDrawn = false;
/** Whether the light is standing in for the cell under the prompt, until the cell is drawn. */
let lightInStatus = false;

/**
 * Shows the helper's indicator: the light beside the prompt, and under it
 * only a problem. Under the prompt Claude Code draws every line as a notice,
 * so the connected light goes there only where the cell never appears.
 * A helper from before the light sends `label` alone.
 */
function show($, message) {
  if (typeof message.light !== 'string') {
    light = undefined;
    lightInStatus = false;
    $.ui.status('BuildFrame: ' + message.label);
    return;
  }
  light = { text: message.light, tone: message.tone ?? 'warning' };
  lightInStatus = message.problem === undefined && !cellDrawn;
  $.ui.status(message.problem ?? (lightInStatus ? message.light : undefined));
  redraw($);
}

/** Asks Claude Code to draw the cell again; an older one without it never draws the cell. */
function redraw($) {
  try {
    $.ui.invalidate('ui.render');
  } catch {
    // Nothing to redraw.
  }
}

function clear($, problem) {
  light = problem === undefined ? undefined : { text: '○ BuildFrame', tone: 'error' };
  lightInStatus = false;
  $.ui.status(problem);
  redraw($);
}

function record(fact) {
  if (link !== undefined) outbox.push(fact);
}

function request(current, body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer ' + current.token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function endpoint(current, path) {
  return 'http://127.0.0.1:' + current.port + path;
}

/** Posts facts straight to one helper, outside the shared outbox; for a link already let go. */
async function postFacts($, current, facts) {
  try {
    await $.http.fetch(endpoint(current, '/facts'), request(current, { facts }));
  } catch {
    // The helper's liveness check still settles it.
  }
}

async function flush($) {
  if (posting || link === undefined) return;
  posting = true;
  const current = link;
  try {
    while (outbox.length > 0 && link === current) {
      const facts = outbox.slice(0, MAX_FACTS_PER_POST);
      try {
        await $.http.fetch(endpoint(current, '/facts'), request(current, { facts }));
      } catch {
        // A lost helper is settled by its own liveness check; facts are not replayed.
      }
      outbox = outbox.slice(facts.length);
    }
  } finally {
    posting = false;
  }
}

function forget(current) {
  if (link !== current) return false;
  link = undefined;
  pending = undefined;
  ownTurn = undefined;
  outbox = [];
  return true;
}

async function attach($) {
  const sessionId = await $.session.id();
  const cwd = await $.session.cwd();
  const version = await $.session.version();
  let outcome;
  try {
    const launched = await $.process.run(['node', $.plugin.root + '/helper/launch.js'], {
      stdin: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, sessionId, cwd, hostVersion: version.version }),
      timeoutMs: 20000,
    });
    outcome = JSON.parse(launched.stdout.trim().split('\n').at(-1) ?? '');
  } catch {
    outcome = undefined;
  }
  if (outcome === undefined || outcome === null || outcome.status === 'refused') {
    $.ui.toast('BuildFrame: ' + (outcome?.label ?? 'helper could not start'));
    return;
  }
  const current = { port: outcome.port, token: outcome.token };
  link = current;
  outbox = [];
  show($, outcome);
  $.ui.toast(
    outcome.status === 'connected'
      ? 'BuildFrame connected to this session.'
      : 'BuildFrame isn’t open yet; this session connects when it opens.',
  );
  $.clock.after(0, () => poll($, current));
}

async function detach($) {
  const current = link;
  if (current === undefined) return;
  forget(current);
  try {
    await $.http.fetch(endpoint(current, '/detach'), request(current, {}));
  } catch {
    // The helper also detaches once polling stops.
  }
  clear($, undefined);
}

async function poll($, current) {
  let failures = 0;
  while (link === current) {
    let response;
    try {
      response = await $.http.fetch(endpoint(current, '/next'), request(current, {}));
    } catch {
      failures += 1;
      if (failures >= POLL_FAILURE_LIMIT) break;
      await $.clock.sleep(1000);
      continue;
    }
    if (!response.ok) break;
    failures = 0;
    let commands = [];
    try {
      commands = JSON.parse(response.text).commands ?? [];
    } catch {
      commands = [];
    }
    for (const command of commands) await perform($, current, command);
  }
  if (forget(current)) clear($, 'helper stopped · /buildframe to connect again');
}

async function perform($, current, command) {
  if (link !== current) {
    // A poll answered after this session let go of the helper: say plainly that
    // nothing was submitted, so the Send is not left with an unknown outcome.
    if (command.type === 'submit')
      await postFacts($, current, [{ type: 'submit-refused', dispatchId: command.dispatchId }]);
    return;
  }
  if (command.type === 'status') {
    show($, command);
  } else if (command.type === 'detach') {
    forget(current);
    show($, command);
  } else if (command.type === 'abort') {
    try {
      await $.turn.abort({ turnId: command.turnId });
    } catch {
      record({ type: 'abort-failed', dispatchId: command.dispatchId });
      void flush($);
    }
  } else if (command.type === 'submit') {
    submit($, command);
  }
}

function submit($, command) {
  const dispatchId = command.dispatchId;
  // Single flight: never queue behind a running turn, a waiting prompt, or our own.
  if (turnRunning || foreignPending || pending !== undefined) {
    record({ type: 'submit-refused', dispatchId });
    void flush($);
    return;
  }
  pending = { dispatchId, text: command.text };
  turnSeenSince = false;
  let call;
  try {
    // Not awaited: it resolves only once the new turn starts.
    call = $.prompt.submit({ text: command.text, asUser: true });
  } catch {
    // A synchronous refusal entered nothing.
    pending = undefined;
    record({ type: 'submit-refused', dispatchId });
    void flush($);
    return;
  }
  record({ type: 'submit-called', dispatchId });
  void flush($);
  call
    .then(
      result => {
        const entered = result?.drop === undefined;
        if (entered && ownTurn === undefined && !turnSeenSince) ownTurn = 'unseen';
        record({ type: 'submit-resolved', dispatchId, entered });
      },
      () => {
        record({ type: 'submit-threw', dispatchId });
      },
    )
    .finally(() => {
      if (pending?.dispatchId === dispatchId) pending = undefined;
      void flush($);
    });
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'buildframe',
        description: 'Connect this session to BuildFrame',
        argumentHint: '[status|disconnect]',
      });
    } catch {
      // A taken name leaves the Mod inert rather than breaking session start.
    }
    return next(e);
  });

  on('command.run', { command: 'buildframe' }, async ($, e) => {
    const action = e.args.trim().toLowerCase();
    if (action === 'status') {
      $.ui.toast(
        link === undefined
          ? 'BuildFrame is not connected to this session.'
          : 'BuildFrame is connected to this session.',
      );
    } else if (action === 'disconnect' || action === 'detach') {
      if (link === undefined) $.ui.toast('BuildFrame is not connected to this session.');
      else {
        await detach($);
        $.ui.toast('BuildFrame disconnected from this session.');
      }
    } else if (action !== '') {
      $.ui.toast('Usage: /buildframe, /buildframe status, or /buildframe disconnect');
    } else if (link !== undefined) {
      $.ui.toast('BuildFrame is connected to this session already. Use /buildframe disconnect first.');
    } else {
      await attach($);
    }
    return {};
  });

  // The light: a glyph in the tone's colour and a dim name while connected,
  // all in the tone otherwise. It leaves the cell to the engine when it does
  // not fit, and Claude Code hides it while it asks something.
  on('ui.render', { component: 'BesidePrompt' }, ($, e, next) => {
    if (light === undefined || e.props.maxColumns < light.text.length) return next(e);
    if (!cellDrawn) {
      cellDrawn = true;
      if (lightInStatus) {
        lightInStatus = false;
        $.clock.after(0, () => $.ui.status(undefined));
      }
    }
    const { Text } = $.ui.resolve(e);
    const glyph = light.text.slice(0, 1);
    const rest = light.text.slice(1);
    return light.tone === 'success'
      ? Text({ children: [Text({ color: 'success', children: glyph }), Text({ dimColor: true, children: rest })] })
      : Text({ color: light.tone, children: light.text });
  }).catch(($, e, next) => next(e));

  // Observers only: every hook passes the event on unchanged.
  on('prompt.submit', async ($, e, next) => {
    // This Mod's own submissions do not reach its hooks; the name check is a backstop.
    if (!(e.origin?.kind === 'plugin' && e.origin.name === $.plugin.name)) {
      foreignPending = true;
      record({ type: 'foreign-prompt' });
      void flush($);
    }
    return next(e);
  }).catch(async ($, e, next) => {
    // Never block the user's prompt; an unobserved prompt still makes any Send's outcome unknown.
    foreignPending = true;
    record({ type: 'foreign-prompt' });
    return next(e);
  });

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e);
    const matchesPending = pending !== undefined && e.text === pending.text;
    turnRunning = true;
    turnSeenSince = true;
    foreignPending = false;
    ownTurn = matchesPending ? e.turnId : undefined;
    record({ type: 'turn-start', turnId: e.turnId, matchesPending });
    void flush($);
    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      turnRunning = false;
      const own = ownTurn === e.turnId || ownTurn === 'unseen';
      ownTurn = undefined;
      // Only the answer to BuildFrame's own Message leaves Claude; never a user turn's.
      const answer = own && e.answer.length <= MAX_ANSWER_CHARACTERS ? { answer: e.answer } : {};
      record({ type: 'turn-complete', turnId: e.turnId, reason: e.reason, ...answer });
      void flush($);
    }
    return next(e);
  });

  on('session.end', async ($, e, next) => {
    // `/clear`, `/resume`, and `/branch` end this conversation too: never follow it.
    const current = link;
    if (current !== undefined) {
      // Sent directly: an outbox flush already in flight would skip it, and the
      // helper would keep accepting Sends for a conversation that is gone. It
      // settles any open Send on its own, so unsent facts are not needed.
      forget(current);
      clear($, undefined);
      await postFacts($, current, [{ type: 'session-ending' }]);
    }
    return next(e);
  });
}
