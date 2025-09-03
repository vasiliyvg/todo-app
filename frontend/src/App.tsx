import React, { useState, useEffect } from 'react';
import { Todo } from './types/todo';
import TodoList from './components/TodoList';
import TodoForm from './components/TodoForm';
import * as api from './services/api'; // Import the new API service
import TimelineComponent from './components/Timeline';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import './App.css';

const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      setLoading(true);
      const data = await api.getTodos();
      setTodos(data);
    } catch (err) {
      setError('Failed to fetch todos.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addTodo = async (text: string) => {
    try {
      const newTodo = await api.addTodo(text);
      setTodos((prevTodos) => [...prevTodos, newTodo]);
    } catch (err) {
      setError('Failed to add todo.');
      console.error(err);
    }
  };

  const toggleComplete = async (id: number) => {
    const todoToUpdate = todos.find(todo => todo.id === id);
    if (!todoToUpdate) return;

    const updatedTodo = { ...todoToUpdate, completed: !todoToUpdate.completed };
    
    try {
      await api.updateTodo(id, updatedTodo);
      setTodos((prevTodos) => 
        prevTodos.map((todo) => (todo.id === id ? updatedTodo : todo))
      );
    } catch (err) {
      setError('Failed to update todo.');
      console.error(err);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      await api.deleteTodo(id);
      setTodos((prevTodos) => prevTodos.filter((todo) => todo.id !== id));
    } catch (err) {
      setError('Failed to delete todo.');
      console.error(err);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div className="app-container">
      <Tabs>
        <TabList>
          <Tab>To-Do List</Tab>
          <Tab>Timeline</Tab>
        </TabList>

        <TabPanel>
          <h1>To-Do List</h1>
          <TodoForm addTodo={addTodo} />
          <TodoList
            todos={todos}
            toggleComplete={toggleComplete}
            deleteTodo={deleteTodo}
          />
        </TabPanel>
        <TabPanel>
          <TimelineComponent />
        </TabPanel>
      </Tabs>
    </div>
  );
};

export default App;