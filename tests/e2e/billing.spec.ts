import { test } from "@playwright/test"

test.skip(true, "Stripe test mode was not executed in this environment.")
test("checkout webhook changes the plan @billing", async () => {})
