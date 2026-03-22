import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoForm from './TodoForm';

describe('TodoForm', () => {
  const addTodo = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders text input and type selector', () => {
    render(<TodoForm addTodo={addTodo} />);
    expect(screen.getByPlaceholderText(/Add a new task/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('calls addTodo with entered text and selected type on submit', () => {
    render(<TodoForm addTodo={addTodo} />);
    fireEvent.change(screen.getByPlaceholderText(/Add a new task/i), { target: { value: 'Buy bread' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'timeline' } });
    fireEvent.submit(screen.getByRole('button', { name: /add/i }).closest('form')!);
    expect(addTodo).toHaveBeenCalledWith('Buy bread', 'timeline');
  });

  test('clears text input after successful submission', () => {
    render(<TodoForm addTodo={addTodo} />);
    const input = screen.getByPlaceholderText(/Add a new task/i);
    fireEvent.change(input, { target: { value: 'Buy bread' } });
    fireEvent.submit(input.closest('form')!);
    expect(input).toHaveValue('');
  });

  test('does not call addTodo when text input is empty', () => {
    render(<TodoForm addTodo={addTodo} />);
    fireEvent.submit(screen.getByPlaceholderText(/Add a new task/i).closest('form')!);
    expect(addTodo).not.toHaveBeenCalled();
  });
});
