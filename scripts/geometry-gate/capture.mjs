// One screenshot for the geometry gate (design-system#202). A headless Chromium sometimes
// answers Page.captureScreenshot with a protocol error ("Unable to capture screenshot"), which
// once failed a Release on a clean tree. The capture waits for fonts and two frames, then
// retries that one error once; any other error, and a second protocol error, still fail.

export const isProtocolError = (error) => error instanceof Error && error.message.includes("Protocol error")

const afterLayout = async () => {
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

export const captureScreenshot = async (page, options = {}, log = console.warn) => {
  await page.evaluate(afterLayout)
  try {
    return await page.screenshot(options)
  } catch (error) {
    if (!isProtocolError(error)) throw error
    log(`geometry gate: screenshot hit a protocol error, retrying once: ${error.message.split("\n")[0]}`)
    await page.evaluate(afterLayout)
    return page.screenshot(options)
  }
}
