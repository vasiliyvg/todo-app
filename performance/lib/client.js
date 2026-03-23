import http from 'k6/http';

export function makeClient(baseUrl, token) {
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
