/**
 * Mutation testing of the Raft graders: inject classic Raft bugs into the reference solution and
 * require that the lab tests catch every one. A grader that accepts a broken Raft is worse than none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAFT_FULL } from '../src/content/node-dist/raft-solution';
import course from '../src/content/node-dist/index';
import { runLab } from '../src/grader/run';

process.on('unhandledRejection', () => {});

const labs = Object.fromEntries(course.modules.filter((m) => m.id === 'consensus-raft').flatMap((m) => m.labs).map((l) => [l.id, l]));
const run = (labId: string, code: string) => runLab(labs[labId], { files: { 'solution.js': code } });

type Edit = [from: string, to: string];
interface Mutant { name: string; edits: Edit[] }

const mutants: Mutant[] = [
  {
    name: 'votes are not persisted before replying',
    edits: [['votedFor = from;\n        persist(ctx); // the vote must be durable before we reply\n        resetElectionTimer(ctx);', 'votedFor = from;\n        resetElectionTimer(ctx);']],
  },
  { name: 'a node may vote for several candidates in one term', edits: [['(votedFor === null || votedFor === from)', 'true']] },
  { name: 'election restriction ignored (stale logs can win)', edits: [['if (upToDate) {', 'if (true) {']] },
  {
    name: 'conflicting log entries are not truncated',
    edits: [['log.length = idx - 1; // conflict: drop this entry and everything after it\n          log.push(e);', 'log[idx - 1] = e;']],
  },
  { name: 'commit without a majority (leader commits immediately)', edits: [['if (count >= MAJORITY) {', 'if (count >= 1) {']] },
  { name: 'a follower commits beyond what the leader committed', edits: [['commitIndex = Math.min(m.leaderCommit, last);', 'commitIndex = last;']] },
  { name: 'the leader commits old-term entries by counting replicas', edits: [['if (log[n - 1].term !== currentTerm) break;', '']] },
  {
    name: 'duplicate client requests are applied twice (no dedupe anywhere)',
    edits: [
      ['if (c.opId in results) res = results[c.opId]; // a duplicate (client retry): do not apply twice\n      else {', '{'],
      ['    if (req.opId in results) return ctx.respond(req.opId, results[req.opId]);\n    pending.add(req.opId);', '    pending.add(req.opId);'],
      ['    if (!log.some((e) => e.cmd && e.cmd.opId === cmd.opId)) {\n      log.push({ term: currentTerm, cmd });\n      persist(ctx);\n      broadcastAppend(ctx);\n    }', '    log.push({ term: currentTerm, cmd });\n    persist(ctx);\n    broadcastAppend(ctx);'],
    ],
  },
  {
    name: 'gets are answered from local state without the log (stale reads)',
    edits: [['    pending.add(req.opId);\n    appendCommand(ctx, { opId: req.opId, op: req.op });', "    if (req.op.type === 'get') return ctx.respond(req.opId, { ok: true, value: kv[req.op.key] });\n    pending.add(req.opId);\n    appendCommand(ctx, { opId: req.opId, op: req.op });"]],
  },
];

test('the reference solution passes all three labs', async () => {
  for (const id of Object.keys(labs)) assert.equal((await run(id, RAFT_FULL)).status, 'pass', id);
});

for (const m of mutants) {
  test(`mutant killed: ${m.name}`, async () => {
    let code = RAFT_FULL;
    for (const [from, to] of m.edits) {
      assert.ok(code.includes(from), 'mutation pattern not found in the reference — update the test: ' + from.slice(0, 60));
      code = code.replace(from, to);
    }
    const results = await Promise.all(Object.keys(labs).map(async (id) => [id, await run(id, code)] as const));
    const caughtBy = results.filter(([, r]) => r.status !== 'pass').map(([id]) => id);
    assert.ok(caughtBy.length > 0, `SURVIVED: no lab detected "${m.name}"`);
    console.log(`  ✓ "${m.name}" caught by ${caughtBy.join(', ')}`);
  });
}

// ---------------- ABD register ----------------
import { ABD_SOLUTION } from '../src/content/node-dist/n03-quorums';
const abd = course.modules.flatMap((m) => m.labs).find((l) => l.id === 'nd3-abd')!;
const abdMutants: Mutant[] = [
  { name: 'ABD read skips the write-back phase', edits: [["else startWritePhase(ctx, rid, op, best.ts, best.value); // read: write the value back to a majority before returning it", "else { delete ops[rid]; ctx.respond(op.opId, { ok: true, value: best.value }); }"]] },
  { name: 'ABD uses a quorum of 2 instead of a majority', edits: [['const MAJORITY = Math.floor((peers.length + 1) / 2) + 1;', 'const MAJORITY = 2;']] },
  { name: 'ABD replicas overwrite regardless of timestamp', edits: [['if (!cur || less(cur.ts, ts)) {', 'if (true) {']] },
  { name: 'ABD never persists the replica (a restart forgets writes)', edits: [["ctx.storage.set('abd', store);", '']] },
];
test('ABD reference passes', async () => assert.equal((await runLab(abd, { files: { 'solution.js': ABD_SOLUTION } })).status, 'pass'));
for (const m of abdMutants) {
  test(`mutant killed: ${m.name}`, async () => {
    let code = ABD_SOLUTION;
    for (const [from, to] of m.edits) { assert.ok(code.includes(from), 'pattern not found: ' + from.slice(0, 50)); code = code.replace(from, to); }
    const r = await runLab(abd, { files: { 'solution.js': code } });
    assert.notEqual(r.status, 'pass', `SURVIVED: ${m.name}`);
    console.log(`  ✓ "${m.name}" caught: ${r.tests.filter((t) => !t.pass).map((t) => t.name).join(' | ').slice(0, 90)}`);
  });
}
