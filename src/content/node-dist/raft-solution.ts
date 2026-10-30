/**
 * The Raft reference node, split into three layers so the labs can build on each other:
 *   election    (RequestVote, terms, timers)
 *   replication (AppendEntries, commit index, heartbeats)
 *   kv          (client requests + the replicated key-value state machine)
 * `raftStarter(layer)` returns the reference with that layer replaced by documented stubs.
 */

const HEADER = `function createNode(id, peers) {
  const MAJORITY = Math.floor((peers.length + 1) / 2) + 1;
  const ELECTION_MIN = 150;
  const ELECTION_MAX = 300;
  const HEARTBEAT = 50;

  // ---- persistent state: must survive a crash, so it lives in ctx.storage ----
  let currentTerm = 0;
  let votedFor = null;
  let log = []; // log[i] = { term, cmd }   (Raft's index = i + 1; index 0 means "before the first entry")

  // ---- volatile state ----
  let role = 'follower'; // 'follower' | 'candidate' | 'leader'
  let leaderId = null;
  let commitIndex = 0;
  let lastApplied = 0;
  let votes = new Set();
  const nextIndex = {}; // leader only: next log index to send to each peer
  const matchIndex = {}; // leader only: highest index known to be replicated on each peer
  let kv = {}; // the state machine (see the "kv" layer)
  const results = {}; // opId -> result, so retried client requests are not applied twice
  const pending = new Set(); // opIds this leader still owes a reply for

  function persist(ctx) {
    ctx.storage.set('raft', { currentTerm, votedFor, log });
  }
  function resetElectionTimer(ctx) {
    ctx.setTimer('election', ELECTION_MIN + Math.floor(ctx.rand() * (ELECTION_MAX - ELECTION_MIN)));
  }
  const lastLogIndex = () => log.length;
  const lastLogTerm = () => (log.length ? log[log.length - 1].term : 0);
`;

const ELECTION_IMPL = `
  // ======================= LAYER 1: leader election =======================
  function stepDown(ctx, term) {
    const wasFollower = role === 'follower';
    if (term > currentTerm) {
      currentTerm = term;
      votedFor = null;
      persist(ctx);
    }
    role = 'follower';
    if (!wasFollower) {
      ctx.cancelTimer('heartbeat');
      pending.clear();
      resetElectionTimer(ctx);
    }
  }

  function startElection(ctx) {
    role = 'candidate';
    currentTerm += 1;
    votedFor = id;
    votes = new Set([id]);
    leaderId = null;
    persist(ctx);
    resetElectionTimer(ctx);
    if (votes.size >= MAJORITY) return becomeLeader(ctx);
    ctx.broadcast({ type: 'RequestVote', term: currentTerm, lastLogIndex: lastLogIndex(), lastLogTerm: lastLogTerm() });
  }

  function becomeLeader(ctx) {
    role = 'leader';
    leaderId = id;
    for (const p of peers) {
      nextIndex[p] = log.length + 1;
      matchIndex[p] = 0;
    }
    ctx.cancelTimer('election');
    log.push({ term: currentTerm, cmd: null }); // a no-op entry lets the new leader commit entries from earlier terms
    persist(ctx);
    broadcastAppend(ctx);
    ctx.setTimer('heartbeat', HEARTBEAT);
    maybeAdvanceCommit(ctx);
  }

  function onRequestVote(ctx, from, m) {
    if (m.term > currentTerm) stepDown(ctx, m.term);
    let granted = false;
    if (m.term === currentTerm && (votedFor === null || votedFor === from)) {
      const upToDate = m.lastLogTerm > lastLogTerm() || (m.lastLogTerm === lastLogTerm() && m.lastLogIndex >= lastLogIndex());
      if (upToDate) {
        granted = true;
        votedFor = from;
        persist(ctx); // the vote must be durable before we reply
        resetElectionTimer(ctx);
      }
    }
    ctx.send(from, { type: 'VoteReply', term: currentTerm, granted });
  }

  function onVoteReply(ctx, from, m) {
    if (m.term > currentTerm) return stepDown(ctx, m.term);
    if (role === 'candidate' && m.term === currentTerm && m.granted) {
      votes.add(from);
      if (votes.size >= MAJORITY) becomeLeader(ctx);
    }
  }
`;

