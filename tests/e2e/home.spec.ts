import { expect, test } from "@playwright/test";

test("home should render watchlist validate as single entry page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("股票代码管理矩阵（实验页）")).toBeVisible();
  await expect(page.getByRole("button", { name: "导入并校验" })).toBeVisible();

  await page.goto("/admin/watchlist-validate");
  await expect(page.getByText("股票代码管理矩阵（实验页）")).toBeVisible();

  const response = await page.goto("/admin/watchlist");
  expect(response?.status()).toBe(404);
});
