import { getTodos, addTodo, updateTodo, deleteTodo } from './api';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockTodo = {
  id: 1,
  title: 'Test',
  completed: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'todo',
};

const TOKEN = 'test-token';
const AUTH_HEADER = { Authorization: `Bearer ${TOKEN}` };

beforeEach(() => mockFetch.mockClear());

describe('getTodos', () => {
  test('calls GET /todos with Authorization header and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [mockTodo] });
    const result = await getTodos(TOKEN);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos', {
      headers: AUTH_HEADER,
    });
    expect(result).toEqual([mockTodo]);
  });

  test('calls onUnauthorized and throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const onUnauthorized = jest.fn();
    await expect(getTodos(TOKEN, onUnauthorized)).rejects.toThrow('Failed to fetch todos');
    expect(onUnauthorized).toHaveBeenCalled();
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getTodos(TOKEN)).rejects.toThrow('Failed to fetch todos');
  });
});

describe('addTodo', () => {
  test('calls POST /todos with Authorization header and returns created todo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => mockTodo });
    const result = await addTodo('Test', TOKEN);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ title: 'Test', type: 'todo' }),
    });
    expect(result).toEqual(mockTodo);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(addTodo('Test', TOKEN)).rejects.toThrow('Failed to add todo');
  });
});

describe('updateTodo', () => {
  test('calls PUT /todos/{id} with Authorization header and returns updated todo', async () => {
    const updated = { ...mockTodo, completed: true };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => updated });
    const result = await updateTodo(1, { completed: true }, TOKEN);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ completed: true }),
    });
    expect(result).toEqual(updated);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(updateTodo(1, { completed: true }, TOKEN)).rejects.toThrow('Failed to update todo');
  });
});

describe('deleteTodo', () => {
  test('calls DELETE /todos/{id} with Authorization header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await deleteTodo(1, TOKEN);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos/1', {
      method: 'DELETE',
      headers: AUTH_HEADER,
    });
  });

  test('calls onUnauthorized and throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const onUnauthorized = jest.fn();
    await expect(deleteTodo(1, TOKEN, onUnauthorized)).rejects.toThrow('Failed to delete todo');
    expect(onUnauthorized).toHaveBeenCalled();
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(deleteTodo(1, TOKEN)).rejects.toThrow('Failed to delete todo');
  });
});
