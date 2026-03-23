import http from 'k6/http';

export function makeClient(baseUrl, token) {
  if (token === null || token === undefined) {
    // Auth failed for this VU — return a no-op client so scenario can continue
    // and k6 checks will record failures naturally
    const noop = () => ({ status: 0, json: () => null });
    return { get: noop, post: noop, put: noop, del: noop };
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return {
    get: (path) =>
      http.get(`${baseUrl}${path}`, { headers }),

    post: (path, body) =>
      http.post(`${baseUrl}${path}`, JSON.stringify(body), { headers }),

    put: (path, body) =>
      http.put(`${baseUrl}${path}`, JSON.stringify(body), { headers }),

    del: (path) =>
      http.del(`${baseUrl}${path}`, null, { headers }),
  };
}