const ELECTION_STUB = `
  // ======================= LAYER 1: leader election (YOUR JOB) =======================
  // Messages: { type: 'RequestVote', term, lastLogIndex, lastLogTerm }  →  { type: 'VoteReply', term, granted }
  // Rules to implement:
  //   • any message carrying a higher term makes you a follower in that term (and clears votedFor)
  //   • grant at most ONE vote per term, only to a candidate whose log is at least as up-to-date as yours
  //   • persist currentTerm / votedFor (persist(ctx)) before you reply
  //   • win with a majority of votes  →  becomeLeader

  // Step down to follower. If term > currentTerm, adopt it and forget your vote.
  function stepDown(ctx, term) {
  }

  // The election timer fired: become a candidate in a new term, vote for yourself, ask everybody else.
  function startElection(ctx) {
  }

  // You won: initialise nextIndex/matchIndex, append a no-op entry for this term, start heartbeats.
  function becomeLeader(ctx) {
  }

  function onRequestVote(ctx, from, m) {
  }

  function onVoteReply(ctx, from, m) {
  }
`;

const REPL_IMPL = `
  // ======================= LAYER 2: log replication =======================
  function sendAppend(ctx, p) {
    const prev = nextIndex[p] - 1;
    ctx.send(p, {
      type: 'AppendEntries',
      term: currentTerm,
      prevLogIndex: prev,
      prevLogTerm: prev > 0 ? log[prev - 1].term : 0,
      entries: log.slice(prev, prev + 32),
      leaderCommit: commitIndex,
    });
  }

  function broadcastAppend(ctx) {
    for (const p of peers) sendAppend(ctx, p);
  }

  function heartbeat(ctx) {
    broadcastAppend(ctx);
    ctx.setTimer('heartbeat', HEARTBEAT);
  }

  // Leader: an entry is committed once a majority stores it AND it is from the current term.
  function maybeAdvanceCommit(ctx) {
    for (let n = log.length; n > commitIndex; n--) {
      if (log[n - 1].term !== currentTerm) break;
      let count = 1;
      for (const p of peers) if (matchIndex[p] >= n) count++;
      if (count >= MAJORITY) {
        commitIndex = n;
        apply(ctx);
        break;
      }
    }
  }

  // Leader: add a client command to the log and start replicating it.
  function appendCommand(ctx, cmd) {
    if (!log.some((e) => e.cmd && e.cmd.opId === cmd.opId)) {
      log.push({ term: currentTerm, cmd });
      persist(ctx);
      broadcastAppend(ctx);
    }
    maybeAdvanceCommit(ctx);
  }

  function onAppendEntries(ctx, from, m) {
    if (m.term < currentTerm) return ctx.send(from, { type: 'AppendReply', term: currentTerm, success: false, matchIndex: 0 });
    if (m.term > currentTerm || role !== 'follower') stepDown(ctx, m.term);
    leaderId = from;
    resetElectionTimer(ctx);

    // consistency check: do we hold the entry just before the new ones?
    if (m.prevLogIndex > log.length || (m.prevLogIndex > 0 && log[m.prevLogIndex - 1].term !== m.prevLogTerm)) {
      return ctx.send(from, { type: 'AppendReply', term: currentTerm, success: false, matchIndex: 0, hint: Math.min(m.prevLogIndex - 1, log.length) });
    }
    let changed = false;
    m.entries.forEach((e, i) => {
      const idx = m.prevLogIndex + 1 + i;
      if (log.length >= idx) {
        if (log[idx - 1].term !== e.term) {
          log.length = idx - 1; // conflict: drop this entry and everything after it
          log.push(e);
          changed = true;
        }
      } else {
        log.push(e);
        changed = true;
      }
    });
    if (changed) persist(ctx);
    const last = m.prevLogIndex + m.entries.length;
    if (m.leaderCommit > commitIndex) {
      commitIndex = Math.min(m.leaderCommit, last);
      apply(ctx);
    }
    ctx.send(from, { type: 'AppendReply', term: currentTerm, success: true, matchIndex: last });
  }

  function onAppendReply(ctx, from, m) {
    if (m.term > currentTerm) return stepDown(ctx, m.term);
    if (role !== 'leader' || m.term !== currentTerm) return;
    if (m.success) {
      matchIndex[from] = Math.max(matchIndex[from], m.matchIndex);
      nextIndex[from] = matchIndex[from] + 1;
      maybeAdvanceCommit(ctx);
      if (nextIndex[from] <= log.length) sendAppend(ctx, from);
    } else {
      const guess = typeof m.hint === 'number' ? m.hint + 1 : nextIndex[from] - 1;
      nextIndex[from] = Math.max(1, Math.min(nextIndex[from] - 1, guess));
      sendAppend(ctx, from);
    }
  }
`;

