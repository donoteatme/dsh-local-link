import { describe, expect, it } from 'vitest'
import { openSettingsSection } from '../src/settings-navigation.js'

function harness(settingsLabel = 'Settings', sectionLabel = 'Local access') {
  let menu = false
  let dialog = false
  let legacy = false
  let expanded = false
  let launcherPresent = true
  const clicks = { launcher: 0, settings: 0, section: 0, statistics: 0 }
  const frames: Array<() => void> = []
  const button = (label: string, click: () => void, children: Element[] = []) => ({
    textContent: label,
    children,
    getAttribute: () => null,
    click,
  }) as unknown as HTMLButtonElement
  const section = button(sectionLabel, () => { clicks.section++ })
  const settings = button(settingsLabel + 'Ctrl+Alt+,', () => { clicks.settings++; menu = false; dialog = true }, [
    button(settingsLabel, () => {}),
  ])
  const launcher = button('Account menu', () => { clicks.launcher++; expanded = true; if (legacy) dialog = true; else menu = true })
  launcher.getAttribute = name => name === 'aria-expanded' ? String(expanded) : null
  const legacyTrigger = button(settingsLabel, launcher.click)
  const statistics = button('Session statistics', () => { clicks.statistics++ })
  const document = {
    querySelector: () => launcherPresent && !legacy ? launcher : null,
    querySelectorAll: (selector: string) => {
      if (selector === '[role="dialog"] nav button') return dialog ? [section] : []
      if (selector === '[role="menu"] [role="menuitem"]') return menu ? [settings] : []
      if (selector.includes('[data-slot="sidebar.settings"]')) return legacy ? [legacyTrigger] : []
      // Reproduces the old bug if the implementation ever goes unscoped again.
      return [statistics]
    },
  } as unknown as Document
  return {
    clicks, frames,
    run: () => openSettingsSection({ section: sectionLabel, settings: settingsLabel }, { document, requestFrame: callback => { frames.push(callback) } }),
    flush: () => { for (let index = 0; index < 125 && frames.length; index++) frames.shift()?.() },
    legacy: () => { legacy = true },
    open: () => { dialog = true },
    expanded: () => { menu = true; expanded = true },
    missing: () => { launcherPresent = false },
    unavailable: () => { launcher.click = () => { clicks.launcher++ } },
  }
}

describe('Settings navigation compatibility bridge', () => {
  it.each([['Settings', 'Local access'], ['设置', '本地访问']])('opens the intended section through the localized %s menu', (settings, section) => {
    const host = harness(settings, section)
    host.run()
    host.flush()
    expect(host.clicks).toEqual({ launcher: 1, settings: 1, section: 1, statistics: 0 })
  })

  it('retains the scoped direct Settings trigger for historical Hosts', () => {
    const host = harness()
    host.legacy()
    host.run()
    host.flush()
    expect(host.clicks).toEqual({ launcher: 1, settings: 0, section: 1, statistics: 0 })
  })

  it('selects an already open settings section without toggling any launcher', () => {
    const host = harness()
    host.open()
    host.run()
    expect(host.clicks).toEqual({ launcher: 0, settings: 0, section: 1, statistics: 0 })
    expect(host.frames).toHaveLength(0)
  })

  it('does not close an already expanded account menu', () => {
    const host = harness()
    host.expanded()
    host.run()
    host.flush()
    expect(host.clicks).toEqual({ launcher: 0, settings: 1, section: 1, statistics: 0 })
  })

  it('does nothing when no settings launcher exists, even if statistics has a dialog trigger', () => {
    const host = harness()
    host.missing()
    host.run()
    expect(host.clicks).toEqual({ launcher: 0, settings: 0, section: 0, statistics: 0 })
    expect(host.frames).toHaveLength(0)
  })

  it('stops waiting when the Host cannot render Settings', () => {
    const host = harness()
    host.unavailable()
    host.run()
    host.flush()
    expect(host.frames).toHaveLength(0)
    expect(host.clicks).toEqual({ launcher: 1, settings: 0, section: 0, statistics: 0 })
  })
})
