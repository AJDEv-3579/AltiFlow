import React from 'react'

export function TextInput({ value, onChange, placeholder, type = 'text', big = false, className = '', ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-zinc-900/90 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${
        big ? 'px-4 py-3 text-base' : 'px-3.5 py-2 text-sm'
      } ${className}`}
      {...rest}
    />
  )
}

export default TextInput
