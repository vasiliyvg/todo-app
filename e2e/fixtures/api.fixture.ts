// e2e/fixtures/api.fixture.ts
import { TEST_USER, BACKEND_URL } from '../test-constants';

interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  type: string;
}

export class ApiFixture {
  private token: string | null = null;

  private async getToken(): Promise<string> {
    if (this.token) return this.token;

    // /auth/login requires application/x-www-form-urlencoded (FastAPI OAuth2PasswordRequestForm)
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: TEST_USER.username,
        password: TEST_USER.password,
      }),
    });
    if (!res.ok) throw new Error(`ApiFixture login failed: ${res.status}`);
    const data = await res.json();
    this.token = data.access_token;
    return this.token!;
  }

  async createTodo(title: string, type: 'todo' | 'timeline' = 'todo'): Promise<TodoItem> {
    const token = await this.getToken();
    const res = await fetch(`${BACKEND_URL}/todos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, type }),
    });
    if (!res.ok) throw new Error(`createTodo failed: ${res.status}`);
    return res.json();
  }

  async clearTodos(): Promise<void> {
    const token = await this.getToken();
    // No bulk-delete endpoint — must list then delete individually
    const res = await fetch(`${BACKEND_URL}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`clearTodos list failed: ${res.status}`);
    const todos: TodoItem[] = await res.json();
    for (const todo of todos) {
      const deleteRes = await fetch(`${BACKEND_URL}/todos/${todo.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!deleteRes.ok && deleteRes.status !== 404) {
        throw new Error(`clearTodos delete ${todo.id} failed: ${deleteRes.status}`);
      }
    }
  }

  /**
   * Registers a new user and returns their JWT token.
   * Note: this token belongs to the new user, NOT to TEST_USER.
   * ApiFixture.createTodo/clearTodos continue to use TEST_USER's token.
   */
  async registerUser(username: string, password: string): Promise<string> {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(`registerUser failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
  }
}
