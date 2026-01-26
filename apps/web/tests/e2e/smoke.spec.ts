import { test, expect } from "@playwright/test"
import { fileURLToPath } from "node:url"

test("inbox loads", async ({ page }) => {
  await page.goto("/inbox")
  await expect(page.getByText("Questionnaire Inbox")).toBeVisible()
})

test("upload wizard loads", async ({ page }) => {
  await page.goto("/upload")
  await expect(page.getByText("Upload Wizard")).toBeVisible()
  await expect(page.getByText("Processing Status")).toBeVisible()
})

test("review queue loads", async ({ page }) => {
  await page.goto("/review/sample")
  await expect(page.getByText("Review Queue")).toBeVisible()
  await expect(page.getByText("Suggested answer")).toBeVisible()
})

test("docx upload flow completes", async ({ page }) => {
  await page.route("**/api/uploads/sign", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questionnaire_id: "q-docx-1",
        input_file: {
          bucket: "uploads",
          path: "org/org-1/questionnaires/q-docx-1/input.docx",
          file_name: "input.docx",
          mime_type:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size_bytes: 123,
          signed_url: "https://uploads.test/org/org-1/questionnaires/q-docx-1/input.docx",
          expires_in: 600
        }
      })
    })
  })

  await page.route("https://uploads.test/**", async (route) => {
    await route.fulfill({ status: 200, body: "" })
  })

  await page.route("**/api/questionnaires", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questionnaire_id: "q-docx-1",
        status: "QUEUED",
        job_id: "job-docx-1"
      })
    })
  })

  await page.goto("/upload")
  const workspaceInput = page.getByPlaceholder("Workspace UUID")
  if (!(await workspaceInput.isDisabled())) {
    await workspaceInput.fill("ws-1")
  }
  await page.getByPlaceholder("Acme Security Questionnaire").fill("Docx Upload Test")

  const filePath = fileURLToPath(
    new URL("../../../../fixtures/questionnaires/simple.docx", import.meta.url)
  )
  await page.locator('input[type="file"]').setInputFiles(filePath)

  await page.getByRole("button", { name: "Generate upload URL" }).click()
  await expect(page.getByText("Upload complete. Processing has started.")).toBeVisible()
})
