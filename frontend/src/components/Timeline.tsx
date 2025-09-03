import React from 'react';

// Example data for the vertical timeline
const events = [
  { year: '2022', month: 'January', description: 'Started a new project' },
  { year: '2022', month: 'May', description: 'Launched version 1.0' },
  { year: '2023', month: 'February', description: 'Reached 10,000 users' },
  // Add more events as needed
];

function VerticalTimeline() {
  return (
    <div className="max-w-screen-md mx-auto py-8">
      {/* Vertical timeline container */}
      <div className="relative">
        {events.map((event, index) => (
          <div key={index} className="flex items-start mb-8">
            {/* Timeline marker */}
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold">{event.month}</span>
            </div>
            {/* Event details */}
            <div className="ml-4">
              <h3 className="text-lg font-bold mb-1">{event.year}</h3>
              <p className="text-gray-600">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VerticalTimeline;