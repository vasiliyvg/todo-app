import { check } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/grafana/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const IS_CI = !!__ENV.CI;

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: [IS_CI ? 'p(95)<500' : 'p(95)<1000'],
    http_req_failed:   [IS_CI ? 'rate<0.01' : 'rate<0.05'],
    checks:            [IS_CI ? 'rate>0.99' : 'rate>0.95'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);

  // GET /todos
  const listRes = client.get('/todos');
  check(listRes, {
    'GET /todos: status 200': (r) => r.status === 200,
    'GET /todos: returns array': (r) => Array.isArray(r.json()),
  });

  // POST /todos
  const payload = todoPayload();
  const createRes = client.post('/todos', payload);
  check(createRes, {
    'POST /todos: status 201': (r) => r.status === 201,
    'POST /todos: has id': (r) => r.json('id') !== undefined,
    'POST /todos: title matches': (r) => r.json('title') === payload.title,
    'POST /todos: completed is false': (r) => r.json('completed') === false,
  });

  if (createRes.status !== 201) {
    return;
  }

  const todoId = createRes.json('id');

  // PUT /todos/{id}
  const updateRes = client.put(`/todos/${todoId}`, { title: `${payload.title}-updated`, completed: true });
  check(updateRes, {
    'PUT /todos/{id}: status 200': (r) => r.status === 200,
    'PUT /todos/{id}: completed is true': (r) => r.json('completed') === true,
    'PUT /todos/{id}: title updated': (r) => r.json('title') === `${payload.title}-updated`,
  });

  // DELETE /todos/{id}
  const deleteRes = client.del(`/todos/${todoId}`);
  check(deleteRes, {
    'DELETE /todos/{id}: status 204': (r) => r.status === 204,
  });
}

export function handleSummary(data) {
  return {
    'reports/smoke-summary.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
