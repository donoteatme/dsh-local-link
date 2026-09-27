import type React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

type IconProps = { readonly size?: number; readonly className?: string }
type Icon = (props: IconProps) => React.JSX.Element
const icons = primitives as unknown as Record<string, Icon | undefined>

function compatibleIcon(current: string, legacy: string): Icon {
  const icon = icons[current] ?? icons[legacy]
  if (icon === undefined) throw new Error(`Harness icon unavailable: ${current}`)
  return icon
}

// Harness 0.1.7 names icon weight rather than artwork size. Keep the older
// exports as a fallback for the supported 0.1.5 and historical RC hosts.
export const IconChevronDown = compatibleIcon('IconChevronDownOutlineRegular', 'IconChevronDownOutline14')
export const IconChevronRight = compatibleIcon('IconChevronRightOutlineRegular', 'IconChevronRightOutline14')
export const IconClose = compatibleIcon('IconCloseOutlineRegular', 'IconCloseOutline16')
export const IconAgentPreset = compatibleIcon('IconAgentPresetOutlineRegular', 'IconAgentPresetOutline16')
export const IconData = compatibleIcon('IconDataOutlineRegular', 'IconDataOutline16')
export const IconDownload = compatibleIcon('IconDownloadOutlineRegular', 'IconDownloadOutline16')
export const IconFolderOpen = compatibleIcon('IconFolderOpenOutlineRegular', 'IconFolderOpenOutline16')
export const IconLight = compatibleIcon('IconLightOutlineRegular', 'IconLightOutline16')
export const IconDark = compatibleIcon('IconDarkOutlineRegular', 'IconDarkOutline16')
