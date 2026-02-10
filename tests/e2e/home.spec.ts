import { expect, test } from "@playwright/test";

test("home matrix and watchlist admin page should render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Stock Close Matrix")).toBeVisible();
  await expect(page.getByRole("button", { name: "30D" })).toBeVisible();

  await page.getByRole("link", { name: "Watchlist Admin" }).click();
  await expect(page.getByText("Watchlist Manager")).toBeVisible();
});

