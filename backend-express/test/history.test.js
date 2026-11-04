const test = require('node:test');
const assert = require('node:assert/strict');
const { badgeHistory, historyCsv } = require('../src/history');

function workout(id, weightKg, reps, extra = {}) {
  return { id, name: `Workout ${id}`, startedAt: `2026-01-0${id}T09:00:00.000Z`,
    completedAt: `2026-01-0${id}T10:00:00.000Z`, notes: '', exercises: [{ id, exerciseId: 'bench',
      exerciseName: 'Bench', sets: [{ id, setNumber: 1, completed: true, setType: 'working', weightKg, reps, ...extra }] }] };
}
test('PRs break prior records, ties/warmups/unfinished sets do not, edits recalculate', () => {
  const source = [workout(4, 100, 3, { setType: 'warmup' }), workout(2, 60, 5), workout(1, 60, 5), workout(3, 60, 8)];
  const result = badgeHistory(source);
  assert.deepEqual(result[2].exercises[0].sets[0].personalRecords, ['load', 'estimated1rm']);
  assert.deepEqual(result[1].exercises[0].sets[0].personalRecords, []);
  assert.deepEqual(result[3].exercises[0].sets[0].personalRecords, ['estimated1rm']);
  assert.deepEqual(result[0].exercises[0].sets[0].personalRecords, []);
  assert.equal(source[2].exercises[0].sets[0].personalRecords, undefined);
  source[2].exercises[0].sets[0].weightKg = 80;
  assert.deepEqual(badgeHistory(source)[3].exercises[0].sets[0].personalRecords, []);
  const unfinished = workout(5, 200, 1); unfinished.completedAt = null;
  assert.deepEqual(badgeHistory([unfinished])[0].exercises[0].sets[0].personalRecords, []);
});
test('CSV quotes commas/quotes/newlines, neutralizes formulas, includes units and empty sessions', () => {
  const row = workout(1, 60, 5); row.name = '=SUM(1,2)'; row.notes = 'Said "hello",\nnext line';
  const csv = historyCsv(badgeHistory([row, { ...workout(2, 0, 0), exercises: [] }]));
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv, /weight_kg/);
  assert.match(csv, /"'=SUM\(1,2\)"/);
  assert.match(csv, /Said ""hello"",\nnext line/);
  assert.match(csv, /Workout 2/);
  assert.match(csv, /load;estimated1rm/);
});

test('the same starter movement across plan days shares records, and warmups/high reps cannot create 1RM badges', () => {
  const first = workout(1, 60, 5);
  const repeat = workout(2, 60, 5);
  first.exercises[0].exerciseId = 'custom-plan-11';
  repeat.exercises[0].exerciseId = 'custom-plan-24';
  assert.deepEqual(badgeHistory([first, repeat])[1].exercises[0].sets[0].personalRecords, []);
  const highReps = workout(3, 80, 15);
  highReps.exercises[0].exerciseId = 'custom-plan-24';
  assert.deepEqual(badgeHistory([first, highReps])[1].exercises[0].sets[0].personalRecords, ['load']);
  const singleRep = workout(4, 70, 1);
  assert.deepEqual(badgeHistory([workout(1, 60, 10), singleRep])[1].exercises[0].sets[0].personalRecords, ['load']);
});

test('explicit bodyweight, timed and distance sets earn chronological records; ties, warmups and edits recalculate', () => {
  const first = workout(1, 0, 12, { durationSeconds: 30, distanceMeters: 100 });
  const tie = workout(2, 0, 12, { durationSeconds: 30, distanceMeters: 100 });
  const improved = workout(3, 0, 16, { durationSeconds: 45, distanceMeters: 150 });
  const warmup = workout(4, 0, 99, { durationSeconds: 999, distanceMeters: 999, setType: 'warmup' });
  const result = badgeHistory([improved, tie, warmup, first]);
  assert.deepEqual(result[3].exercises[0].sets[0].personalRecords, ['bodyweightReps', 'duration', 'distance']);
  assert.deepEqual(result[1].exercises[0].sets[0].personalRecords, []);
  assert.deepEqual(result[0].exercises[0].sets[0].personalRecords, ['bodyweightReps', 'duration', 'distance']);
  assert.deepEqual(result[2].exercises[0].sets[0].personalRecords, []);
  first.exercises[0].sets[0].reps = 20;
  assert.deepEqual(badgeHistory([first, improved])[1].exercises[0].sets[0].personalRecords, ['duration', 'distance']);
  const unspecified = workout(5, null, 100);
  assert.deepEqual(badgeHistory([unspecified])[0].exercises[0].sets[0].personalRecords, []);
  assert.match(historyCsv(result), /bodyweightReps;duration;distance/);
});
