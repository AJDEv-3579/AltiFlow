import React from 'react'

export function Field({ label, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-300 tracking-wide block">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-zinc-500 leading-tight">{hint}</div>}
    </div>
  )
}

export default Field
