// e2e/tests/timeline.spec.ts
import { test, expect } from '../fixtures/auth.fixture';
import { TodoPage } from '../pages/TodoPage';
import { ApiFixture } from '../fixtures/api.fixture';
import { FRONTEND_URL } from '../test-constants';

const api = new ApiFixture();

test.describe('Timeline tab', () => {
  test.afterEach(async () => {
    await api.clearTodos();
  });

  test('Timeline tab is visible when feature flag is on', async ({ authenticatedPage }) => {
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);
    await todo.expectTimelineTabVisible();
  });

  test('timeline item appears in Timeline tab and not in To-Do tab', async ({ authenticatedPage }) => {
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.addTodo('Q3 milestone', 'timeline');

    // Item must NOT appear in To-Do tab (current tab)
    await todo.expectTodoNotVisible('Q3 milestone');

    // Item MUST appear in Timeline tab
    await todo.switchToTimeline();
    await expect(authenticatedPage.getByText('Q3 milestone')).toBeVisible();
  });
});
