import React, { useState } from 'react';

interface TodoFormProps {
  addTodo: (text: string, type: string) => void;
}

const TodoForm: React.FC<TodoFormProps> = ({ addTodo }) => {
  const [text, setText] = useState('');
  const [type, setType] = useState('todo');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      addTodo(text, type);
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a new task..."
      />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="todo">To-Do</option>
        <option value="timeline">Timeline</option>
      </select>
      <button type="submit">Add</button>
    </form>
  );
};

export default TodoForm;