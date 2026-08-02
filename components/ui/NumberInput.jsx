import React from 'react'

export function NumberInput({ value, onChange, big = false, min = 0, max }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={`w-full bg-zinc-900/90 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono ${
        big ? 'px-4 py-3 text-base' : 'px-3.5 py-2 text-sm'
      }`}
    />
  )
}

export default NumberInput
