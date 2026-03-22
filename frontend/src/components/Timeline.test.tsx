import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimelineComponent from './Timeline';
import { Todo } from '../types/todo';

const makeTodo = (id: number, title: string): Todo => ({
  id,
  title,
  completed: false,
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  type: 'timeline',
});

describe('TimelineComponent', () => {
  test('renders without crashing with an empty todos array', () => {
    const { container } = render(<TimelineComponent todos={[]} />);
    expect(container).toBeInTheDocument();
  });

  test('renders correct number of timeline entries for each todo in the passed array', () => {
    const todos = [makeTodo(1, 'Event A'), makeTodo(2, 'Event B'), makeTodo(3, 'Event C')];
    render(<TimelineComponent todos={todos} />);
    // Each entry renders the title once (below the date in the content area)
    // Use selector: 'p' to avoid matching parent elements with the same text content
    expect(screen.getAllByText(/Event [ABC]/, { selector: 'p' })).toHaveLength(3);
  });

  test('renders todo titles in the timeline', () => {
    render(<TimelineComponent todos={[makeTodo(1, 'Release v1.0')]} />);
    expect(screen.getByText('Release v1.0')).toBeInTheDocument();
  });
});
