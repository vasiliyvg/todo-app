import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const IS_CI = !!__ENV.CI;

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: [IS_CI ? 'p(95)<500' : 'p(95)<2000'],
    http_req_failed:   ['rate<0.10'],
    checks:            ['rate>0.90'],
  },
  // http_req_failed and checks are fixed — stress thresholds are intentionally lenient regardless of CI
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

  const todoId = createRes.json('id');

  const updateRes = client.put(`/todos/${todoId}`, { completed: true });
  check(updateRes, { 'PUT /todos/{id}: 200': (r) => r.status === 200 });

  const deleteRes = client.del(`/todos/${todoId}`);
  check(deleteRes, { 'DELETE /todos/{id}: 204': (r) => r.status === 204 });
}
