import http from 'k6/http';
import { check } from 'k6';

// Module-level token cache — one per VU (each VU has its own module scope)
let token = null;

const PASSWORD = 'PerfTest123!';

export function getToken(baseUrl) {
  if (token !== null) {
    return token;
  }

  const username = `user_perf_${__VU}`;

  // Register — 409 means user already exists from a prior run, that's fine
  const registerRes = http.post(
    `${baseUrl}/auth/register`,
    JSON.stringify({ username, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(registerRes, {
    'register: 201 or 409': (r) => r.status === 201 || r.status === 409,
  });

  // Login — always required (even after 409 on register)
  // NOTE: /auth/login requires application/x-www-form-urlencoded (FastAPI OAuth2PasswordRequestForm)
  const loginRes = http.post(
    `${baseUrl}/auth/login`,
    `username=${encodeURIComponent(username)}&password=${encodeURIComponent(PASSWORD)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: has access_token': (r) => r.json('access_token') !== undefined,
  });

  token = loginRes.json('access_token');
  return token;
}
