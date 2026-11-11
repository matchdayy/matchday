import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export function EmptyState({ children }: Props) {
  return <p className="state state--empty">{children}</p>
}
