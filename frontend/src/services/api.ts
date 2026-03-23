import { Todo } from '../types/todo';

const API_URL = 'http://127.0.0.1:8000';

const authHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
});

export const getTodos = async (token: string, onUnauthorized?: () => void): Promise<Todo[]> => {
  const response = await fetch(`${API_URL}/todos`, {
    headers: authHeaders(token),
  });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('Failed to fetch todos');
  }
  if (!response.ok) {
    throw new Error('Failed to fetch todos');
  }
  return await response.json();
};

export const addTodo = async (
  text: string,
  token: string,
  onUnauthorized?: () => void,
  type: string = 'todo',
): Promise<Todo> => {
  const response = await fetch(`${API_URL}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ title: text, type }),
  });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('Failed to add todo');
  }
  if (!response.ok) {
    throw new Error('Failed to add todo');
  }
  return await response.json();
};

export const updateTodo = async (
  id: number,
  updatedFields: Partial<Pick<Todo, 'title' | 'completed'>>,
  token: string,
  onUnauthorized?: () => void,
): Promise<Todo> => {
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(updatedFields),
  });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('Failed to update todo');
  }
  if (!response.ok) {
    throw new Error('Failed to update todo');
  }
  return await response.json();
};

export const deleteTodo = async (id: number, token: string, onUnauthorized?: () => void): Promise<void> => {
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('Failed to delete todo');
  }
  if (!response.ok) {
    throw new Error('Failed to delete todo');
  }
};
