import React from 'react';
import { Todo } from '../types/todo';

interface TodoItemProps
{
  todo: Todo;
  toggleComplete: (id: number) => void;
  deleteTodo: (id: number) => void;
}

const TodoItem: React.FC<TodoItemProps> = ({ todo, toggleComplete, deleteTodo }) =>
{
  return (
    <div>
      <div className="todo-item task-content">
        <div style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggleComplete(todo.id)}
          />
          <span className='task-text'>{todo.title}</span>
        </div>
        <button className='delete-btn delete' onClick={() => deleteTodo(todo.id)}>Delete</button>
      </div>
    </div>
  );
};

export default TodoItem;

