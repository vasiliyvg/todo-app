import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthForm from './AuthForm';
import * as auth from '../services/auth';

jest.mock('../services/auth');

describe('AuthForm', () => {
  const onAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders login mode by default', () => {
    render(<AuthForm onAuth={onAuth} />);
    expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('switches to register mode when toggle is clicked', () => {
    render(<AuthForm onAuth={onAuth} />);
    fireEvent.click(screen.getByRole('button', { name: /switch to register/i }));
    expect(screen.getByRole('heading', { name: /register/i })).toBeInTheDocument();
  });

  test('calls onAuth with token on successful login', async () => {
    (auth.login as jest.Mock).mockResolvedValueOnce('my-token');
    render(<AuthForm onAuth={onAuth} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!);
    });
    await waitFor(() => expect(onAuth).toHaveBeenCalledWith('my-token'));
  });

  test('shows error message on failed login', async () => {
    (auth.login as jest.Mock).mockRejectedValueOnce(new Error('Invalid credentials'));
    render(<AuthForm onAuth={onAuth} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrongpass' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!);
    });
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
    expect(onAuth).not.toHaveBeenCalled();
  });

  test('calls onAuth with token on successful register', async () => {
    (auth.register as jest.Mock).mockResolvedValueOnce('reg-token');
    render(<AuthForm onAuth={onAuth} />);
    fireEvent.click(screen.getByRole('button', { name: /switch to register/i }));
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /register/i }).closest('form')!);
    });
    await waitFor(() => expect(onAuth).toHaveBeenCalledWith('reg-token'));
  });
});
