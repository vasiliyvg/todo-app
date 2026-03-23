const API_URL = 'http://127.0.0.1:8000';

const extractDetail = (detail: any, fallback: string): string => {
  if (!detail) return fallback;
  if (Array.isArray(detail)) return detail.map((e: any) => e.msg).join(', ');
  return String(detail);
};

export const register = async (username: string, password: string): Promise<string> => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(extractDetail(error.detail, 'Registration failed'));
  }
  const data = await response.json();
  return data.access_token;
};

export const login = async (username: string, password: string): Promise<string> => {
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(extractDetail(error.detail, 'Login failed'));
  }
  const data = await response.json();
  return data.access_token;
};
