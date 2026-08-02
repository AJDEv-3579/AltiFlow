import React from 'react'

export function Btn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
  icon: Icon,
}) {
  const base = 'font-medium rounded-xl transition-all duration-150 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'
  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm font-semibold',
  }
  const vars = {
    primary: 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-500/20 active:scale-[0.98]',
    secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/60 active:scale-[0.98]',
    outline: 'border border-zinc-700/70 hover:border-zinc-500 text-zinc-300 hover:text-white bg-zinc-900/40 hover:bg-zinc-800/60',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30',
    success: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size] || sizes.md} ${vars[variant] || vars.primary} ${className}`}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}

export default Btn
