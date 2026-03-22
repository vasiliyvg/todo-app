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

beforeEach(() => mockFetch.mockClear());

describe('getTodos', () => {
  test('calls GET /todos and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [mockTodo] });
    const result = await getTodos();
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos');
    expect(result).toEqual([mockTodo]);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(getTodos()).rejects.toThrow('Failed to fetch todos');
  });
});

describe('addTodo', () => {
  test('calls POST /todos with correct body and headers and returns created todo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockTodo });
    const result = await addTodo('Test');
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });
    expect(result).toEqual(mockTodo);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(addTodo('Test')).rejects.toThrow('Failed to add todo');
  });
});

describe('updateTodo', () => {
  test('calls PUT /todos/{id} with correct body and returns updated todo', async () => {
    const updated = { ...mockTodo, completed: true };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => updated });
    const result = await updateTodo(1, { completed: true });
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    expect(result).toEqual(updated);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(updateTodo(1, { completed: true })).rejects.toThrow('Failed to update todo');
  });
});

describe('deleteTodo', () => {
  test('calls DELETE /todos/{id}', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteTodo(1);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos/1', { method: 'DELETE' });
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(deleteTodo(1)).rejects.toThrow('Failed to delete todo');
  });
});
