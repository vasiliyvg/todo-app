import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoItem from './TodoItem';
import { Todo } from '../types/todo';

const mockTodo: Todo = {
  id: 1,
  title: 'Buy milk',
  completed: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'todo',
};

describe('TodoItem', () => {
  const toggleComplete = jest.fn();
  const deleteTodo = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders todo title', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  test('renders checkbox as unchecked when todo is not completed', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('renders checkbox as checked when todo is completed', () => {
    render(<TodoItem todo={{ ...mockTodo, completed: true }} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('applies line-through style when todo is completed', () => {
    render(<TodoItem todo={{ ...mockTodo, completed: true }} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    // The div wrapping the checkbox and span has the style applied
    const styledDiv = screen.getByText('Buy milk').parentElement;
    expect(styledDiv).toHaveStyle('text-decoration: line-through');
  });

  test('calls toggleComplete with todo id when checkbox is clicked', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(toggleComplete).toHaveBeenCalledWith(1);
  });

  test('calls deleteTodo with todo id when delete button is clicked', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(deleteTodo).toHaveBeenCalledWith(1);
  });
});
