import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon?: React.ReactNode
  readonly size?: 'md' | 'sm'
  readonly variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  readonly icon?: React.ReactNode
}

export function Button({ children, icon, size: _size, variant: _variant, ...props }: ButtonProps): React.JSX.Element {
  return React.createElement('button', { type: 'button', ...props }, icon, children)
}

export function Input({ className, icon, ...props }: InputProps): React.JSX.Element {
  return React.createElement('span', { className }, icon, React.createElement('input', props))
}

interface IconProps {
  readonly className?: string
  readonly size?: number
}

const TestIcon = ({ className, size = 16 }: IconProps): React.JSX.Element => React.createElement('svg', {
  'aria-hidden': true,
  className,
  height: size,
  width: size,
})

export const IconAgentPresetOutline16 = TestIcon
export const IconChevronDownOutline14 = TestIcon
export const IconChevronRightOutline14 = TestIcon
export const IconCloseOutline16 = TestIcon
export const IconDarkOutline16 = TestIcon
export const IconDataOutline16 = TestIcon
export const IconDownloadOutline16 = TestIcon
export const IconFolderOpenOutline16 = TestIcon
export const IconLightOutline16 = TestIcon
