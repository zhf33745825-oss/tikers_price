import { expect, test } from "@playwright/test";

test("query page and watchlist admin page should render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("历史收盘价查询")).toBeVisible();

  await page.getByRole("link", { name: "清单管理" }).click();
  await expect(page.getByText("自动更新股票清单")).toBeVisible();
});

