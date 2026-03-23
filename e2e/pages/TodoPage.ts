// e2e/pages/TodoPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class TodoPage {
  constructor(private page: Page) {}

  async addTodo(text: string, type: 'todo' | 'timeline' = 'todo') {
    await this.page.getByPlaceholder('Add a new task...').fill(text);
    // Select is always rendered; default is 'todo' — only change when needed
    if (type === 'timeline') {
      await this.page.getByRole('combobox').selectOption('timeline');
    }
    await this.page.getByRole('button', { name: 'Add' }).click();
    // Reset select back to 'todo' for next call (avoids state leaking between actions)
    if (type === 'timeline') {
      await this.page.getByRole('combobox').selectOption('todo');
    }
  }

  private todoRow(text: string): Locator {
    return this.page.locator('.todo-item').filter({ hasText: text });
  }

  async toggleTodo(text: string) {
    await this.todoRow(text).getByRole('checkbox').click();
  }

  async deleteTodo(text: string) {
    await this.todoRow(text).getByRole('button', { name: 'Delete' }).click();
  }

  async expectTodoVisible(text: string) {
    await expect(this.todoRow(text)).toBeVisible();
  }

  async expectTodoNotVisible(text: string) {
    await expect(this.todoRow(text)).not.toBeVisible();
  }

  async expectCompleted(text: string) {
    // The inline style 'text-decoration: line-through' is on the first child div of .todo-item
    await expect(
      this.todoRow(text).locator('> div:first-child'),
    ).toHaveCSS('text-decoration', /line-through/);
  }

  async switchToTimeline() {
    await this.page.getByRole('tab', { name: 'Timeline' }).click();
  }

  async expectTimelineTabVisible() {
    await expect(this.page.getByRole('tab', { name: 'Timeline' })).toBeVisible();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Logout' }).click();
  }
}
