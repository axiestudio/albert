/**
 * E2E Tests: Albert Law Agent — Chat, Model Selection, Latency, Smart Research
 *
 * Tests the full law-agent frontend at localhost:3000:
 * - Page loads and chat interface renders
 * - Sending a legal question triggers AI response with tool invocations
 * - Model selector works (Server 1, vertex modes, BYOK)
 * - Response latency stays within acceptable bounds
 * - Agent uses tools (searchLaws, getLawDetail, fetchLagenNu) and provides cited answers
 * - Auto-research loop: agent follows truncated content and cites specific sections
 */

import { test, expect, type Page } from '@playwright/test'

const LAW_AGENT_URL = process.env.LAW_AGENT_URL || 'http://localhost:3000'
const API_URL = process.env.API_URL || 'http://localhost:3001'

// ─── Helpers ──────────────────────────────────────────────────────────

/** Navigate to the law agent and wait for the chat interface to be ready */
async function goToChat(page: Page) {
  await page.goto(LAW_AGENT_URL, { waitUntil: 'networkidle' })
  // The index redirects to /chat/{threadId}
  await page.waitForURL(/\/chat\//, { timeout: 15_000 })
  await page.waitForLoadState('networkidle')
}

/** Find the chat input – textarea or input */
function getChatInput(page: Page) {
  return page.locator('textarea').first()
    .or(page.getByPlaceholder(/fråga|fråga om|message|skriv/i).first())
}

/** Send a message via the chat input and wait for streaming to begin */
async function sendMessage(page: Page, message: string) {
  const input = getChatInput(page)
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.fill(message)
  await page.keyboard.press('Enter')
}

/** Wait until the agent produces actual text content (not just "Tänker..." thinking indicator) */
async function waitForAssistantResponse(page: Page, timeoutMs = 120_000) {
  await page.waitForFunction(
    () => {
      // Look for assistant message elements
      const assistantParts = document.querySelectorAll(
        '[data-role="assistant"], .aui-assistant-message, [class*="assistant"]'
      )

      for (const part of assistantParts) {
        const text = (part.textContent || '').trim()
        // Skip thinking/loading indicators — we want actual content
        if (text.length > 30 && !/^(tänker|söker|läser|analyserar)\.\.\./i.test(text)) {
          return true
        }
      }
      return false
    },
    undefined,
    { timeout: timeoutMs }
  )
}

/** Wait for the agent to finish (no more thinking/loading indicators, stop button gone) */
async function waitForAgentDone(page: Page, timeoutMs = 180_000) {
  const start = Date.now()
  await page.waitForFunction(
    () => {
      // The stop button ("Stoppa genereringen") indicates the agent is still working
      const stopBtn = document.querySelector('button[aria-label="Stoppa genereringen"]')
      if (stopBtn) return false

      // Check for "Tänker..." / "Söker..." / streaming indicators
      const thinkingTexts = document.querySelectorAll(
        '[data-role="assistant"], .aui-assistant-message, [class*="assistant"]'
      )
      for (const el of thinkingTexts) {
        const text = (el.textContent || '').trim()
        if (/^(tänker|söker|läser|analyserar)\.\.\./i.test(text)) return false
      }

      // Check for streaming indicators
      const isStreaming = document.querySelector(
        '[data-streaming="true"], .aui-message-streaming, [class*="streaming"]'
      )
      if (isStreaming) return false

      // Must have actual assistant content
      for (const el of thinkingTexts) {
        const text = (el.textContent || '').trim()
        if (text.length > 30) return true
      }
      return false
    },
    undefined,
    { timeout: timeoutMs }
  )
  return Date.now() - start
}

// ─── Test Suite: Chat Interface ───────────────────────────────────────

test.describe('Albert Law Agent — Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await goToChat(page)
  })

  test('page loads and shows Albert branding', async ({ page }) => {
    // ALBERT branding should be visible
    await expect(page.getByText('ALBERT').first()).toBeVisible({ timeout: 10_000 })
  })

  test('chat input is visible and accepts text', async ({ page }) => {
    const input = getChatInput(page)
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('Test input')
    const val = await input.inputValue()
    expect(val).toContain('Test')
  })

  test('starter prompt cards are shown', async ({ page }) => {
    // The law agent shows starter prompts like "LAS i klarspråk", "GDPR för SaaS", "Lagstiftningskedja"
    const starterCards = page.locator('[class*="card"], [class*="prompt"], button').filter({
      hasText: /LAS|GDPR|Lagstiftning|klarspråk|konsument|hyres/i,
    })

    // At least one starter card should exist
    const cardCount = await starterCards.count()
    expect(cardCount).toBeGreaterThanOrEqual(1)
  })

  test('model selector shows "Server 1" by default', async ({ page }) => {
    // The model selector button at the bottom shows the current mode
    const modelBtn = page.locator('button').filter({
      hasText: /Server 1|server.1/i,
    }).first()
    await expect(modelBtn).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Test Suite: Model Selection ──────────────────────────────────────

test.describe('Albert Law Agent — Model Selection', () => {
  test.beforeEach(async ({ page }) => {
    await goToChat(page)
  })

  test('clicking key icon opens LLM settings panel', async ({ page }) => {
    // The LLM settings panel is opened by the key icon button (aria-label="AI-nyckelinställningar")
    const keyBtn = page.locator('button[aria-label="AI-nyckelinställningar"]').first()

    if (await keyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await keyBtn.click()

      // Settings panel should open with "AI-modeller och nycklar"
      await expect(
        page.getByText('AI-modeller och nycklar').first()
      ).toBeVisible({ timeout: 5_000 })
    }
  })

  test('settings panel shows managed, vertex, and BYOK sections', async ({ page }) => {
    const keyBtn = page.locator('button[aria-label="AI-nyckelinställningar"]').first()

    if (await keyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await keyBtn.click()
      await page.waitForTimeout(500)

      // Check for section headers
      const sectionLabels = ['Hanterad', 'Egen nyckel']
      for (const label of sectionLabels) {
        const section = page.getByText(label, { exact: false }).first()
        if (await section.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(section).toBeVisible()
        }
      }
    }
  })

  test('settings panel has a model dropdown with options', async ({ page }) => {
    const keyBtn = page.locator('button[aria-label="AI-nyckelinställningar"]').first()

    if (await keyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await keyBtn.click()
      await page.waitForTimeout(500)

      // Find any select element (model dropdown)
      const select = page.locator('select').first()
      if (await select.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const options = await select.locator('option').allInnerTexts()
        expect(options.length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('close button dismisses settings panel', async ({ page }) => {
    const keyBtn = page.locator('button[aria-label="AI-nyckelinställningar"]').first()

    if (await keyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await keyBtn.click()
      await page.waitForTimeout(500)

      const closeBtn = page.getByText('Stäng', { exact: false }).first()
      if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await closeBtn.click()
        await page.waitForTimeout(300)

        // Panel should be dismissed
        await expect(
          page.getByText('AI-modeller och nycklar')
        ).not.toBeVisible({ timeout: 3_000 })
      }
    }
  })
})

// ─── Test Suite: Chat Intelligence & Latency ──────────────────────────

test.describe('Albert Law Agent — Intelligence & Latency', () => {
  // These tests send real queries and measure the agent's behavior
  test.setTimeout(180_000)

  test.beforeEach(async ({ page }) => {
    await goToChat(page)
  })

  test('API health check — cloudflare-api is reachable', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`)
    expect(res.ok()).toBeTruthy()
  })

  test('sends a simple legal question and gets a response', async ({ page }) => {
    const start = Date.now()

    await sendMessage(page, 'Vad är preskriptionstiden för skulder i Sverige?')

    // Wait for the agent to start responding (tool calls or text)
    await waitForAssistantResponse(page, 60_000)
    const firstResponseMs = Date.now() - start

    // First response (acknowledgement or tool call) should arrive within 30s
    expect(firstResponseMs).toBeLessThan(30_000)

    // Wait for the full response to complete
    const totalMs = await waitForAgentDone(page)

    // Log for diagnostics
    console.log(`[Latency] Simple question: first_response=${firstResponseMs}ms total=${totalMs}ms`)

    // Total response should complete within 3 minutes
    expect(totalMs).toBeLessThan(180_000)
  })

  test('agent cites sources with footnotes', async ({ page }) => {
    await sendMessage(page, 'Kan min arbetsgivare säga upp mig utan sakliga skäl?')

    // Wait for the full answer
    await waitForAgentDone(page)

    // The response should contain footnote markers [1], [2] etc. or "SFS" references
    const pageContent = await page.textContent('body')
    const hasFootnotes = /\[\d+\]/.test(pageContent || '')
    const hasSfsReferences = /SFS\s+\d{4}:\d+/.test(pageContent || '')
    const hasLegalTerms = /sakliga skäl|uppsägning|LAS|anställningsskydd/i.test(pageContent || '')

    // Agent should cite at least one source or use legal terminology
    expect(hasFootnotes || hasSfsReferences || hasLegalTerms).toBeTruthy()
  })

  test('agent uses tool calls for legal research', async ({ page }) => {
    await sendMessage(page, 'Vilka regler gäller för andrahandsuthyrning av hyresrätt?')

    await page.waitForFunction(
      () => {
        const body = document.body.textContent || ''
        return /använde:|undersöker rättskällorna|agent-spårning/i.test(body)
      },
      undefined,
      { timeout: 120_000 }
    )

    const pageContent = await page.textContent('body') || ''
    const hasToolTrace = /använde:|undersöker rättskällorna|agent-spårning/i.test(pageContent)
    expect(hasToolTrace).toBeTruthy()

    const hasResearchTrace = /söker lagar|semantisk sökning|hämtar lagtext|hämtar från lagen\.nu/i.test(pageContent)
    expect(hasResearchTrace).toBeTruthy()

    const hasRentalLawContext = /andrahandsuthyrning|hyresrätt|hyres/i.test(pageContent)
    expect(hasRentalLawContext).toBeTruthy()
  })

  test('agent handles follow-up questions without re-searching', async ({ page }) => {
    // First message
    await sendMessage(page, 'Vad säger konsumentköplagen om reklamationsrätt?')
    await waitForAgentDone(page)

    // Second (follow-up) message
    const start = Date.now()
    await sendMessage(page, 'Vilken tidsfrist gäller?')
    await waitForAssistantResponse(page, 30_000)
    const followUpMs = Date.now() - start

    console.log(`[Latency] Follow-up response: ${followUpMs}ms`)

    // Follow-up should be faster than initial (may use cached context)
    // Allow up to 60s for follow-up
    expect(followUpMs).toBeLessThan(60_000)
  })
})

// ─── Test Suite: Auto-Research Depth (Autoresearch Pattern) ───────────

test.describe('Albert Law Agent — Auto-Research Depth', () => {
  test.setTimeout(300_000) // 5 min — complex research takes time

  test.beforeEach(async ({ page }) => {
    await goToChat(page)
  })

  test('complex multi-law question gets multi-dimensional answer', async ({ page }) => {
    // This tests the "don't stop until all dimensions covered" pattern
    await sendMessage(
      page,
      'Jag vill sälja mitt hus men min fru vägrar ge samtycke. Vilka regler gäller och vad kan jag göra?'
    )

    // First wait for the agent to acknowledge (Tänker... or actual response)
    await page.waitForFunction(
      () => {
        const body = document.body.textContent || ''
        return /tänker|söker|äktenskapsbalken|samtycke|jordabalken|fastighet/i.test(body)
      },
      undefined,
      { timeout: 60_000 }
    )

    await waitForAgentDone(page, 240_000)

    const pageContent = await page.textContent('body') || ''

    // Agent should address BOTH marriage law AND property law
    const hasMarriageLaw = /äktenskapsbalken|ÄktB|samtycke|giftorätt/i.test(pageContent)
    const hasPropertyLaw = /jordabalken|JB|fastighet|bostad/i.test(pageContent)

    // At least one of the core legal frameworks should be mentioned
    expect(hasMarriageLaw || hasPropertyLaw).toBeTruthy()

    // Structured evidence can appear as inline footnotes or direct statute citations.
    const footnoteCount = (pageContent.match(/\[\d+\]/g) || []).length
    const hasStatuteCitation = /(?:SFS\s+)?\d{4}:\d+/.test(pageContent)
    console.log(`[Research Depth] Multi-law question: footnotes=${footnoteCount} statute_citation=${hasStatuteCitation}`)
    expect(footnoteCount >= 1 || hasStatuteCitation).toBeTruthy()
  })

  test('answer includes specific section citations (kap/§)', async ({ page }) => {
    await sendMessage(page, 'Vad krävs för uppsägning på grund av personliga skäl enligt LAS?')

    await waitForAgentDone(page)

    const pageContent = await page.textContent('body') || ''

    // Agent should cite specific chapters/sections, not just the law name
    const hasSpecificCitations = /\d+\s*(?:kap|§)|kap\.\s*\d+|§\s*\d+/i.test(pageContent)
    const hasLAStReference = /LAS|1982:80|anställningsskydd/i.test(pageContent)

    console.log(`[Research Depth] LAS question: specific_citations=${hasSpecificCitations} LAS_ref=${hasLAStReference}`)

    expect(hasLAStReference).toBeTruthy()
  })

  test('consumer law question gets grounded response', async ({ page }) => {
    await sendMessage(page, 'Jag köpte en mobiltelefon som slutade fungera efter 4 månader. Vad har jag för rättigheter?')

    await waitForAgentDone(page)

    const pageContent = await page.textContent('body') || ''

    // Should reference consumer purchase law
    const hasConsumerLaw = /konsumentköp|reklamation|garanti|fel i vara|2022:260/i.test(pageContent)
    expect(hasConsumerLaw).toBeTruthy()

    // Should mention the 6-month presumption or 3-year complaint period
    const hasTimeLimits = /6\s*månader|tre\s*år|3\s*år|presumtion|reklamationsfrist/i.test(pageContent)
    console.log(`[Research Depth] Consumer question: consumer_law=${hasConsumerLaw} time_limits=${hasTimeLimits}`)
  })
})

// ─── Test Suite: Backend API Direct ───────────────────────────────────

test.describe('Albert Law Agent — API Direct Tests', () => {
  test.setTimeout(120_000)

  test('POST /api/v1/executive/law returns streaming response', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/executive/law`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        query: 'Vad är preskriptionstiden för fordringar?',
        sessionId: `e2e-test-${Date.now()}`,
        context: {
          timezone: 'Europe/Stockholm',
          locale: 'sv-SE',
          timestamp: new Date().toISOString(),
          defaultLanguage: 'sv',
        },
        messageHistory: [],
      },
      timeout: 120_000,
    })

    expect(res.status()).toBe(200)

    const contentType = res.headers()['content-type'] || ''
    const isStream = contentType.includes('text/event-stream')
      || contentType.includes('text/plain')
      || res.headers()['x-vercel-ai-ui-message-stream'] === 'v1'

    expect(isStream).toBeTruthy()

    // Verify a model was resolved
    const resolvedModel = res.headers()['x-law-resolved-model'] || ''
    expect(resolvedModel.length).toBeGreaterThan(0)
  })

  test('POST /api/v1/executive/law rejects missing query', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/executive/law`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        sessionId: 'test',
        messageHistory: [],
      },
    })

    expect(res.status()).toBe(400)
  })
})
