const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const TOKEN = process.env.API_TOKEN || 'recruitment-test-token';

const CONCURRENCY = Number(process.env.CONCURRENCY || 100);
const REQUESTS = Number(process.env.REQUESTS || 5000);

async function request(method, path, body) {
  const start = performance.now();

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    await response.arrayBuffer();

    return {
      latency: performance.now() - start,
      status: response.status
    };
  } catch (error) {
    return {
      latency: performance.now() - start,
      status: 0,
      error: error.message
    };
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1] || 0;
}

async function runScenario(name, operation, total = REQUESTS) {
  const results = [];
  let next = 0;

  const start = performance.now();

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;

      const result = await operation(index);
      results.push(result);
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );

  const duration = (performance.now() - start) / 1000;
  const latencies = results.map(r => r.latency);
  const successes = results.filter(r => r.status >= 200 && r.status < 300);
  const failures = results.length - successes.length;

  const report = {
    scenario: name,
    requests: results.length,
    concurrency: CONCURRENCY,
    duration_seconds: Number(duration.toFixed(2)),
    requests_per_second: Number((results.length / duration).toFixed(2)),
    successful: successes.length,
    failed: failures,
    p50_ms: Number(percentile(latencies, 0.50).toFixed(2)),
    p99_ms: Number(percentile(latencies, 0.99).toFixed(2)),
    status_codes: results.reduce((acc, r) => {
      const key = String(r.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  };

  console.log('\n' + JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const health = await request('GET', '/balance/loadtest-user');

  if (health.status !== 404 && health.status !== 200) {
    throw new Error(`API check failed: HTTP ${health.status}`);
  }

  const reports = [];

  // Many users: credit, debit and balance mix.
  reports.push(await runScenario('mixed', async i => {
    const userId = `u${String((i % 1000) + 1).padStart(6, '0')}`;
    const choice = i % 3;

    if (choice === 0) {
      return request('POST', '/credit', {
        user_id: userId,
        amount: 100
      });
    }

    if (choice === 1) {
      return request('POST', '/debit', {
        user_id: userId,
        amount: 1
      });
    }

    return request('GET', `/balance/${userId}`);
  }));

  // All clients write to the same wallet.
  await request('POST', '/credit', {
    user_id: 'loadtest-hot-user',
    amount: 100000000
  });

  reports.push(await runScenario('hot-user', async () => {
    return request('POST', '/credit', {
      user_id: 'loadtest-hot-user',
      amount: 100
    });
  }));

  const fs = await import('node:fs/promises');

  await fs.writeFile(
    'load-test/results.json',
    JSON.stringify({
      generated_at: new Date().toISOString(),
      base_url: BASE_URL,
      concurrency: CONCURRENCY,
      reports
    }, null, 2)
  );

  console.log('\nResults saved to load-test/results.json');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});