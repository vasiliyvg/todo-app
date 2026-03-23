import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import App from './App';
import * as api from './services/api';
import * as auth from './services/auth';
import { Todo } from './types/todo';
import '@testing-library/jest-dom';

jest.mock('./services/api');
jest.mock('./services/auth');

const mockTodos: Todo[] = [
  {
    id: 1,
    title: 'Test Todo',
    completed: false,
    created_at: '2024-08-31T12:00:00Z',
    updated_at: '2024-08-31T12:00:00Z',
    type: 'todo',
  },
];

// Helper: simulate login so todo UI is visible
const loginAndRender = async (todosResult: Todo[] = []) => {
  (auth.login as jest.Mock).mockResolvedValueOnce('test-token');
  (api.getTodos as jest.Mock).mockResolvedValueOnce(todosResult);
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!);
  });
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
};

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows AuthForm when not authenticated', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });

  test('shows Logout button after login', async () => {
    await loginAndRender([]);
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  test('returns to AuthForm after logout', async () => {
    await loginAndRender([]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /logout/i }));
    });
    expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });

  test('renders loading state', async () => {
    (auth.login as jest.Mock).mockResolvedValueOnce('test-token');
    let resolveTodos!: (value: Todo[]) => void;
    const deferredTodos = new Promise<Todo[]>((resolve) => { resolveTodos = resolve; });
    (api.getTodos as jest.Mock).mockReturnValueOnce(deferredTodos);
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!);
    });
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    await act(async () => { resolveTodos(mockTodos); });
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());
  });

  test('renders todos after fetch', async () => {
    await loginAndRender(mockTodos);
    expect(screen.getByText('Test Todo')).toBeInTheDocument();
  });

  test('shows error if fetchTodos fails', async () => {
    (auth.login as jest.Mock).mockResolvedValueOnce('test-token');
    (api.getTodos as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch todos/i)).toBeInTheDocument();
    });
  });

  test('adds a todo', async () => {
    (api.addTodo as jest.Mock).mockResolvedValueOnce({ ...mockTodos[0], id: 2, title: 'New Todo' });
    await loginAndRender([]);
    const input = screen.getByPlaceholderText(/Add a new task/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'New Todo' } });
      fireEvent.submit(input.closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText('New Todo')).toBeInTheDocument();
    });
  });

  test('toggles todo completion', async () => {
    (api.updateTodo as jest.Mock).mockResolvedValueOnce({ ...mockTodos[0], completed: true });
    await loginAndRender(mockTodos);
    const checkbox = screen.getByRole('checkbox');
    await act(async () => { fireEvent.click(checkbox); });
    await waitFor(() => { expect(api.updateTodo).toHaveBeenCalled(); });
  });

  test('deletes a todo', async () => {
    (api.deleteTodo as jest.Mock).mockResolvedValueOnce(undefined);
    await loginAndRender(mockTodos);
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await act(async () => { fireEvent.click(deleteButton); });
    await waitFor(() => {
      expect(api.deleteTodo).toHaveBeenCalled();
      expect(screen.queryByText('Test Todo')).not.toBeInTheDocument();
    });
  });

  test('shows error if addTodo fails', async () => {
    (api.addTodo as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    await loginAndRender([]);
    const input = screen.getByPlaceholderText(/Add a new task/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Fail Todo' } });
      fireEvent.submit(input.closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText(/Failed to add todo/i)).toBeInTheDocument();
    });
  });
});
