const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const TOKEN = process.env.API_TOKEN || 'recruitment-test-token';
const CONCURRENCY = Number(process.env.CONCURRENCY || 100);
const REQUESTS = Number(process.env.REQUESTS || 10000);
const USERS = Number(process.env.USERS || 100000);
const OUT_FILE = process.env.OUT_FILE || 'load-test/results.json';

const EXPECTED = new Set([400, 401, 404, 409]);

async function request(label, method, path, body) {
  const start = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    await response.arrayBuffer();
    return { label, latency: performance.now() - start, status: response.status };
  } catch (error) {
    return { label, latency: performance.now() - start, status: 0, error: error.message };
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1] || 0;
}

function summarize(results) {
  const latencies = results.map(r => r.latency);
  const ok = results.filter(r => r.status >= 200 && r.status < 300).length;
  const expected = results.filter(r => EXPECTED.has(r.status)).length;
  const statusCodes = {};
  for (const r of results) statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
  return {
    requests: results.length,
    success_2xx: ok,
    expected_errors: expected,
    unexpected_failures: results.length - ok - expected,
    p50_ms: Number(percentile(latencies, 0.5).toFixed(2)),
    p99_ms: Number(percentile(latencies, 0.99).toFixed(2)),
    status_codes: statusCodes
  };
}

async function runScenario(name, operation, total = REQUESTS) {
  const results = [];
  let next = 0;
  const start = performance.now();

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;
      results.push(await operation(index));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const duration = (performance.now() - start) / 1000;

  const byEndpoint = {};
  for (const label of [...new Set(results.map(r => r.label))]) {
    byEndpoint[label] = summarize(results.filter(r => r.label === label));
  }

  const report = {
    scenario: name,
    concurrency: CONCURRENCY,
    duration_seconds: Number(duration.toFixed(2)),
    requests_per_second: Number((results.length / duration).toFixed(2)),
    overall: summarize(results),
    per_endpoint: byEndpoint
  };
  console.log('\n' + JSON.stringify(report, null, 2));
  return report;
}

const randomUser = () => `u${String(Math.floor(Math.random() * USERS) + 1).padStart(6, '0')}`;

async function main() {
  const health = await request('check', 'GET', '/balance/u000001');
  if (health.status !== 200 && health.status !== 404) {
    throw new Error(`API check failed: HTTP ${health.status}`);
  }

  const reports = [];

  reports.push(await runScenario('mixed', async i => {
    const userId = randomUser();
    const choice = i % 3;
    if (choice === 0) return request('credit', 'POST', '/credit', { user_id: userId, amount: 100 });
    if (choice === 1) return request('debit', 'POST', '/debit', { user_id: userId, amount: 1 });
    return request('balance', 'GET', `/balance/${userId}`);
  }));

  await request('setup', 'POST', '/credit', { user_id: 'loadtest-hot-user', amount: 100000000 });

  reports.push(await runScenario('hot-user', async i => {
    const choice = i % 3;
    if (choice === 0) return request('credit', 'POST', '/credit', { user_id: 'loadtest-hot-user', amount: 100 });
    if (choice === 1) return request('debit', 'POST', '/debit', { user_id: 'loadtest-hot-user', amount: 1 });
    return request('balance', 'GET', '/balance/loadtest-hot-user');
  }));

  const fs = await import('node:fs/promises');
  await fs.writeFile(OUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    concurrency: CONCURRENCY,
    ledger_rows_note: 'measured against the main database (10M+ ledger rows)',
    reports
  }, null, 2));
  console.log(`\nResults saved to ${OUT_FILE}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });