import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { bootstrapPassword, stack } from "./stack";

// One fresh stack, in order: the bootstrap password works once, and the
// user the administrator creates signs in afterwards.
test.describe.configure({ mode: "serial" });

const newPassword = () => `e2e-${randomBytes(12).toString("base64url")}`;

const admin = { email: stack.adminEmail, password: newPassword() };
const member = { name: "E2E Member", email: "e2e-member@example.com", temporary: "", password: newPassword() };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** A temporary password leads to /password and nowhere else until it is replaced. */
async function replaceTemporaryPassword(page: Page, password: string) {
  await expect(page).toHaveURL(/\/password$/);
  await expect(page.getByText("You signed in with a temporary password")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/password$/);

  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Repeat the new password").fill(password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "API keys", level: 1 })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
}

test("the bootstrap administrator signs in and must change the temporary password", async ({ page }) => {
  await signIn(page, admin.email, bootstrapPassword());
  await replaceTemporaryPassword(page, admin.password);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" })).toBeVisible();
});

test("a key is shown once, works on the proxied API, and stops working when revoked", async ({ page, request }) => {
  await signIn(page, admin.email, admin.password);
  await expect(page.getByRole("heading", { name: "API keys", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Issue a key" }).click();
  const form = page.getByRole("dialog", { name: "Issue a key" });
  await form.getByLabel("Label").fill("e2e laptop");
  await form.getByRole("button", { name: "Issue", exact: true }).click();

  const issued = page.getByRole("dialog", { name: "Your new key" });
  const secret = (await issued.getByRole("textbox", { name: "Key “e2e laptop”" }).textContent())?.trim() ?? "";
  expect(secret).not.toBe("");
  await expect(issued.getByText("Save it now: it will not be shown again.")).toBeVisible();
  await issued.getByRole("button", { name: "Done" }).click();
  await expect(issued).toBeHidden();
  await expect(page.getByText(secret)).toHaveCount(0);

  const row = page.getByRole("row", { name: /e2e laptop/ });
  await expect(row.getByText("Active")).toBeVisible();
  const models = () => request.get(`${stack.apiURL}/v1/models`, { headers: { Authorization: `Bearer ${secret}` } });
  expect((await models()).status()).toBe(200);

  await row.getByRole("button", { name: "Revoke key “e2e laptop”" }).click();
  const confirm = page.getByRole("dialog", { name: "Revoke key “e2e laptop”?" });
  // A destructive confirmation opens on the safe choice.
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(row.getByText("Revoked")).toBeVisible();
  expect((await models()).status()).toBe(401);
});

test("the administrator creates a user and sets its access with the live preview", async ({ page }) => {
  await signIn(page, admin.email, admin.password);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  await page.getByRole("button", { name: "Create user", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Create user" });
  await form.getByLabel("Name").fill(member.name);
  await form.getByLabel("Email").fill(member.email);
  await form.getByRole("button", { name: "Create user", exact: true }).click();

  const created = page.getByRole("dialog", { name: `“${member.name}” created` });
  member.temporary = (await created.getByRole("textbox", { name: "Temporary password" }).textContent())?.trim() ?? "";
  expect(member.temporary).not.toBe("");
  await created.getByRole("link", { name: "Open the account" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/);
  await expect(page.getByText(member.temporary)).toHaveCount(0);

  // A new account may use nothing, and the preview says so.
  const preview = page.getByRole("region", { name: "Covered models" });
  await expect(preview.getByText("No model of today's catalogue is covered.")).toBeVisible();

  // The preview follows typing: a half-written rule is refused inline...
  await page.getByRole("button", { name: "Add rule" }).click();
  const provider = page.getByLabel("Provider, rule 1");
  const pattern = page.getByLabel("Model pattern, rule 1");
  await provider.fill("claude");
  await expect(pattern).toHaveAccessibleDescription(/This rule is not valid\./);

  // ...and the finished one is asked about and accepted. Without a vendor account
  // the catalogue is empty, so what it covers today can only be nothing.
  const asked = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/policy/preview") &&
      response.request().postDataJSON()?.rules?.[0] === "claude:*",
  );
  await pattern.fill("*");
  const answer = await (await asked).json();
  expect(answer.errors).toEqual([]);
  await expect(pattern).not.toHaveAccessibleDescription(/This rule is not valid\./);
  const covered = preview.getByRole("list", { name: "Models covered today" }).getByRole("listitem");
  if (answer.covered.length === 0) {
    await expect(preview.getByText("No model of today's catalogue is covered.")).toBeVisible();
  } else {
    await expect(covered).toHaveCount(answer.covered.length);
    await expect(covered.filter({ hasNotText: /^claude:/ })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByText("Policy saved. It applies from the user's next request.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Provider, rule 1")).toHaveValue("claude");
  await expect(page.getByLabel("Model pattern, rule 1")).toHaveValue("*");

  await signOut(page);
});

test("the new user changes the temporary password and sees no administration", async ({ page }) => {
  await signIn(page, member.email, member.temporary);
  await replaceTemporaryPassword(page, member.password);

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Connect" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Not found", level: 1 })).toBeVisible();

  await signOut(page);
});
