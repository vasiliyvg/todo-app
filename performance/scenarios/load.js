import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const IS_CI = !!__ENV.CI;

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: [IS_CI ? 'p(95)<500' : 'p(95)<1000'],
    http_req_failed:   [IS_CI ? 'rate<0.01' : 'rate<0.05'],
    checks:            [IS_CI ? 'rate>0.99' : 'rate>0.95'],
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

  const todoId = createRes.json('id');

  const updateRes = client.put(`/todos/${todoId}`, { completed: true });
  check(updateRes, { 'PUT /todos/{id}: 200': (r) => r.status === 200 });

  const deleteRes = client.del(`/todos/${todoId}`);
  check(deleteRes, { 'DELETE /todos/{id}: 204': (r) => r.status === 204 });
}
