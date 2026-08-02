import React from 'react'

export function Toggle({ value, onChange, label, hint }) {
  return (
    <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-colors">
      <div>
        <div className="text-xs font-medium text-zinc-200">{label}</div>
        {hint && <div className="text-[11px] text-zinc-500">{hint}</div>}
      </div>
      <input
        type="checkbox"
        checked={!!value}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-zinc-700 text-blue-600 focus:ring-blue-500 bg-zinc-950"
      />
    </label>
  )
}

export default Toggle
