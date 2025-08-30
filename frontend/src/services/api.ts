import { Todo } from '../types/todo';

// Replace with your FastAPI server's URL
const API_URL = 'http://127.0.0.1:8000';

export const getTodos = async (): Promise<Todo[]> => {
  const response = await fetch(`${API_URL}/todos`);
  if (!response.ok) {
    throw new Error('Failed to fetch todos');
  }
  return await response.json();
};

export const addTodo = async (text: string): Promise<Todo> => {
  const response = await fetch(`${API_URL}/todos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: text }),
  });
  if (!response.ok) {
    throw new Error('Failed to add todo');
  }
  return await response.json();
};

export const updateTodo = async (id: number, updatedFields: Partial<Pick<Todo, 'title' | 'completed'>>): Promise<Todo> => {
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedFields),
  });
  if (!response.ok) {
    throw new Error('Failed to update todo');
  }
  return await response.json();
};

export const deleteTodo = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete todo');
  }
};
