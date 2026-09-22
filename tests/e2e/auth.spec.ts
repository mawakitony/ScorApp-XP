import { test } from "@playwright/test"

test.skip(true, "Live signup requires a dedicated Supabase project. Not executed here.")
test("signup reaches the dashboard @smoke", async () => {})
