const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const TOKEN = process.env.API_TOKEN || 'recruitment-test-token';

async function call(method, path, body, token = TOKEN) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// Runs `count` jobs with at most `limit` in flight at the same time.
async function runAll(count, limit, fn) {
  const results = new Array(count);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < count) {
        const i = next++;
        results[i] = await fn(i);
      }
    })
  );
  return results;
}

test('auth: every endpoint rejects missing, wrong and non-Bearer tokens with 401', async () => {
  const requests = [
    ['POST', '/credit', { user_id: 'a', amount: 1 }],
    ['POST', '/debit', { user_id: 'a', amount: 1 }],
    ['GET', '/balance/a', undefined]
  ];
  for (const [method, path, body] of requests) {
    assert.equal((await call(method, path, body, null)).status, 401);
    assert.equal((await call(method, path, body, 'wrong-token')).status, 401);
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'unauthorized');
  }
});

test('contract: credit creates the user, debit and balance work, extra fields are ignored', async () => {
  const u = uid('c');
  assert.deepEqual((await call('GET', `/balance/${u}`)).status, 404);
  assert.deepEqual((await call('POST', '/debit', { user_id: u, amount: 1 })).status, 404);

  const c = await call('POST', '/credit', { user_id: u, amount: 10000, note: 'ignored' });
  assert.equal(c.status, 200);
  assert.deepEqual(c.body, { user_id: u, balance: 10000 });

  const d = await call('POST', '/debit', { user_id: u, amount: 4000 });
  assert.deepEqual(d.body, { user_id: u, balance: 6000 });

  const tooMuch = await call('POST', '/debit', { user_id: u, amount: 6001 });
  assert.equal(tooMuch.status, 409);
  assert.equal(tooMuch.body.error, 'insufficient_funds');

  const exact = await call('POST', '/debit', { user_id: u, amount: 6000 });
  assert.deepEqual(exact.body, { user_id: u, balance: 0 });

  assert.deepEqual((await call('GET', `/balance/${u}`)).body, { user_id: u, balance: 0 });
});

test('validation: bad input gives 400 invalid_request and changes nothing', async () => {
  const u = uid('v');
  await call('POST', '/credit', { user_id: u, amount: 100 });
  const bad = [
    { user_id: u, amount: 0 },
    { user_id: u, amount: -1 },
    { user_id: u, amount: 1.5 },
    { user_id: u, amount: '10' },
    { user_id: u, amount: 1000000001 },
    { user_id: u },
    { amount: 10 },
    { user_id: '', amount: 10 },
    { user_id: 'has space', amount: 10 },
    { user_id: 'x'.repeat(65), amount: 10 },
    { user_id: 123, amount: 10 },
    '{not json',
    '[]'
  ];
  for (const body of bad) {
    for (const path of ['/credit', '/debit']) {
      const r = await call('POST', path, body);
      assert.equal(r.status, 400, `${path} ${JSON.stringify(body)}`);
      assert.equal(r.body.error, 'invalid_request');
    }
  }
  assert.equal((await call('GET', '/balance/bad!id')).status, 400);
  assert.equal((await call('GET', `/balance/${u}`)).body.balance, 100);
});

test('race: two concurrent debits of 60 against 100 give exactly one 200 and one 409', async () => {
  for (let round = 0; round < 25; round++) {
    const u = uid('r');
    await call('POST', '/credit', { user_id: u, amount: 100 });
    const res = await Promise.all([
      call('POST', '/debit', { user_id: u, amount: 60 }),
      call('POST', '/debit', { user_id: u, amount: 60 })
    ]);
    assert.deepEqual(res.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await call('GET', `/balance/${u}`)).body.balance, 40);
  }
});

test('no lost updates: 1,000 concurrent credits of 100 raise the balance by exactly 100,000', async () => {
  const u = uid('l');
  const res = await runAll(1000, 100, () => call('POST', '/credit', { user_id: u, amount: 100 }));
  assert.ok(res.every((r) => r.status === 200), 'every credit must return 200');
  assert.equal((await call('GET', `/balance/${u}`)).body.balance, 100000);
});

test('hot user: 500 concurrent debits of 300 against 100,000 never overdraw', async () => {
  const u = uid('h');
  await call('POST', '/credit', { user_id: u, amount: 100000 });
  const res = await runAll(500, 100, () => call('POST', '/debit', { user_id: u, amount: 300 }));
  const ok = res.filter((r) => r.status === 200).length;
  const rejected = res.filter((r) => r.status === 409).length;
  assert.equal(ok + rejected, 500, 'only 200 or 409 may happen');
  assert.equal(ok, 333);
  assert.equal((await call('GET', `/balance/${u}`)).body.balance, 100000 - 333 * 300);
});

test('many users at once: concurrent credits and debits on different users are all correct', async () => {
  const users = Array.from({ length: 200 }, () => uid('m'));
  const credits = await runAll(200, 100, (i) => call('POST', '/credit', { user_id: users[i], amount: 500 }));
  assert.ok(credits.every((r) => r.status === 200));
  const debits = await runAll(200, 100, (i) => call('POST', '/debit', { user_id: users[i], amount: 200 }));
  assert.ok(debits.every((r) => r.status === 200 && r.body.balance === 300));
});

test('read-your-writes: balance right after credit/debit reflects it', async () => {
  const u = uid('w');
  let expected = 0;
  for (let i = 0; i < 50; i++) {
    const r = await call('POST', '/credit', { user_id: u, amount: 7 });
    expected += 7;
    assert.equal(r.body.balance, expected);
    assert.equal((await call('GET', `/balance/${u}`)).body.balance, expected);
  }
});