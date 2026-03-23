// e2e/tests/todos.spec.ts
import { test, expect } from '../fixtures/auth.fixture';
import { TodoPage } from '../pages/TodoPage';
import { ApiFixture } from '../fixtures/api.fixture';
import { FRONTEND_URL } from '../test-constants';

const api = new ApiFixture();

test.describe('Todo CRUD', () => {
  test.afterEach(async () => {
    await api.clearTodos();
  });

  test('@smoke add a todo and see it in the list', async ({ authenticatedPage }) => {
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.addTodo('Buy milk');
    await todo.expectTodoVisible('Buy milk');
  });

  test('@smoke complete a todo — checkbox checked and text struck through', async ({ authenticatedPage }) => {
    await api.createTodo('Read a book');
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.toggleTodo('Read a book');
    await todo.expectCompleted('Read a book');
  });

  test('@smoke delete a todo — removed from list', async ({ authenticatedPage }) => {
    await api.createTodo('Take out trash');
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.deleteTodo('Take out trash');
    await todo.expectTodoNotVisible('Take out trash');
  });

  test('delete one todo while others remain', async ({ authenticatedPage }) => {
    await api.createTodo('Task A');
    await api.createTodo('Task B');
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.deleteTodo('Task A');
    await todo.expectTodoNotVisible('Task A');
    await todo.expectTodoVisible('Task B');
  });

  test('User A todos are not visible to User B', async ({ browser }) => {
    // User A already has todos (seeded via API)
    await api.createTodo('User A secret todo');

    // Register User B (unique username per run)
    const runId = Date.now();
    await api.registerUser(`user-b-${runId}`, 'passwordB');

    // Log in as User B via a fresh browser context (no storageState)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await pageB.goto(FRONTEND_URL);
    await pageB.getByPlaceholder('Username').fill(`user-b-${runId}`);
    await pageB.getByPlaceholder('Password').fill('passwordB');
    await pageB.getByRole('button', { name: 'Log In' }).click();
    await pageB.getByPlaceholder('Add a new task...').waitFor();

    // User A's todo must not appear in User B's view
    await expect(pageB.locator('.todo-item')).toHaveCount(0);

    await contextB.close();
  });
});
