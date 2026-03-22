import React from 'react';
import { Todo } from '../types/todo';

interface TimelineProps {
  todos: Todo[];
}

const TimelineComponent: React.FC<TimelineProps> = ({ todos }) => {
  return (
    <div className="max-w-screen-md mx-auto py-8">
      {/* Vertical timeline container */}
      <div className="relative">
        {todos.map((todo, index) => (
          <div key={index} className="flex items-start mb-8">
            {/* Timeline marker */}
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <div className="w-3 h-3 bg-white rounded-full" />
            </div>
            {/* Event details */}
            <div className="ml-4">
              <h3 className="text-lg font-bold mb-1">{new Date(todo.created_at).toLocaleDateString()}</h3>
              <p className="text-sm text-gray-600">{todo.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimelineComponent;