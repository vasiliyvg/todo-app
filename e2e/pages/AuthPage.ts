// e2e/pages/AuthPage.ts
import { Page, expect } from '@playwright/test';

export class AuthPage {
  constructor(private page: Page) {}

  async login(username: string, password: string) {
    await this.page.getByPlaceholder('Username').fill(username);
    await this.page.getByPlaceholder('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log In' }).click();
  }

  async register(username: string, password: string) {
    await this.page.getByRole('button', { name: 'Switch to Register' }).click();
    await this.page.getByPlaceholder('Username').fill(username);
    await this.page.getByPlaceholder('Password').fill(password);
    await this.page.getByRole('button', { name: 'Register' }).click();
  }

  async expectError(message: string) {
    await expect(this.page.locator('.auth-error')).toHaveText(message);
  }

  async expectTodoFormVisible() {
    await expect(this.page.getByPlaceholder('Add a new task...')).toBeVisible();
  }

  async expectAuthFormVisible() {
    await expect(this.page.getByPlaceholder('Username')).toBeVisible();
  }
}
