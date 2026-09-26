import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { expect, test, type Page } from "@playwright/test"
import { e2eCurrentDatabaseAllowed } from "../../lib/env"

function loadLocalEnv() {
  try {
    const text = readFileSync(".env.local", "utf8")
    for (const line of text.split(/\r?\n/)) {
      const index = line.indexOf("=")
      if (index <= 0 || line.startsWith("#")) continue
      const key = line.slice(0, index)
      if (!process.env[key]) process.env[key] = line.slice(index + 1).trim()
    }
  } catch {
    // The explicit shell environment is enough when .env.local is absent.
  }
}

loadLocalEnv()

const allowed = e2eCurrentDatabaseAllowed()
const prefix = process.env.E2E_PREFIX?.trim() || ""
const slug = prefix.toLowerCase()
const email = `${slug}@example.com`
const password = randomBytes(18).toString("base64url")
const shots = "test-results/production-gate"

test.describe("production gate on the current project", () => {
  test.skip(!allowed, "NOT TESTED: E2E_ALLOW_CURRENT=1 and E2E_PREFIX=E2E-WOLOYEM-<timestamp> are required. No second database is used, and nothing is deleted.")
  test.describe.configure({ mode: "serial" })
  test.setTimeout(240_000)

  test.beforeAll(async () => {
    mkdirSync(shots, { recursive: true })
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: prefix },
    })
    if (created.error) throw new Error("Le compte E2E préfixé n'a pas pu être créé.")
    const member = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signed = await member.auth.signInWithPassword({ email, password })
    if (signed.error) throw new Error("Le compte E2E n'a pas pu ouvrir une session.")
    const organization = await member.rpc("create_organization", {
      p_name: prefix,
      p_slug: slug,
      p_use_case: "e2e",
      p_trial_days: 14,
    })
    if (organization.error) throw new Error("L'organisation E2E isolée n'a pas pu être créée.")
  })

  test("owner publishes an isolated scorecard and the public page follows only the release", async ({ page, browser }) => {
    const problems = watch(page)
    await page.goto("/login")
    await page.locator("form").filter({ has: page.locator("#password") }).locator("#email").fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
    await shot(page, "dashboard-desktop")
    expect(page.url()).not.toContain("localhost:3000/s/")

    await page.goto("/dashboard/templates")
    await page.getByRole("button", { name: "Créer à partir de ce modèle" }).first().click()
    await page.waitForURL(/\/builder/)
    await page.getByRole("button", { name: /Identité/ }).click()
    await page.locator("#setup-name").fill(prefix)
    await page.locator("#setup-slug").fill(slug)
    await expect(page.getByText(`/s/${slug}`)).toBeVisible()
    await saved(page)

    await page.getByRole("button", { name: /Questions/ }).click()
    await page.getByRole("button", { name: "Ajouter une question" }).click()
    await page.locator("#question-title").fill(`${prefix} question`)
    await saved(page)
    await shot(page, "builder-questions-desktop")

    await page.getByRole("button", { name: /Résultats/ }).click()
    await page.getByRole("button", { name: "Ajouter une plage" }).click()
    await expect(page.getByLabel("Titre public")).toBeVisible({ timeout: 20_000 })

    await page.getByRole("button", { name: "Aperçu", exact: true }).click()
    await expect(page.getByText("Ceci est le brouillon, pas la version publique.")).toBeVisible()
    await shot(page, "preview-desktop")

    await publish(page)
    const visitor = await browser.newContext()
    const publicPage = await visitor.newPage()
    const publicProblems = watch(publicPage)
    await publicPage.goto(`/s/${slug}`)
    await expect(async () => {
      if (await publicPage.getByRole("heading", { name: "Page introuvable" }).count()) await publicPage.reload()
      await expect(publicPage.getByRole("button", { name: /Commencer/ })).toBeVisible()
    }).toPass({ timeout: 20_000 })
    await shot(publicPage, "public-landing-desktop")
    await publicPage.getByRole("button", { name: /Commencer/ }).click()
    await expect(publicPage.getByRole("heading", { name: `${prefix} question` })).toBeVisible({ timeout: 30_000 })

    await page.getByRole("button", { name: /Questions/ }).click()
    await page.locator("#question-title").fill(`${prefix} brouillon`)
    await saved(page)
    await expect(page.getByText("Modifications non publiées")).toBeVisible({ timeout: 15_000 })
    await publicPage.reload()
    await expect(publicPage.getByRole("heading", { name: `${prefix} question` })).toBeVisible()
    await expect(publicPage.getByText(`${prefix} brouillon`)).toHaveCount(0)

    await publish(page)
    await publicPage.reload()
    await expect(publicPage.getByRole("heading", { name: `${prefix} brouillon` })).toBeVisible({ timeout: 15_000 })
    await shot(publicPage, "assessment-desktop")
    await publicPage.getByRole("button", { name: /Option 1|Oui/ }).first().click()
    await publicPage.getByRole("button", { name: "Terminer" }).click()
    const lead = publicPage.locator("form").filter({ has: publicPage.getByRole("heading", { name: "Vos coordonnées" }) })
    await expect(lead).toBeVisible()
    await lead.locator('input[name="first_name"]').fill(prefix)
    await lead.locator('input[name="email"]').fill(email)
    const consent = lead.locator('input[type="checkbox"]')
    if (await consent.count()) await consent.check()
    await lead.locator('input[name="email"]').press("Enter")
    await expect(publicPage.getByText("%").first()).toBeVisible({ timeout: 20_000 })
    await shot(publicPage, "result-desktop")

    await page.getByRole("button", { name: "Annuler" }).click()
    await expect(page.locator("#question-title")).toHaveValue(`${prefix} question`, { timeout: 15_000 })
    await page.getByRole("button", { name: "Restaurer la version publiée" }).click()
    await expect(page.getByText("Brouillon rétabli sur la version publiée.")).toBeVisible({ timeout: 20_000 })
    await expect(page.locator("#question-title")).toHaveValue(`${prefix} brouillon`, { timeout: 15_000 })

    expect(problems.filter(severe), problems.join("\n")).toEqual([])
    expect(publicProblems.filter(severe), publicProblems.join("\n")).toEqual([])
    await visitor.close()
  })

  test("mobile layouts keep the isolated journey on screen", async ({ page, browser }) => {
    const problems = watch(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/login")
    await page.locator("form").filter({ has: page.locator("#password") }).locator("#email").fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
    await noOverflow(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/dashboard/scorecards`)
    await expect(page.locator("article").getByRole("link", { name: prefix })).toBeVisible()
    await page.locator("article").getByRole("link", { name: prefix }).click()
    await page.getByRole("link", { name: "Ouvrir le builder" }).click()
    await page.getByRole("button", { name: /Questions/ }).click()
    await noOverflow(page)
    await shot(page, "builder-mobile")
    await page.getByRole("button", { name: "Aperçu", exact: true }).click()
    await noOverflow(page)
    const visitorContext = await browser.newContext()
    const visitor = await visitorContext.newPage()
    await visitor.setViewportSize({ width: 375, height: 812 })
    const visitorProblems = watch(visitor)
    await visitor.goto(`/s/${slug}`)
    await expect(async () => {
      if (await visitor.getByRole("heading", { name: "Page introuvable" }).count()) await visitor.reload()
      await expect(visitor.getByRole("button", { name: /Commencer/ })).toBeVisible()
    }).toPass({ timeout: 20_000 })
    await noOverflow(visitor)
    await shot(visitor, "landing-mobile")
    await visitor.getByRole("button", { name: /Commencer/ }).click()
    await expect(visitor.getByRole("heading", { level: 2 })).toBeVisible({ timeout: 30_000 })
    await noOverflow(visitor)
    await shot(visitor, "assessment-mobile")
    await visitor.getByRole("button", { name: /Option 1|Oui/ }).first().click()
    await visitor.getByRole("button", { name: "Terminer" }).click()
    const mobileLead = visitor.locator("form").filter({ has: visitor.getByRole("heading", { name: "Vos coordonnées" }) })
    await expect(mobileLead).toBeVisible()
    await mobileLead.locator('input[name="first_name"]').fill(prefix)
    await mobileLead.locator('input[name="email"]').fill(email)
    const mobileConsent = mobileLead.locator('input[type="checkbox"]')
    if (await mobileConsent.count()) await mobileConsent.check()
    await mobileLead.locator('input[name="email"]').press("Enter")
    await expect(visitor.getByText("%").first()).toBeVisible({ timeout: 20_000 })
    await noOverflow(visitor)
    await shot(visitor, "result-mobile")
    await visitorContext.close()
    expect(problems.filter(severe), problems.join("\n")).toEqual([])
    expect(visitorProblems.filter(severe), visitorProblems.join("\n")).toEqual([])
  })
})

async function saved(page: Page) {
  await expect(page.getByText("Enregistrement…")).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText("Enregistré").first()).toBeVisible({ timeout: 15_000 })
}

function watch(page: Page) {
  const problems: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`)
  })
  page.on("pageerror", (error) => problems.push(`page: ${error.message}`))
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`)
  })
  return problems
}

function severe(problem: string) {
  if (problem.startsWith("console:") && /favicon|Download the React DevTools|unsafe-eval/i.test(problem)) return false
  if (/^404 /.test(problem) && /favicon|_next\/|webpack/i.test(problem)) return false
  return true
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, "horizontal overflow").toBeLessThanOrEqual(1)
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publier", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText("Vérification…")).toHaveCount(0, { timeout: 20_000 })
  const blocked = await dialog.getByRole("heading", { name: "Publication impossible" }).count()
  if (blocked) throw new Error(await dialog.innerText())
  await dialog.getByRole("button", { name: "Publier" }).click()
  await expect(page.getByText("Le questionnaire public utilise maintenant ce contenu")).toBeVisible({ timeout: 20_000 })
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
}
