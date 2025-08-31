import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import * as api from './services/api';
import { Todo } from './types/todo';
import '@testing-library/jest-dom';

// Mock API service
jest.mock('./services/api');

const mockTodos: Todo[] = [
  {
    id: 1,
    title: 'Test Todo',
    completed: false,
    created_at: '2024-08-31T12:00:00Z',
    updated_at: '2024-08-31T12:00:00Z',
  },
];

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    render(<App />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());
  });

  test('renders todos after fetch', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Test Todo')).toBeInTheDocument();
    });
  });

  test('shows error if fetchTodos fails', async () => {
    (api.getTodos as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch todos/i)).toBeInTheDocument();
    });
  });

  test('adds a todo', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce([]);
    (api.addTodo as jest.Mock).mockResolvedValueOnce({
      ...mockTodos[0],
      id: 2,
      title: 'New Todo',
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());

    const input = screen.getByPlaceholderText(/Add a new task/i);
    fireEvent.change(input, { target: { value: 'New Todo' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('New Todo')).toBeInTheDocument();
    });
  });

  test('toggles todo completion', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    (api.updateTodo as jest.Mock).mockResolvedValueOnce({
      ...mockTodos[0],
      completed: true,
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Test Todo')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(api.updateTodo).toHaveBeenCalled();
    });
  });

  test('deletes a todo', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    (api.deleteTodo as jest.Mock).mockResolvedValueOnce(undefined);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Test Todo')).toBeInTheDocument());

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(api.deleteTodo).toHaveBeenCalledWith(1);
      expect(screen.queryByText('Test Todo')).not.toBeInTheDocument();
    });
  });

  test('shows error if addTodo fails', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce([]);
    (api.addTodo as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());

    const input = screen.getByPlaceholderText(/Add a new task/i);
    fireEvent.change(input, { target: { value: 'Fail Todo' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Failed to add todo/i)).toBeInTheDocument();
    });
  });
});