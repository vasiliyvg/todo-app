import * as path from 'path';

export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

export const TEST_USER = {
  username: 'e2e-testuser',
  password: 'e2e-password-42',
};

export const BACKEND_URL = 'http://localhost:8000';
export const FRONTEND_URL = 'http://localhost:3000';
