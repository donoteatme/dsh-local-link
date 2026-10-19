interface SettingsNavigationLabels {
  readonly section: string
  readonly settings: string
}

interface SettingsNavigationEnvironment {
  readonly document: Pick<Document, 'querySelector' | 'querySelectorAll'>
  readonly requestFrame: (callback: () => void) => void
}

function hasLabel(element: Element, label: string): boolean {
  return element.getAttribute('aria-label') === label
    || element.textContent?.trim() === label
    || [...element.children].some(child => child.getAttribute('aria-hidden') !== 'true' && child.textContent?.trim() === label)
}

/** Bounded, user-initiated bridge until Harness exposes section navigation. */
export function openSettingsSection(
  labels: SettingsNavigationLabels,
  environment: SettingsNavigationEnvironment = { document, requestFrame: callback => { requestAnimationFrame(callback) } },
): void {
  const doc = environment.document
  const selectSection = (): boolean => {
    const section = [...doc.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')]
      .find(button => hasLabel(button, labels.section))
    section?.click()
    return section !== undefined
  }
  if (selectSection()) return

  // Older Hosts expose a direct Settings dialog trigger in the sidebar.
  // Never use an unscoped dialog trigger: that can open session statistics.
  const legacy = [...doc.querySelectorAll<HTMLButtonElement>(
    '[data-slot="sidebar.settings"] button[aria-haspopup="dialog"], [data-slot="sidebar"] button[aria-haspopup="dialog"]',
  )].find(button => hasLabel(button, labels.settings))
  const launcher = legacy ?? doc.querySelector<HTMLButtonElement>(
    '[data-slot="settings.launcher"] button[aria-haspopup="menu"]',
  )
  if (launcher === null) return
  if (launcher.getAttribute('aria-expanded') !== 'true') launcher.click()

  let waitingForMenu = legacy === undefined
  let remainingFrames = 120
  const deadline = Date.now() + 2_000
  const advance = (): void => {
    if (selectSection()) return
    if (remainingFrames-- <= 0 || Date.now() > deadline) return
    if (waitingForMenu) {
      const settings = [...doc.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]')]
        .find(button => hasLabel(button, labels.settings))
      if (settings !== undefined) {
        waitingForMenu = false
        settings.click()
      }
    }
    environment.requestFrame(advance)
  }
  environment.requestFrame(advance)
}
