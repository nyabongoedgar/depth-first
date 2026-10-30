import type { Module } from '../../core/types';
import { ex, prop, sim as simTest, hid, lab, jsFile } from '../helpers';
import { Sim, NodeFactory } from '../../sim/dsim';
import { KvDriver } from '../../sim/kvclient';
import { checkLinearizable } from '../../sim/lin';
import { randomFaults } from '../../sim/faults';

const NODES = ['n1', 'n2', 'n3', 'n4', 'n5'];
function cluster(env: Record<string, any>, seed: number, opts: { drop?: number } = {}) {
  if (typeof env.createNode !== 'function') throw new Error('Define `createNode(id, peers)`.');
  const sim = new Sim({ seed, nodes: NODES, factory: env.createNode as NodeFactory, drop: opts.drop });
  sim.start();
  return sim;
}

export const ABD_SOLUTION = `function createNode(id, peers) {
  const MAJORITY = Math.floor((peers.length + 1) / 2) + 1;
  const store = {}; // key -> { ts: [counter, nodeId], value }   (this node's replica; persisted)
  const ops = {}; // coordinator state of the operations this node is running
  let seq = 0;

  // timestamps are (counter, writerId) pairs, compared lexicographically
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const replica = (key) => store[key] || { ts: [0, ''], value: undefined };
  function persist(ctx) {
    ctx.storage.set('abd', store);
  }
  function writeLocal(ctx, key, ts, value) {
    const cur = store[key];
    if (!cur || less(cur.ts, ts)) {
      store[key] = { ts, value };
      persist(ctx);
    }
  }

  function startWritePhase(ctx, rid, op, ts, value) {
    op.phase = 2;
    op.acks = new Set([id]);
    op.ts = ts;
    op.value = value;
    writeLocal(ctx, op.key, ts, value);
    ctx.broadcast({ type: 'Write', rid, key: op.key, ts, value });
    finishIfDone(ctx, rid);
  }

  function finishIfDone(ctx, rid) {
    const op = ops[rid];
    if (!op || op.phase !== 2 || op.acks.size < MAJORITY) return;
    delete ops[rid];
    ctx.respond(op.opId, op.type === 'put' ? { ok: true } : { ok: true, value: op.value });
  }

  function onQueryDone(ctx, rid) {
    const op = ops[rid];
    let best = replica(op.key);
    for (const r of Object.values(op.replies)) if (less(best.ts, r.ts)) best = r;
    if (op.type === 'put') startWritePhase(ctx, rid, op, [best.ts[0] + 1, id], op.value);
    else startWritePhase(ctx, rid, op, best.ts, best.value); // read: write the value back to a majority before returning it
  }

  return {
    onStart(ctx) {
      const saved = ctx.storage.get('abd');
      if (saved) Object.assign(store, saved);
    },
    onClient(ctx, req) {
      const rid = id + ':' + ++seq;
      const op = { opId: req.opId, type: req.op.type, key: req.op.key, value: req.op.value, phase: 1, replies: {} };
      ops[rid] = op;
      ctx.broadcast({ type: 'Query', rid, key: op.key });
      op.replies[id] = replica(op.key);
      if (Object.keys(op.replies).length >= MAJORITY) onQueryDone(ctx, rid);
    },
    onMessage(ctx, from, m) {
      if (m.type === 'Query') {
        const r = replica(m.key);
        ctx.send(from, { type: 'QueryReply', rid: m.rid, ts: r.ts, value: r.value });
      } else if (m.type === 'QueryReply') {
        const op = ops[m.rid];
        if (!op || op.phase !== 1 || op.replies[from]) return;
        op.replies[from] = { ts: m.ts, value: m.value };
        if (Object.keys(op.replies).length >= MAJORITY) onQueryDone(ctx, m.rid);
      } else if (m.type === 'Write') {
        writeLocal(ctx, m.key, m.ts, m.value);
        ctx.send(from, { type: 'WriteAck', rid: m.rid });
      } else if (m.type === 'WriteAck') {
        const op = ops[m.rid];
        if (!op || op.phase !== 2) return;
        op.acks.add(from);
        finishIfDone(ctx, m.rid);
      }
    },
  };
}
`;

