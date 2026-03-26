import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// NOTE: Requires ACCESS_TOKEN_EXPIRE_MINUTES >= 120 in the target environment.
// docker-compose.perf.yml sets this to 120. For external targets, verify before running.
export const options = {
  vus: 20,
  duration: '30m',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.01'],
    checks:            ['rate>0.99'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);
  const payload = todoPayload();

  const listRes = client.get('/todos');
  check(listRes, { 'GET /todos: 200': (r) => r.status === 200 });

  const createRes = client.post('/todos', payload);
  check(createRes, {
    'POST /todos: 201': (r) => r.status === 201,
    'POST /todos: has id': (r) => r.json('id') !== undefined,
  });

  if (createRes.status !== 201) {
    return;
  }

  // PUT omitted intentionally — soak tests reads/writes only to reduce write amplification over 30 minutes
  const todoId = createRes.json('id');

  const deleteRes = client.del(`/todos/${todoId}`);
  check(deleteRes, { 'DELETE /todos/{id}: 204': (r) => r.status === 204 });
}
