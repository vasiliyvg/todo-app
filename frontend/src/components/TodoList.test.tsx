import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoList from './TodoList';
import { Todo } from '../types/todo';

const makeTodo = (id: number, title: string): Todo => ({
  id,
  title,
  completed: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'todo',
});

describe('TodoList', () => {
  const toggleComplete = jest.fn();
  const deleteTodo = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders correct number of todo items', () => {
    const todos = [makeTodo(1, 'First'), makeTodo(2, 'Second'), makeTodo(3, 'Third')];
    render(<TodoList todos={todos} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  test('renders nothing when todos array is empty', () => {
    render(<TodoList todos={[]} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  test('passes callbacks to each item — verified by clicking first and second item', () => {
    const todos = [makeTodo(1, 'First'), makeTodo(2, 'Second')];
    render(<TodoList todos={todos} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(toggleComplete).toHaveBeenCalledWith(1);
    fireEvent.click(checkboxes[1]);
    expect(toggleComplete).toHaveBeenCalledWith(2);
  });
});
