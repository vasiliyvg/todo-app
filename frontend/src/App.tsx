import React, { useState, useEffect } from 'react';
import { Todo } from './types/todo';
import TodoList from './components/TodoList';
import TodoForm from './components/TodoForm';
import AuthForm from './components/AuthForm';
import * as api from './services/api';
import TimelineComponent from './components/Timeline';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import './App.css';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = () => setToken(null);

  useEffect(() => {
    if (token) fetchTodos();
  }, [token]);

  const fetchTodos = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await api.getTodos(token, handleUnauthorized);
      setTodos(data);
    } catch (err) {
      setError('Failed to fetch todos.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addTodo = async (text: string) => {
    if (!token) return;
    try {
      const newTodo = await api.addTodo(text, token, handleUnauthorized);
      setTodos((prevTodos) => [...prevTodos, newTodo]);
    } catch (err) {
      setError('Failed to add todo.');
      console.error(err);
    }
  };

  const toggleComplete = async (id: number) => {
    if (!token) return;
    const todoToUpdate = todos.find(todo => todo.id === id);
    if (!todoToUpdate) return;
    const updatedTodo = { ...todoToUpdate, completed: !todoToUpdate.completed };
    try {
      await api.updateTodo(id, updatedTodo, token, handleUnauthorized);
      setTodos((prevTodos) =>
        prevTodos.map((todo) => (todo.id === id ? updatedTodo : todo))
      );
    } catch (err) {
      setError('Failed to update todo.');
      console.error(err);
    }
  };

  const deleteTodo = async (id: number) => {
    if (!token) return;
    try {
      await api.deleteTodo(id, token, handleUnauthorized);
      setTodos((prevTodos) => prevTodos.filter((todo) => todo.id !== id));
    } catch (err) {
      setError('Failed to delete todo.');
      console.error(err);
    }
  };

  if (!token) {
    return <AuthForm onAuth={setToken} />;
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  const timelineEnabled = process.env.REACT_APP_TIMELINE_FEATURE_FLAG === 'true';
  const todoItems = todos.filter(todo => todo.type === 'todo');
  const timelineItems = todos.filter(todo => todo.type === 'timeline');

  return (
    <div className="app-container">
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0 4px' }}>
        <button className="logout-btn" onClick={() => setToken(null)}>Logout</button>
      </div>
      <Tabs>
        <TabList>
          <Tab>To-Do List</Tab>
          {timelineEnabled && <Tab>Timeline</Tab>}
        </TabList>
        <TabPanel>
          <TodoForm addTodo={addTodo} />
          <TodoList
            todos={todoItems}
            toggleComplete={toggleComplete}
            deleteTodo={deleteTodo}
          />
        </TabPanel>
        {timelineEnabled && (
          <TabPanel>
            <TimelineComponent todos={timelineItems} />
          </TabPanel>
        )}
      </Tabs>
    </div>
  );
};

export default App;
