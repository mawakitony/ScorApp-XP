import { expect, test } from "@playwright/test"
import { e2eDatabaseAllowed } from "../../lib/env"

const ready = Boolean(process.env.E2E_BASE_URL) && e2eDatabaseAllowed()

test.describe("smoke", () => {
  test.skip(!ready, "E2E_BASE_URL and a separate Supabase project are required")

  test("public entry points answer @smoke", async ({ page }) => {
    for (const path of ["/", "/login", "/pricing"]) {
      const response = await page.goto(path)
      expect(response?.ok()).toBeTruthy()
    }
    const platform = await page.goto("/platform")
    expect(platform?.status()).toBeLessThan(500)
    await expect(page).not.toHaveURL(/\/platform$/)
  })
})