const mod: Module = {
  id: 'replication-quorums',
  course: 'node-dist',
  title: 'Replication & Quorums (and a Linearizable Register without a Leader)',
  minutes: 90,
  objectives: [
    'Compare single-leader, multi-leader and leaderless replication',
    'Calculate quorum sizes (N, R, W) and what they guarantee',
    'Explain why R + W > N is NOT enough for linearizability',
    'Implement the ABD protocol: a linearizable read/write register built only from majority quorums',
  ],
  body: `
## Why replicate?

- **Availability** — survive node failures.
- **Durability** — more than one copy of the data.
- **Latency** — put a copy near users.
- **Read throughput** — spread reads across replicas.

The price: keeping copies **consistent**.

## Three replication architectures

| | Writes go to | Reads from | Conflicts | Used by |
|---|---|---|---|---|
| **Single leader** (primary/backup) | the leader, which streams a log to followers | leader (strong) or followers (maybe stale) | none (one writer) | PostgreSQL, MySQL, MongoDB, Raft/etcd |
| **Multi-leader** | a leader in each datacentre | local leader | possible — must be resolved | multi-region DBs, CouchDB, collaborative editing |
| **Leaderless** (Dynamo-style) | any replica(s) directly | several replicas | possible — versions/CRDTs | Cassandra, Riak, DynamoDB |

*Synchronous* replication waits for followers before acknowledging (durable, slower, an unavailable follower blocks writes); *asynchronous* acknowledges immediately (fast, but a leader crash can **lose** acknowledged writes; reads from followers lag).

## Quorums

With N replicas, a write waits for **W** acknowledgements and a read queries **R** replicas. If **R + W > N** then every read quorum **overlaps** every write quorum in at least one replica, so a read sees at least one copy of the latest completed write (pick the highest version).

| N | W | R | Notes |
|---|---|---|---|
| 3 | 2 | 2 | classic; tolerates 1 failure for reads *and* writes |
| 5 | 3 | 3 | tolerates 2 failures |
| 3 | 3 | 1 | fast reads; one failed node blocks writes |
| 3 | 1 | 3 | fast writes; one failed node blocks reads |

**Majority quorums** (W = R = ⌊N/2⌋ + 1) are the sweet spot, and any two majorities intersect — the idea behind Raft, Paxos and ZooKeeper.

### But R + W > N does not give linearizability

Overlap guarantees you can *find* the latest value, not that concurrent operations are ordered consistently. Two classic anomalies with plain quorum reads/writes:

1. **Concurrent writes** may be applied in different orders on different replicas, and with last-write-wins on skewed clocks one is lost.
2. **Read inversion** ("new/old inversion"): a read returns the *new* value from a replica that already got the write; a later read hits only replicas without it and returns the *old* value. Time went backwards.

Systems add **read repair** (the reader writes the newest version back to stale replicas it noticed), **hinted handoff**, and **anti-entropy** (background Merkle-tree comparison) — good for *eventual* consistency, but still not linearizable.

## ABD: a linearizable register from majorities

Attiya, Bar-Noy and Dolev (1995) showed you can implement a linearizable **read/write register** on top of an asynchronous network with crash failures **without a leader or consensus**, as long as a majority is alive. Every value carries a **timestamp** \`(counter, writerId)\`, and every operation has **two phases**, each talking to a **majority**:

- **write(v):** *(1)* ask a majority for their current timestamps; pick the maximum counter \`c\`. *(2)* send \`(v, (c+1, myId))\` to a majority; wait for acks. Return.
- **read():** *(1)* ask a majority for \`(timestamp, value)\`; pick the highest. *(2)* **write that pair back** to a majority (so every later operation sees it). Return the value.

The **write-back** in a read is what prevents read inversion: once a read has returned a value, a majority stores it, so any later read must see it. (This is why ABD reads are not free — and why Cassandra's \`QUORUM\` reads are not linearizable.)

\`\`\`js run
// the two quorum facts you need: majorities of an odd cluster always intersect
const N = 5, maj = Math.floor(N / 2) + 1;
console.log("majority of", N, "=", maj, "→ two majorities share at least", 2 * maj - N, "node(s)");
\`\`\`

## Checking linearizability

**Linearizability** (Herlihy & Wing): every operation appears to take effect **atomically at some point between its invocation and its response**, and all operations are consistent with a single global order that respects real time. Concretely: after a write *returns*, every later read sees it (or something newer); and reads never go backwards. The simulator records each client operation's start and end and a **checker** searches for such an order (exponential in the worst case, fine for a few dozen operations per key). Tools like Jepsen's *Knossos* and *Porcupine* do this for real databases.

:::warn
**Retries and idempotency.** If a client retries a **put** after a timeout, the first attempt may *also* have taken effect — the operation could be applied twice at different times, and a linearizability checker (rightly) rejects the history. Real systems attach a unique id to each request and de-duplicate (as in the Raft KV lab). In this lab the client sends each request **once**.
:::

:::interview
"Cassandra has quorum reads and writes (R + W > N). Is it linearizable?" — No. Explain concurrent writes with LWW, read inversion, and sloppy quorums; mention that linearizable reads need either a write-back phase (ABD), consensus on the order (Raft/Paxos), or lightweight transactions (compare-and-set via Paxos) at a cost.
:::
`,
  quiz: [
    { q: 'N = 5, W = 3, R = 3. How many replicas can fail before writes become impossible?', options: ['0', '1', '2', '3'], answer: 2, why: 'A write needs 3 acks; with 5 replicas you can lose 2 and still collect 3.' },
    { q: 'Why does R + W > N alone NOT guarantee linearizability?', options: ['Quorums are too small', 'Concurrent operations can still be seen in inconsistent orders, and a read can return a value that a later read then "un-sees"', 'It requires a leader', 'It is always linearizable'], answer: 1, why: 'Overlap finds the latest completed write but does not order concurrent ops or prevent read inversion.' },
    { q: 'What is the purpose of the write-back phase in an ABD read?', options: ['Garbage collection', 'To make sure a majority stores the value before it is returned, so later reads cannot see an older value', 'To compress data', 'To elect a leader'], answer: 1, why: 'It prevents new/old inversion.' },
    { q: 'Which architecture can lose acknowledged writes if the leader crashes?', options: ['Synchronous replication to all followers', 'Asynchronous single-leader replication', 'Raft with a majority commit', 'ABD'], answer: 1, why: 'The leader acknowledged before followers had the data.' },
    { q: 'Two majorities of a 7-node cluster always share at least…', options: ['0 nodes', '1 node', '2 nodes', '3 nodes'], answer: 1, why: '4 + 4 − 7 = 1.' },
  ],
  labs: [
    lab({
      id: 'nd3-quorum-math',
      title: 'Quorum arithmetic',
      kind: 'answer',
      difficulty: 1,
      minutes: 8,
      tags: ['quorums'],
      prompt: 'Work out the quorum numbers.',
      questions: [
        { id: 'q1', prompt: 'The size of a **majority** quorum in a cluster of 9 nodes.', type: 'number', answer: 5 },
        { id: 'q2', prompt: 'A cluster of 7 nodes uses majority quorums. How many node failures can it tolerate and still make progress?', type: 'number', answer: 3 },
        { id: 'q3', prompt: 'N = 6, W = 4. What is the **smallest R** that guarantees a read quorum overlaps every write quorum (R + W > N)?', type: 'number', answer: 3 },
        { id: 'q4', prompt: 'You want to survive **2 failures** with majority quorums. What is the **minimum cluster size**?', type: 'number', answer: 5 },
        { id: 'q5', prompt: 'N = 3, W = 1, R = 1. Does a read always see the latest completed write?', type: 'choice', options: ['Yes', 'No — R + W = 2 is not greater than N = 3'], answer: 1 },
        { id: 'q6', prompt: 'Which setting gives the **fastest reads** while still satisfying R + W > N for N = 5?', type: 'choice', options: ['R = 1, W = 5', 'R = 3, W = 3', 'R = 5, W = 1', 'R = 2, W = 2'], answer: 0 },
      ],
      hints: ['Majority = ⌊N/2⌋ + 1.', 'To make progress you need a quorum alive: failures tolerated = N − quorum size.', 'R + W > N ⇒ R ≥ N − W + 1.'],
    }),

    lab({
      id: 'nd3-read-repair',
      title: 'Read repair',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['quorums', 'repair'],
      prompt: `A coordinator queried several replicas for one key. Each response is \`{ node, version, value }\` (\`version\` is an integer: higher = newer).

\`readRepair(responses)\` returns \`{ value, version, stale }\`:
- \`value\`, \`version\`: from the response with the **highest version** (on a tie, the first such response);
- \`stale\`: the **node ids that need to be repaired** — every responder whose version is lower — **in the order they appear**.

An empty \`responses\` array returns \`{ value: undefined, version: 0, stale: [] }\`.`,
      expose: ['readRepair'],
      files: jsFile(`function readRepair(responses) {\n  \n}\n`, `function readRepair(responses) {
  if (responses.length === 0) return { value: undefined, version: 0, stale: [] };
  let best = responses[0];
  for (const r of responses) if (r.version > best.version) best = r;
  return { value: best.value, version: best.version, stale: responses.filter((r) => r.version < best.version).map((r) => r.node) };
}
`),
      tests: [
        ex('picks the newest and lists the stale replicas', ({ env, expect }) => {
          const r = env.readRepair([{ node: 'a', version: 3, value: 'old' }, { node: 'b', version: 5, value: 'new' }, { node: 'c', version: 5, value: 'new' }, { node: 'd', version: 1, value: 'older' }]);
          expect(r).toEqual({ value: 'new', version: 5, stale: ['a', 'd'] });
        }),
        ex('everyone agrees → nothing to repair', ({ env, expect }) => {
          expect(env.readRepair([{ node: 'a', version: 2, value: 'x' }, { node: 'b', version: 2, value: 'x' }])).toEqual({ value: 'x', version: 2, stale: [] });
        }),
        ex('empty responses', ({ env, expect }) => expect(env.readRepair([])).toEqual({ value: undefined, version: 0, stale: [] })),
        ex('does not mutate its input', ({ env, expect }) => {
          const input = [{ node: 'a', version: 1, value: 1 }, { node: 'b', version: 2, value: 2 }];
          const copy = JSON.stringify(input);
          env.readRepair(input);
          expect(JSON.stringify(input)).toBe(copy);
        }),
        prop('property: stale ∪ up-to-date covers every responder exactly once', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 4), 1, 7)], (versions: number[]) => {
            const resp = versions.map((v, i) => ({ node: 'n' + i, version: v, value: 'v' + v }));
            const r = env.readRepair(resp);
            expect(r.version).toBe(Math.max(...versions));
            expect(r.stale).toEqual(resp.filter((x) => x.version < r.version).map((x) => x.node));
          });
        }),
      ],
      hints: ['Find the response with the highest `version` first.', 'Then collect, in order, the `node` of every response with a smaller version.'],
    }),

    lab({
      id: 'nd3-abd',
      title: 'ABD: a linearizable register from majorities',
      kind: 'sim',
      difficulty: 5,
      minutes: 60,
      tags: ['quorums', 'linearizability', 'simulation'],
      viz: 'spacetime',
      stepBudget: 150_000_000,
      prompt: `Implement the **ABD register protocol**. Every node is both a **replica** (stores \`{ ts, value }\` per key) and a **coordinator** (runs client operations). Clients may send a request to *any* node: \`onClient(ctx, { opId, op })\` with \`op\` = \`{ type: 'put', key, value }\` or \`{ type: 'get', key }\`. Answer with \`ctx.respond(opId, { ok: true })\` / \`{ ok: true, value }\`.

Timestamps are \`[counter, writerId]\` pairs compared lexicographically. Each operation has two phases, each completed on a **majority** (3 of 5, counting yourself):

- **put:** phase 1 query for timestamps → \`newTs = [maxCounter + 1, id]\` → phase 2 write \`(newTs, value)\`.
- **get:** phase 1 query → pick the highest \`(ts, value)\` → **phase 2 write it back** → return it.

Replicas keep a pair only if its timestamp is **greater** than what they hold, and must **persist** it (\`ctx.storage\`), because crashes erase memory. Messages may be lost, duplicated or delayed: track which nodes have replied (don't count one twice).

The tests drive concurrent clients through random crashes and partitions and check that the recorded history is **linearizable** — safety must hold even when operations cannot complete.`,
      expose: ['createNode'],
      files: jsFile(`function createNode(id, peers) {
  const MAJORITY = Math.floor((peers.length + 1) / 2) + 1;
  const store = {}; // key -> { ts: [counter, writerId], value }  — this node's replica (persist it!)
  const ops = {}; // operations this node is coordinating, by request id
  let seq = 0;

  return {
    onStart(ctx) {
      // reload the replica from ctx.storage after a restart
    },

    onClient(ctx, req) {
      // coordinate: phase 1 = ask everyone (and yourself) for their (ts, value)
    },

    onMessage(ctx, from, m) {
      // replica side: answer queries, apply writes (only if the timestamp is newer), ack
      // coordinator side: collect replies until a majority, then start phase 2 / respond
    },
  };
}
`, ABD_SOLUTION),
      tests: [
        simTest('put then get (no faults), from different nodes', ({ env, expect }) => {
          const sim = cluster(env, 1);
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.put(100, 'a', 'x', 'one');
          d.get(500, 'b', 'x');
          d.put(900, 'c', 'x', 'two');
          d.get(1300, 'a', 'x');
          sim.run(2500);
          expect(d.completed()).toBe(4);
          expect(d.history.filter((o) => o.type === 'get').map((o) => o.result)).toEqual(['one', 'two']);
        }),
        simTest('a missing key reads as undefined', ({ env, expect }) => {
          const sim = cluster(env, 2);
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.get(100, 'a', 'ghost');
          sim.run(1000);
          expect(d.completed()).toBe(1);
          expect(d.history[0].result).toBe(undefined);
        }),
        simTest('operations still complete with two nodes crashed (a majority is alive)', ({ env, expect }) => {
          const sim = cluster(env, 3);
          sim.crash('n4', 50);
          sim.crash('n5', 50);
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.put(200, 'a', 'k', 7);
          d.get(600, 'a', 'k');
          sim.run(2000);
          expect(d.history.map((o) => o.ret !== undefined)).toEqual([true, true]);
          expect(d.history[1].result).toBe(7);
        }),
        simTest('operations cannot complete without a majority (safety over liveness)', ({ env, expect }) => {
          const sim = cluster(env, 4);
          sim.partition([['n1', 'n2'], ['n3', 'n4', 'n5']], 0);
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.put(200, 'a', 'k', 1, 'n1'); // the client talks to a node in the 2-node minority
          sim.run(2000);
          if (d.history.some((o) => o.ret !== undefined && o.client === 'a')) throw new Error('an operation completed using only 2 of 5 nodes — a quorum is 3');
        }),
        simTest('linearizable under random crashes and partitions (30 seeds)', ({ env, expect, attachTrace }) => {
          for (let seed = 1; seed <= 30; seed++) {
            const sim = cluster(env, seed);
            randomFaults(sim, seed, { crashes: 3, partitions: 2, until: 4500 });
            const d = new KvDriver(sim, { maxAttempts: 1 });
            for (let i = 0; i < 30; i++) {
              const c = 'c' + (i % 4);
              const k = 'k' + (i % 2);
              if (i % 3 === 0) d.put(100 + i * 160, c, k, i);
              else d.get(100 + i * 160, c, k);
            }
            sim.run(9000);
            const lin = checkLinearizable(d.history);
            if (!lin.ok) {
              attachTrace(sim.exportTrace());
              throw new Error(`seed ${seed}: NOT LINEARIZABLE — ${lin.reason}\n` + d.history.filter((o) => o.key === lin.key).map((o) => `  ${o.client} ${o.type}${o.type === 'put' ? '(' + o.value + ')' : ''} [${Math.round(o.invoke)} → ${o.ret === undefined ? '…' : Math.round(o.ret)}]${o.type === 'get' ? ' = ' + o.result : ''}`).join('\n'));
            }
            if (seed === 2) attachTrace(sim.exportTrace());
          }
        }),
        simTest('no new/old inversion: a read that saw a value must write it back before returning', ({ env, expect }) => {
          // The writer is cut off mid-write: only n2 ever receives the new value. Reader 1 happens to contact n2;
          // reader 2 (later!) contacts only nodes that never saw it. Without the write-back, reader 2 goes back in time.
          const sim = cluster(env, 7);
          sim.dropIf = (from, to, m) => (from === 'n1' && m.type === 'Write' && to !== 'n2') || (from === 'n3' && m.type === 'Query' && to === 'n5') || (from === 'n5' && m.type === 'Query' && to === 'n2');
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.put(100, 'w0', 'x', 'v1', 'n4');
          d.put(300, 'w1', 'x', 'v2', 'n1');
          sim.crash('n1', 450);
          d.get(600, 'r1', 'x', 'n3');
          d.get(1000, 'r2', 'x', 'n5');
          sim.run(2500);
          const r1 = d.history.find((o) => o.client === 'r1')!;
          const r2 = d.history.find((o) => o.client === 'r2')!;
          if (r1.ret === undefined || r2.ret === undefined) throw new Error('both reads should complete: each can reach a majority');
          const lin = checkLinearizable(d.history);
          if (!lin.ok) throw new Error(`reader 1 returned ${JSON.stringify(r1.result)} and then reader 2, starting later, returned ${JSON.stringify(r2.result)}: time went backwards. A read must write the value it is about to return back to a majority first.`);
        }),
        simTest('a late duplicate of an OLD write must not overwrite newer data', ({ env, expect }) => {
          const sim = cluster(env, 8);
          let oldWrite: any = null;
          sim.onSend = (from, _to, m) => { if (m.type === 'Write' && m.value === 'old' && !oldWrite) oldWrite = m; };
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.put(100, 'a', 'k', 'old', 'n4');
          d.put(500, 'a', 'k', 'new', 'n2');
          sim.run(1000);
          if (!oldWrite) throw new Error('test setup: no Write message was observed — does a put send { type: "Write", … value } to the other replicas?');
          for (const n of ['n1', 'n2', 'n3', 'n4', 'n5']) sim.inject(1100, n, 'n4', oldWrite); // the network finally delivers a stale, delayed copy
          d.get(1300, 'b', 'k', 'n1');
          sim.run(2200);
          const g = d.history.find((o) => o.type === 'get')!;
          if (g.result !== 'new') throw new Error(`the read returned ${JSON.stringify(g.result)} after a put of "new" completed: a replica must only accept a write whose timestamp is greater than the one it already holds.`);
        }),
        simTest('acknowledged writes survive a crash-restart of a majority (persist the replica!)', ({ env, expect }) => {
          const sim = cluster(env, 9);
          const d = new KvDriver(sim, { maxAttempts: 1 });
          d.put(100, 'a', 'k', 'durable', 'n4');
          for (const n of ['n1', 'n2', 'n3']) { sim.crash(n, 700); sim.restart(n, 800); }
          sim.dropIf = (from, to, m) => m.type === 'Query' && from === 'n1' && (to === 'n4' || to === 'n5');
          d.get(1100, 'b', 'k', 'n1'); // n1 can only hear from the three nodes that just restarted
          sim.run(2500);
          if (d.history[0].ret === undefined) throw new Error('the put should have completed in a healthy cluster');
          const g = d.history.find((o) => o.type === 'get')!;
          if (g.result !== 'durable') throw new Error(`after a majority restarted the read returned ${JSON.stringify(g.result)}: replicas must persist what they store (ctx.storage) and reload it in onStart.`);
        }),
        hid('survives 5% message loss without ever breaking linearizability', ({ env, expect }) => {
          for (let seed = 1; seed <= 10; seed++) {
            const sim = cluster(env, seed, { drop: 0.05 });
            const d = new KvDriver(sim, { maxAttempts: 1 });
            for (let i = 0; i < 20; i++) { if (i % 3 === 0) d.put(100 + i * 150, 'c' + (i % 3), 'k', i); else d.get(100 + i * 150, 'c' + (i % 3), 'k'); }
            sim.run(7000);
            expect(checkLinearizable(d.history).ok).toBe(true);
          }
        }),
      ],
      hints: [
        'Coordinator state per operation: `{ opId, type, key, value, phase, replies, acks }`, stored under a unique id like `id + ":" + ++seq` that you put in every message so replies can be matched.',
        'Phase 1: `ctx.broadcast({ type: "Query", rid, key })` and record **your own** replica\'s `(ts, value)` as one reply. When `Object.keys(replies).length >= MAJORITY`, pick the reply with the greatest `ts`.',
        'Phase 2 for `put`: `newTs = [best.ts[0] + 1, id]`. For `get`: reuse `best.ts` and `best.value` (the write-back). `ctx.broadcast({ type: "Write", rid, key, ts, value })`, apply it to your own replica, and count yourself as an ack.',
        'Replica side: `Write` only replaces the stored pair if the new timestamp is greater — compare `[counter, nodeId]` pairs lexicographically — then **persist** and send `WriteAck`. `Query` replies with the stored `(ts, value)` (use `[0, ""]` and `undefined` if absent).',
        'Respond to the client only when phase 2 has a majority of acks. Ignore replies for unknown or finished operations, and ignore a second reply from the same node.',
        'Skipping the write-back in `get` passes simple tests but is NOT linearizable — the random-fault test will eventually find an inversion.',
      ],
      why: 'ABD is the seed idea behind quorum registers in many storage systems, and a clean example of "consistency without consensus".',
    }),
  ],
  references: [
    { title: 'Sharing Memory Robustly in Message-Passing Systems (ABD) — Attiya, Bar-Noy, Dolev, JACM 1995' },
    { title: 'Designing Data-Intensive Applications — Martin Kleppmann, Ch. 5 Replication & Ch. 9 Consistency and Consensus' },
    { title: 'Jepsen: Cassandra analysis (why quorum ≠ linearizable)', url: 'https://aphyr.com/posts/294-call-me-maybe-cassandra' },
  ],
};
export default mod;
