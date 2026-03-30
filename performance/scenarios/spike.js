import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// WARNING: This scenario targets 500 VUs. Do NOT run on a developer laptop.
// Use a server or CI environment with at least 8GB RAM and 4 CPUs.
export const options = {
  stages: [
    { duration: '10s', target: 0 },
    { duration: '20s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.20'],
    checks:          ['rate>0.80'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);
  const payload = todoPayload();

  const listRes = client.get('/todos');
  check(listRes, { 'GET /todos: 200 or 503': (r) => r.status === 200 || r.status === 503 });

  const createRes = client.post('/todos', payload);
  check(createRes, { 'POST /todos: 201 or 5xx': (r) => r.status === 201 || r.status >= 500 });

  if (createRes.status === 201) {
    const todoId = createRes.json('id');
    client.del(`/todos/${todoId}`); // cleanup is best-effort during spike; result not checked
  }
}
