import type { Module, TestCtx } from '../../core/types';
import { ex, sim as simTest, hid, lab, jsFile } from '../helpers';
import { RAFT_FULL, raftStarter } from './raft-solution';
import { makeCluster, RaftInvariants, leaders, statusOf } from '../../sim/raftkit';
import { randomFaults } from '../../sim/faults';
import { KvDriver } from '../../sim/kvclient';
import { checkLinearizable } from '../../sim/lin';
import type { Sim } from '../../sim/dsim';

const BUDGET = 150_000_000;

/** Send a command to every node; only the leader appends it, everyone else answers "not-leader". */
function submitEverywhere(sim: Sim, t: number, opId: string, key: string, value: unknown) {
  for (const n of sim.nodes) sim.clientRequest(t, n, { opId, op: { type: 'put', key, value } });
}
const cmdIds = (status: any) => status.log.filter((e: any) => e.cmd).map((e: any) => e.cmd.opId);

const mod: Module = {
  id: 'consensus-raft',
  course: 'node-dist',
  title: 'Consensus: Build Raft (Election, Replication, a Linearizable KV Store)',
  minutes: 180,
  objectives: [
    'Explain why distributed systems need consensus and what a replicated state machine is',
    'Implement Raft leader election with terms, randomized timeouts and persistent votes',
    'Implement log replication, the log-matching property and the commit rule',
    'Build a linearizable key-value store on top of the replicated log and survive crashes and partitions',
  ],
  body: `
## The problem: agreeing despite failures

One server is a **single point of failure**. To survive crashes you keep **replicas** — but now they must **agree** on the order of operations, even when machines crash, restart, and networks delay, drop, duplicate and partition messages. That agreement problem is **consensus**.

The standard solution is a **replicated state machine**: every replica starts in the same state and applies the **same commands in the same order** → they stay identical. Consensus provides the "same order": a replicated **log**.

\`\`\`
 client ─► leader ─► [ log: put x=1 | put y=2 | get x | … ] ──replicated──► followers
                              │  (once a MAJORITY has an entry it is COMMITTED)
                              ▼
                    state machine (a key-value map) applies committed entries in order
\`\`\`

**Why not just "ask everyone and take the answer"?** FLP (Fischer–Lynch–Paterson, 1985) proved that in a fully asynchronous system no deterministic algorithm can guarantee consensus if even one node may crash. Practical protocols (Paxos, Raft, Zab, Viewstamped Replication) sidestep it with **timeouts + randomisation**: *safety* (never decide wrongly) always holds; *liveness* (eventually decide) holds when the network is eventually well-behaved.

## Raft in one page

Raft (Ongaro & Ousterhout, 2014 — "In Search of an Understandable Consensus Algorithm") decomposes consensus into **leader election**, **log replication** and **safety**. A cluster of 2f+1 servers tolerates f failures (3 → 1, 5 → 2). A **majority quorum** is f+1; any two majorities overlap in at least one server — that overlap is the source of every safety guarantee.

**Terms.** Time is divided into numbered *terms* (a logical clock). Each term has at most one leader. Every message carries a term; a server that sees a **higher term** immediately becomes a follower in it. A message with a *lower* term is rejected.

**Roles.** Follower (passive) → Candidate (asking for votes) → Leader (handles clients, replicates log).

### 1. Leader election

- A follower that hears nothing from a leader for a **randomised election timeout** (e.g. 150–300 ms) becomes a **candidate**: increments its term, votes for itself, sends \`RequestVote\` to all.
- A server grants **at most one vote per term** (it must remember who — **persist \`votedFor\` and \`currentTerm\`**), and only to a candidate whose **log is at least as up-to-date** as its own (higher last term, or same last term and ≥ length). This **election restriction** guarantees a new leader already has every committed entry.
- A candidate with a **majority** becomes leader and immediately sends heartbeats (\`AppendEntries\`) to establish authority and stop other elections.
- **Randomised timeouts** make split votes rare and self-resolving; if nobody wins, timeouts expire again with different random values.

### 2. Log replication

The leader appends client commands to its log and sends \`AppendEntries(term, prevLogIndex, prevLogTerm, entries, leaderCommit)\`. A follower accepts only if it has an entry at \`prevLogIndex\` whose term is \`prevLogTerm\` (the **consistency check**) — otherwise it rejects, and the leader backs up \`nextIndex\` and retries until logs line up. If an existing entry conflicts with a new one (same index, different term) the follower **deletes it and everything after it**.

Together these give the **Log Matching Property**: if two logs have an entry with the same index and term, then the logs are identical in all entries up to that index.

### 3. Safety: the commit rule

An entry is **committed** when the leader that created it has stored it on a **majority**. The leader tracks \`matchIndex[follower]\` and advances \`commitIndex\` to the highest \`N\` replicated on a majority **and with \`log[N].term === currentTerm\`**. That last clause matters: committing an *older-term* entry just because it reached a majority is unsafe (Figure 8 of the paper — such an entry can still be overwritten by a later leader). Instead a new leader appends a **no-op** entry in its own term; committing it commits everything before it.

Followers learn the commit index from \`leaderCommit\` and apply entries up to it to their state machine.

### Linearizable reads

A leader that answers a \`get\` from its local state may be **stale** — it could have been deposed by a partition without knowing. Safe options: put reads through the **log** (what you'll do — simple and correct), or use **ReadIndex** / **leader leases** (faster, extra assumptions about clocks).

## Using the simulator

Your node is a **factory**: \`function createNode(id, peers)\` returns an object. Everything is event-driven; there are no threads and no real time.

| Your node implements | Called when |
|---|---|
| \`onStart(ctx)\` | the node boots (also after every restart) |
| \`onMessage(ctx, from, msg)\` | a message arrives |
| \`onTimer(ctx, name)\` | a timer set with \`ctx.setTimer(name, ms)\` fires |
| \`onClient(ctx, req)\` | a client request arrives |
| \`status()\` | the tests inspect your state |

\`ctx\` offers \`send(to, msg)\`, \`broadcast(msg)\`, \`setTimer / cancelTimer\`, \`now()\`, \`rand()\` (seeded!), \`respond(opId, body)\`, and **\`ctx.storage\`** — the only state that survives a crash. A crash wipes your JavaScript variables; \`onStart\` runs again.

The **simulator is deterministic**: given the same seed the same messages are delayed, dropped and reordered the same way. When a test fails the message shows the seed and the **space-time diagram** below the results lets you see who sent what, when nodes crashed, and where partitions fell.

:::tip
The three labs build on each other. Each lab gives you the reference solution for the *other* layers and leaves one layer for you. The final lab's solution is a complete Raft with a linearizable KV store.
:::

:::warn
**Typical Raft bugs** (the simulator will find these): forgetting to persist \`votedFor\` before replying; granting two votes in one term; resetting the election timer on *every* message (even stale ones); committing entries from old terms by counting replicas; not truncating conflicting entries; applying entries before they're committed; answering reads from a deposed leader.
:::

:::interview
"How does Raft guarantee that a committed entry is never lost?" — The leader must have a majority; the **election restriction** means any new leader's log contains every committed entry (their majorities overlap, and voters only vote for logs at least as up-to-date). Then explain why a leader commits only current-term entries by counting.
:::
`,
  quiz: [
    { q: 'Why does a Raft cluster of 5 servers tolerate 2 failures?', options: ['Each server has two backups', 'A majority is 3, so any 3 live servers can elect a leader and commit entries', 'Raft needs only one server', 'Because of leases'], answer: 1, why: '2f+1 = 5 → f = 2: a quorum of f+1 = 3 remains available.' },
    { q: 'Why must a server persist `currentTerm` and `votedFor` before replying to a RequestVote?', options: ['For speed', 'After a crash it could forget its vote and vote again in the same term, producing two leaders', 'To save disk', 'Raft does not require it'], answer: 1, why: 'Vote-once-per-term is only safe if the vote survives restarts.' },
    { q: 'What does the election restriction (candidate\'s log must be at least as up-to-date) guarantee?', options: ['Faster elections', 'A new leader already contains every committed entry', 'No split votes', 'Entries are sorted'], answer: 1, why: 'Because a committed entry is on a majority and any winning candidate got votes from a majority, at least one voter holds it and would refuse a less up-to-date candidate.' },
    { q: 'Why does a Raft leader only advance commitIndex for entries from its CURRENT term by counting replicas?', options: ['Optimisation', 'An old-term entry on a majority can still be overwritten by a later leader (Figure 8); committing a current-term entry commits the earlier ones safely', 'Because old terms are deleted', 'No reason'], answer: 1, why: 'Safety proof: a current-term entry on a majority can never be lost.' },
    { q: 'Why is serving a `get` from the leader\'s local state without further checks unsafe?', options: ['Reads are slow', 'The node may have been deposed by a partition and not know it, returning stale data', 'Reads change state', 'It is safe'], answer: 1, why: 'Linearizability needs the leader to confirm it is still the leader (log, ReadIndex, or a lease).' },
  ],
  labs: [
    lab({
      id: 'nd4-raft-election',
      title: 'Raft part 1 — leader election',
      kind: 'sim',
      difficulty: 4,
      minutes: 60,
      tags: ['raft', 'consensus', 'simulation'],
      viz: 'spacetime',
      stepBudget: BUDGET,
      prompt: `Complete the **election layer** in the code below: \`stepDown\`, \`startElection\`, \`becomeLeader\`, \`onRequestVote\`, \`onVoteReply\`. The replication and KV layers are already implemented.

Your cluster has 5 nodes (\`n1…n5\`). The tests check, under many random crashes, restarts and partitions, that:
- exactly one leader emerges in a healthy cluster;
- there is **never more than one leader in the same term** (this needs persistent, once-per-term votes);
- a crashed leader is replaced; a **minority partition cannot elect a leader**; terms never go backwards after a restart.

Read the comments in each stub — they spell out the rules. Open the **space-time diagram** after running to see the elections.`,
      expose: ['createNode'],
      files: jsFile(raftStarter('election'), RAFT_FULL),
      tests: [
        simTest('a healthy cluster elects exactly one leader (10 seeds)', ({ env, expect }) => {
          for (let seed = 1; seed <= 10; seed++) {
            const sim = makeCluster(env, { seed });
            sim.run(1500);
            const ls = leaders(sim);
            if (ls.length !== 1) throw new Error(`seed ${seed}: expected exactly one leader after 1.5 s, found ${ls.length} (${ls.map((l) => l.id + '@term' + l.term).join(', ') || 'none'})`);
            const term = ls[0].term;
            for (const id of sim.nodes) if (statusOf(sim, id).term !== term) throw new Error(`seed ${seed}: ${id} is in term ${statusOf(sim, id).term} but the leader is in term ${term}. Followers must adopt the leader's term from its heartbeats.`);
            expect(sim.errors).toEqual([]);
          }
        }),
        simTest('never two leaders in one term, under random crashes and partitions (30 seeds)', ({ env, expect }) => {
          for (let seed = 1; seed <= 30; seed++) {
            const sim = makeCluster(env, { seed });
            new RaftInvariants().attach(sim, 10, 9000);
            randomFaults(sim, seed, { crashes: 4, partitions: 3, until: 6000 });
            try { sim.run(9000); } catch (e: any) { throw new Error(`seed ${seed}: ${e.message}`); }
            expect(sim.errors).toEqual([]);
          }
        }),
        simTest('a crashed leader is replaced within 1.5 s', ({ env, expect, attachTrace }) => {
          const sim = makeCluster(env, { seed: 4 });
          sim.sampleStatus(25, 4200);
          sim.run(1200);
          const first = leaders(sim);
          expect(first.length).toBe(1);
          sim.crash(first[0].id);
          sim.run(2700);
          const now = leaders(sim);
          attachTrace(sim.exportTrace());
          if (now.length !== 1) throw new Error(`after crashing ${first[0].id} expected one new leader within 1.5 s, found ${now.length}`);
          expect(now[0].id).not.toBe(first[0].id);
          expect(now[0].term).toBeGreaterThan(first[0].term);
        }),
        simTest('a crashed node that restarts rejoins as a follower and terms never decrease', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 9 });
          new RaftInvariants().attach(sim, 10, 8000);
          sim.run(1200);
          for (const [i, id] of sim.nodes.entries()) { sim.crash(id, 1300 + i * 700); sim.restart(id, 1700 + i * 700); }
          sim.run(8000);
          const ls = leaders(sim);
          expect(ls.length).toBe(1);
          for (const id of sim.nodes) expect(statusOf(sim, id).term).toBe(ls[0].term);
        }),
        simTest('a node that restarts remembers whom it voted for (no double vote in a term)', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 13 });
          sim.run(1000);
          const L = leaders(sim)[0];
          const F = sim.nodes.find((n) => n !== L.id && n !== 'n1' && n !== 'n2')!;
          const T = L.term + 5;
          let grants = 0;
          sim.onSend = (from, _to, body) => {
            if (from === F && body.type === 'VoteReply' && body.term === T && body.granted) grants++;
          };
          const rv = { type: 'RequestVote', term: T, lastLogIndex: 999, lastLogTerm: 999 };
          sim.partition([[F], sim.nodes.filter((n) => n !== F)], 1050); // keep real traffic away from F
          sim.inject(1100, F, 'n1', rv); // candidate n1 asks for F's vote in term T
          sim.crash(F, 1200);
          sim.restart(F, 1300);
          sim.inject(1320, F, 'n2', rv); // right after the restart, a different candidate asks in the same term
          sim.run(1600);
          if (grants !== 1) throw new Error(`${F} granted ${grants} votes in term ${T}: it must grant exactly one. Persist votedFor (persist(ctx)) before replying, so a restart cannot make it forget.`);
        }),
        simTest('a minority partition cannot elect a leader', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 6 });
          sim.partition([['n1', 'n2', 'n3'], ['n4', 'n5']], 0);
          sim.run(3500);
          const ls = leaders(sim).map((l) => l.id);
          if (ls.some((id) => id === 'n4' || id === 'n5')) throw new Error('a node in the 2-node minority became leader — it can never reach a majority of 3 votes');
          expect(ls.length).toBe(1);
        }),
        hid('after a partition heals the cluster converges on one leader and one term', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 11 });
          new RaftInvariants().attach(sim, 10, 7000);
          sim.partition([['n1', 'n2'], ['n3', 'n4', 'n5']], 300);
          sim.heal(3000);
          sim.run(7000);
          const ls = leaders(sim);
          expect(ls.length).toBe(1);
          for (const id of sim.nodes) expect(statusOf(sim, id).term).toBe(ls[0].term);
        }),
        hid('elections work with message loss and duplication', ({ env, expect }) => {
          for (let seed = 1; seed <= 8; seed++) {
            const sim = makeCluster(env, { seed, drop: 0.1 });
            new RaftInvariants().attach(sim, 10, 6000);
            sim.run(6000);
            expect(leaders(sim).length).toBe(1);
          }
        }),
      ],
      hints: [
        '`startElection`: `role = "candidate"; currentTerm++; votedFor = id; votes = new Set([id]); persist(ctx); resetElectionTimer(ctx);` then broadcast `RequestVote` with `lastLogIndex()` and `lastLogTerm()`.',
        '`onRequestVote`: if `m.term > currentTerm` call `stepDown(ctx, m.term)` first. Grant only if `m.term === currentTerm`, you haven\'t voted for someone else, and the candidate\'s log is up-to-date: `m.lastLogTerm > lastLogTerm() || (m.lastLogTerm === lastLogTerm() && m.lastLogIndex >= lastLogIndex())`. Persist before replying.',
        '`stepDown`: adopt a higher term (clear `votedFor`, persist), set `role = "follower"`, and — if you were not already a follower — cancel the heartbeat timer and restart the election timer.',
        '`becomeLeader`: initialise `nextIndex[p] = log.length + 1` and `matchIndex[p] = 0` for each peer, push a no-op `{ term: currentTerm, cmd: null }` to the log, persist, then `broadcastAppend(ctx)` and arm the heartbeat timer.',
        'Two leaders in a term usually means a vote was not persisted, or a node voted twice. A leader that never stays leader usually means heartbeats reset someone\'s timer incorrectly — check `onVoteReply` only counts votes for the **current** term.',
      ],
      why: 'This is the algorithm inside etcd, Consul, CockroachDB, TiKV, and the control plane of Kubernetes.',
    }),

    lab({
      id: 'nd4-raft-replication',
      title: 'Raft part 2 — log replication and the commit rule',
      kind: 'sim',
      difficulty: 5,
      minutes: 60,
      tags: ['raft', 'consensus', 'simulation'],
      viz: 'spacetime',
      stepBudget: BUDGET,
      prompt: `Election is given. Implement the **replication layer**: \`sendAppend\`, \`broadcastAppend\`, \`heartbeat\`, \`maybeAdvanceCommit\`, \`appendCommand\`, \`onAppendEntries\`, \`onAppendReply\`.

The tests submit commands (\`put\` requests to every node — only the leader accepts them) and check, under crashes, restarts and partitions, the safety properties from the paper:

- **Log Matching**: if two logs agree on (index, term), they agree on everything before it.
- **State-machine safety**: once an entry is committed on any node, no node ever has a *different* entry at that index.
- followers that missed entries **catch up**; a leader cut off with a minority **cannot commit**; after the network heals every log is identical.

\`status().log\` and \`status().commitIndex\` are what the tests inspect.`,
      expose: ['createNode'],
      files: jsFile(raftStarter('replication'), RAFT_FULL),
      tests: [
        simTest('every command ends up in every node\'s log, committed (no faults)', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 2 });
          new RaftInvariants({ checkLog: true }).attach(sim, 10, 3500);
          for (let i = 0; i < 8; i++) submitEverywhere(sim, 700 + i * 120, 'c' + i, 'k' + (i % 3), i);
          sim.run(3500);
          const want = Array.from({ length: 8 }, (_, i) => 'c' + i);
          for (const id of sim.nodes) {
            const s = statusOf(sim, id);
            expect(cmdIds(s)).toEqual(want);
            if (s.commitIndex !== s.log.length) throw new Error(`${id}: commitIndex ${s.commitIndex} but the log has ${s.log.length} entries — followers learn the commit index from leaderCommit`);
          }
        }),
        simTest('a follower that was down catches up after it restarts', ({ env, expect, attachTrace }) => {
          const sim = makeCluster(env, { seed: 5 });
          sim.sampleStatus(25, 5000);
          sim.crash('n5', 400);
          sim.restart('n5', 2200);
          for (let i = 0; i < 6; i++) submitEverywhere(sim, 800 + i * 150, 'x' + i, 'k', i);
          sim.run(5000);
          attachTrace(sim.exportTrace());
          const lead = leaders(sim)[0];
          expect(!!lead).toBe(true);
          expect(cmdIds(statusOf(sim, 'n5'))).toEqual(cmdIds(statusOf(sim, lead.id)));
          expect(cmdIds(statusOf(sim, 'n5')).length).toBe(6);
        }),
        simTest('safety under random crashes and partitions (30 seeds): log matching + committed entries never change', ({ env, expect }) => {
          for (let seed = 1; seed <= 30; seed++) {
            const sim = makeCluster(env, { seed });
            const inv = new RaftInvariants({ checkLog: true });
            inv.attach(sim, 10, 9000);
            randomFaults(sim, seed, { crashes: 3, partitions: 2, until: 5000 });
            for (let i = 0; i < 20; i++) submitEverywhere(sim, 400 + i * 230, `s${seed}-${i}`, 'k' + (i % 4), i);
            try { sim.run(9000); } catch (e: any) { throw new Error(`seed ${seed}: ${e.message}`); }
            expect(sim.errors).toEqual([]);
          }
        }),
        simTest('a leader cut off with a minority cannot commit; its stale entries are overwritten after healing', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 8 });
          const inv = new RaftInvariants({ checkLog: true });
          inv.attach(sim, 10, 7000);
          sim.run(1000);
          const old = leaders(sim)[0].id;
          const buddy = sim.nodes.find((n) => n !== old)!;
          const majority = sim.nodes.filter((n) => n !== old && n !== buddy);
          const beforeCommit = statusOf(sim, old).commitIndex;
          sim.partition([[old, buddy], majority]);
          for (let i = 0; i < 5; i++) submitEverywhere(sim, 1100 + i * 100, 'm' + i, 'k', i);
          sim.run(2800);
          const stuck = statusOf(sim, old);
          if (stuck.commitIndex > beforeCommit) throw new Error(`the isolated leader ${old} advanced commitIndex (${beforeCommit} → ${stuck.commitIndex}) without a majority`);
          const newLeader = leaders(sim).find((l) => majority.includes(l.id));
          if (!newLeader) throw new Error('the majority side should have elected a new leader');
          sim.heal();
          sim.run(7000);
          const sigs = sim.nodes.map((id) => JSON.stringify(statusOf(sim, id).log));
          expect(new Set(sigs).size).toBe(1);
        }),
        simTest('a leader never commits an old-term entry just by counting replicas (Raft paper, Figure 8)', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 31 });
          // isolate n1 so it can only act on the messages we hand it
          sim.partition(sim.nodes.map((n) => [n]), 0);
          // an "old leader" (term 2) gives n1 an entry from term 2
          sim.inject(10, 'n1', 'n2', { type: 'AppendEntries', term: 2, prevLogIndex: 0, prevLogTerm: 0, leaderCommit: 0, entries: [{ term: 2, cmd: { opId: 'old', op: { type: 'put', key: 'k', value: 1 } } }] });
          sim.at(800, (s) => {
            const st = statusOf(s, 'n1');
            if (st.role !== 'candidate' && st.role !== 'follower') return;
            const T = st.term;
            // two peers vote for n1 → it becomes leader of term T …
            s.inject(s.time + 1, 'n1', 'n2', { type: 'VoteReply', term: T, granted: true });
            s.inject(s.time + 2, 'n1', 'n3', { type: 'VoteReply', term: T, granted: true });
            // … then two peers claim to have replicated ONLY the old term-2 entry (index 1), not n1's new term-T entry
            s.inject(s.time + 10, 'n1', 'n2', { type: 'AppendReply', term: T, success: true, matchIndex: 1 });
            s.inject(s.time + 11, 'n1', 'n3', { type: 'AppendReply', term: T, success: true, matchIndex: 1 });
          });
          sim.run(840);
          const st = statusOf(sim, 'n1');
          if (st.role !== 'leader') throw new Error('test setup: n1 should have become leader after two injected votes (is your onVoteReply counting votes for the current term?)');
          if (st.commitIndex > 0) throw new Error(`n1 committed index ${st.commitIndex}: an entry from an OLDER term must not be committed by counting replicas — it could still be overwritten by a later leader. Only commit when the entry at that index belongs to currentTerm.`);
        }),
        hid('after the storm every log is identical and each command appears at most once in the committed prefix', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 17 });
          new RaftInvariants({ checkLog: true }).attach(sim, 10, 10000);
          randomFaults(sim, 17, { crashes: 4, partitions: 3, until: 4500 });
          for (let i = 0; i < 24; i++) submitEverywhere(sim, 500 + i * 250, 'q' + i, 'k', i);
          sim.run(10000);
          const logs = sim.nodes.map((id) => statusOf(sim, id));
          expect(new Set(logs.map((s) => JSON.stringify(s.log))).size).toBe(1);
          const ids = cmdIds(logs[0]);
          expect(new Set(ids).size).toBe(ids.length);
          expect(logs.every((s) => s.commitIndex === s.log.length)).toBe(true);
        }),
        hid('replication tolerates message loss (10%) and duplication', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 3, drop: 0.1 });
          new RaftInvariants({ checkLog: true }).attach(sim, 10, 8000);
          for (let i = 0; i < 10; i++) submitEverywhere(sim, 800 + i * 200, 'd' + i, 'k', i);
          sim.run(8000);
          const lead = leaders(sim)[0];
          expect(cmdIds(statusOf(sim, lead.id)).length).toBe(10);
        }),
      ],
      hints: [
        '`sendAppend(ctx, p)`: `prev = nextIndex[p] - 1`; send `{ type: "AppendEntries", term, prevLogIndex: prev, prevLogTerm: prev > 0 ? log[prev-1].term : 0, entries: log.slice(prev, prev + 32), leaderCommit: commitIndex }`.',
        '`onAppendEntries`: reject if `m.term < currentTerm`. Otherwise `stepDown` if the term is newer (or you are not a follower), record `leaderId`, and reset the election timer. Then the **consistency check** on `prevLogIndex` / `prevLogTerm`.',
        'Merging entries: for each new entry at index `idx`, if you already have one with a **different term**, truncate the log there (`log.length = idx - 1`) and append; if the term matches, keep it; if you have no entry, append. Persist if anything changed.',
        'Commit index on a follower: `min(leaderCommit, index of last new entry)`, then call `apply(ctx)`.',
        '`maybeAdvanceCommit`: for `n` from the end of the log down to `commitIndex + 1`: stop if `log[n-1].term !== currentTerm`; count yourself plus every peer with `matchIndex[p] >= n`; if that is a majority, set `commitIndex = n`, call `apply(ctx)`.',
        '`onAppendReply`: ignore if you are not the leader or the term is stale. On success update `matchIndex` / `nextIndex` and try to commit; on failure move `nextIndex` back (use `m.hint`) and resend.',
      ],
      why: 'Log replication + the commit rule is the heart of every replicated database.',
    }),

    lab({
      id: 'nd4-raft-kv',
      title: 'Raft part 3 — a linearizable key-value store',
      kind: 'sim',
      difficulty: 5,
      minutes: 45,
      tags: ['raft', 'linearizability', 'simulation'],
      viz: 'spacetime',
      stepBudget: BUDGET,
      prompt: `Election and replication are given. Implement the **state-machine layer**: \`apply\` and \`onClient\`.

Clients send \`{ opId, op }\` with \`op\` = \`{ type: 'put', key, value }\` or \`{ type: 'get', key }\`. A client that doesn't hear back **retries the same \`opId\`** (possibly on a different node, possibly after you already applied it!).

Requirements:
1. Only the leader answers; others reply \`{ ok: false, error: 'not-leader', leader }\`.
2. **Both \`put\` and \`get\` go through the log**, so a get can't return stale data from a deposed leader.
3. Apply committed entries **in order**; reply only **after** the entry is applied and only while you're still the leader.
4. **Exactly-once effect:** remember each \`opId\`'s result so a retried request is never applied twice.

The tests run concurrent clients through random crashes and partitions, record the *history* of operations (when each started, finished, and what it returned) and feed it to a **linearizability checker**.`,
      expose: ['createNode'],
      files: jsFile(raftStarter('kv'), RAFT_FULL),
      tests: [
        simTest('put then get returns the value (no faults)', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 1 });
          const d = new KvDriver(sim);
          d.put(800, 'a', 'x', 41);
          d.get(1200, 'a', 'x');
          d.put(1300, 'a', 'x', 42);
          d.get(1700, 'a', 'x');
          sim.run(3000);
          const gets = d.history.filter((o) => o.type === 'get');
          expect(gets.map((g) => g.result)).toEqual([41, 42]);
          expect(d.completed()).toBe(4);
        }),
        simTest('reading a missing key returns undefined', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 2 });
          const d = new KvDriver(sim);
          d.get(900, 'a', 'nope');
          sim.run(2500);
          expect(d.history[0].ret !== undefined).toBe(true);
          expect(d.history[0].result).toBe(undefined);
        }),
        simTest('liveness: with no faults 30 operations from 3 clients all complete', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 7 });
          const d = new KvDriver(sim);
          for (let i = 0; i < 30; i++) { if (i % 2) d.get(700 + i * 60, 'c' + (i % 3), 'k' + (i % 3)); else d.put(700 + i * 60, 'c' + (i % 3), 'k' + (i % 3), i); }
          sim.run(4500);
          if (d.completed() < 30) throw new Error(`only ${d.completed()} of 30 operations completed in a healthy cluster`);
          expect(checkLinearizable(d.history).ok).toBe(true);
        }),
        simTest('a retried request is applied exactly once', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 3 });
          sim.run(1000);
          const L = leaders(sim)[0].id;
          const req = (opId: string, op: any) => ({ opId, op });
          sim.clientRequest(1100, L, req('A', { type: 'put', key: 'k', value: 1 }));
          sim.clientRequest(1400, L, req('B', { type: 'put', key: 'k', value: 2 }));
          sim.clientRequest(1800, L, req('A', { type: 'put', key: 'k', value: 1 })); // late duplicate of A
          sim.clientRequest(2200, L, req('G', { type: 'get', key: 'k' }));
          sim.run(3200);
          const res = (id: string) => sim.responses.filter((r) => r.opId === id && r.body.ok).map((r) => r.body);
          if (res('A').length < 2) throw new Error('the duplicate request A should still get an answer (its saved result)');
          expect(res('G')[0].value).toBe(2);
        }),
        simTest('linearizable under random crashes and partitions (25 seeds)', ({ env, expect, attachTrace }) => {
          for (let seed = 1; seed <= 25; seed++) {
            const sim = makeCluster(env, { seed });
            new RaftInvariants({ checkLog: true }).attach(sim, 10, 9000);
            randomFaults(sim, seed, { crashes: 3, partitions: 2, until: 5000 });
            const d = new KvDriver(sim);
            for (let i = 0; i < 24; i++) {
              const c = 'c' + (i % 3);
              const k = 'k' + (i % 2);
              if (i % 2 === 0) d.put(300 + i * 250, c, k, i);
              else d.get(300 + i * 250, c, k);
            }
            try { sim.run(9000); } catch (e: any) { throw new Error(`seed ${seed}: ${e.message}`); }
            const lin = checkLinearizable(d.history);
            if (!lin.ok) {
              attachTrace(sim.exportTrace());
              throw new Error(`seed ${seed}: NOT LINEARIZABLE — ${lin.reason}\nHistory of key ${lin.key}:\n` + d.history.filter((o) => o.key === lin.key).map((o) => `  ${o.type}(${o.type === 'put' ? o.value : ''}) by ${o.client} [${Math.round(o.invoke)}ms → ${o.ret === undefined ? '…no response' : Math.round(o.ret) + 'ms'}]${o.type === 'get' ? ' = ' + JSON.stringify(o.result) : ''}`).join('\n'));
            }
            if (seed === 3) attachTrace(sim.exportTrace());
            expect(sim.errors).toEqual([]);
          }
        }),
        hid('a deposed leader does not serve stale reads', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 21 });
          const inv = new RaftInvariants({ checkLog: true });
          inv.attach(sim, 10, 6000);
          sim.run(1000);
          const old = leaders(sim)[0].id;
          const rest = sim.nodes.filter((n) => n !== old);
          sim.clientRequest(1050, old, { opId: 'P0', op: { type: 'put', key: 'x', value: 'old' } });
          sim.run(1500);
          sim.partition([[old], rest]); // old leader isolated
          sim.run(2500);
          const newL = leaders(sim).find((l) => l.id !== old);
          if (!newL) throw new Error('a new leader should emerge among the connected majority');
          sim.clientRequest(2600, newL.id, { opId: 'P1', op: { type: 'put', key: 'x', value: 'new' } });
          sim.clientRequest(3200, old, { opId: 'GSTALE', op: { type: 'get', key: 'x' } });
          sim.run(4000);
          const stale = sim.responses.find((r) => r.opId === 'GSTALE' && r.body.ok);
          if (stale) expect(stale.body.value).not.toBe('old');
        }),
        hid('duplicate and lost messages (5% loss)', ({ env, expect }) => {
          const sim = makeCluster(env, { seed: 12, drop: 0.05 });
          const d = new KvDriver(sim);
          for (let i = 0; i < 16; i++) { if (i % 2) d.get(700 + i * 200, 'c' + (i % 2), 'k'); else d.put(700 + i * 200, 'c' + (i % 2), 'k', i); }
          sim.run(9000);
          expect(checkLinearizable(d.history).ok).toBe(true);
          expect(d.completed()).toBeGreaterThanOrEqual(14);
        }),
      ],
      hints: [
        '`onClient`: if you are not the leader reply `{ ok: false, error: "not-leader", leader: leaderId }`. If `req.opId in results` reply with that saved result immediately. Otherwise `pending.add(req.opId)` and `appendCommand(ctx, { opId, op })`.',
        '`apply`: loop `while (lastApplied < commitIndex)`. Skip `null` commands (leader no-ops). For a `put` set `kv[key] = value`; for a `get` read `kv[key]`. Save the result under `results[opId]` — and if that opId is already there, reuse the saved result instead of applying again.',
        'Reply with `ctx.respond(opId, result)` only if `role === "leader"` **and** `pending.has(opId)`; then delete it from `pending`.',
        'Why do gets go through the log? A leader that was deposed by a partition would otherwise answer from stale `kv`. A log entry can only commit while a majority still follows this leader.',
        'If the linearizability check fails the message prints the exact history. Look for a `get` that returned an older value than a `put` that had already completed before the get began.',
      ],
      why: 'This is, in miniature, etcd/Consul: a linearizable key-value store you can reason about, built from a replicated log.',
    }),
  ],
  references: [
    { title: 'In Search of an Understandable Consensus Algorithm (Raft) — Ongaro & Ousterhout, USENIX ATC 2014', url: 'https://raft.github.io/raft.pdf' },
    { title: 'The Raft visualisation & reference', url: 'https://raft.github.io/' },
    { title: 'Impossibility of Distributed Consensus with One Faulty Process (FLP) — Fischer, Lynch, Paterson, 1985' },
    { title: 'Linearizability: A Correctness Condition for Concurrent Objects — Herlihy & Wing, 1990' },
    { title: 'Jepsen — consistency models map', url: 'https://jepsen.io/consistency' },
  ],
};
export default mod;