const REPL_STUB = `
  // ======================= LAYER 2: log replication (YOUR JOB) =======================
  // Messages: { type: 'AppendEntries', term, prevLogIndex, prevLogTerm, entries, leaderCommit }
  //        →  { type: 'AppendReply', term, success, matchIndex, hint? }
  // Rules to implement:
  //   • the leader sends AppendEntries (also as an empty heartbeat) and tracks nextIndex / matchIndex per follower
  //   • a follower rejects the request unless its log contains an entry at prevLogIndex with term prevLogTerm
  //   • on a conflict (same index, different term) the follower deletes that entry and everything after it
  //   • commitIndex advances only when a MAJORITY has the entry AND it belongs to the leader's CURRENT term
  //   • remember to call apply(ctx) after commitIndex moves, and persist(ctx) after the log changes

  function sendAppend(ctx, p) {
  }

  function broadcastAppend(ctx) {
  }

  // The heartbeat timer fired on the leader: replicate / heartbeat, then re-arm ctx.setTimer('heartbeat', HEARTBEAT).
  function heartbeat(ctx) {
  }

  function maybeAdvanceCommit(ctx) {
  }

  // Leader: add { term: currentTerm, cmd } to the log (once per cmd.opId) and start replicating it.
  function appendCommand(ctx, cmd) {
  }

  function onAppendEntries(ctx, from, m) {
  }

  function onAppendReply(ctx, from, m) {
  }
`;

const KV_IMPL = `
  // ======================= LAYER 3: the replicated key-value store =======================
  // Apply every newly committed entry, in order, to the state machine.
  function apply(ctx) {
    while (lastApplied < commitIndex) {
      lastApplied++;
      const entry = log[lastApplied - 1];
      if (!entry.cmd) continue; // leader no-op
      const c = entry.cmd;
      let res;
      if (c.opId in results) res = results[c.opId]; // a duplicate (client retry): do not apply twice
      else {
        if (c.op.type === 'put') {
          kv[c.op.key] = c.op.value;
          res = { ok: true };
        } else res = { ok: true, value: kv[c.op.key] };
        results[c.opId] = res;
      }
      if (role === 'leader' && pending.has(c.opId)) {
        pending.delete(c.opId);
        ctx.respond(c.opId, res); // only now is the operation durable on a majority
      }
    }
  }

  // Client request: { opId, op: { type: 'put', key, value } | { type: 'get', key } }
  function onClient(ctx, req) {
    if (role !== 'leader') return ctx.respond(req.opId, { ok: false, error: 'not-leader', leader: leaderId });
    if (req.opId in results) return ctx.respond(req.opId, results[req.opId]);
    pending.add(req.opId);
    appendCommand(ctx, { opId: req.opId, op: req.op });
  }
`;

const KV_STUB = `
  // ======================= LAYER 3: the replicated key-value store (YOUR JOB) =======================
  // Requests arrive in onClient(ctx, { opId, op }) with op = { type: 'put', key, value } or { type: 'get', key }.
  // Rules to implement:
  //   • only the leader accepts requests; others reply ctx.respond(opId, { ok: false, error: 'not-leader', leader: leaderId })
  //   • put AND get both go through the replicated log (that is what makes reads linearizable)
  //   • apply committed entries in order to the \`kv\` object; remember each opId's result in \`results\`
  //     so a retried request is never applied twice
  //   • reply with ctx.respond(opId, { ok: true }) / { ok: true, value } only AFTER the entry is committed and applied,
  //     and only if you are still the leader (use the \`pending\` set)

  function apply(ctx) {
  }

  function onClient(ctx, req) {
  }
`;

const FOOTER = `
  return {
    onStart(ctx) {
      const saved = ctx.storage.get('raft');
      if (saved) {
        currentTerm = saved.currentTerm;
        votedFor = saved.votedFor;
        log = saved.log;
      }
      resetElectionTimer(ctx);
    },
    onTimer(ctx, name) {
      if (name === 'election' && role !== 'leader') startElection(ctx);
      else if (name === 'heartbeat' && role === 'leader') heartbeat(ctx);
    },
    onMessage(ctx, from, m) {
      if (m.type === 'RequestVote') onRequestVote(ctx, from, m);
      else if (m.type === 'VoteReply') onVoteReply(ctx, from, m);
      else if (m.type === 'AppendEntries') onAppendEntries(ctx, from, m);
      else if (m.type === 'AppendReply') onAppendReply(ctx, from, m);
    },
    onClient,
    // The tests read your node's state through this method.
    status() {
      return { role, term: currentTerm, leaderId, commitIndex, lastApplied, log: log.map((e) => ({ term: e.term, cmd: e.cmd })), kv: { ...kv } };
    },
  };
}
`;

export type RaftLayer = 'election' | 'replication' | 'kv';

export const RAFT_FULL = (HEADER + ELECTION_IMPL + REPL_IMPL + KV_IMPL + FOOTER).trimStart();

/** The reference implementation with one layer replaced by documented stubs. */
export function raftStarter(layer: RaftLayer): string {
  return (
    HEADER +
    (layer === 'election' ? ELECTION_STUB : ELECTION_IMPL) +
    (layer === 'replication' ? REPL_STUB : REPL_IMPL) +
    (layer === 'kv' ? KV_STUB : KV_IMPL) +
    FOOTER
  ).trimStart();
}
