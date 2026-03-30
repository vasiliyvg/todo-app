export function todoPayload() {
  // __VU and __ITER are k6 built-ins: VU ID (1-indexed) and iteration (0-indexed)
  return {
    title: `perf-todo-vu${__VU}-iter${__ITER}`,
    type: 'todo',
  };
}
