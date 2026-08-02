import React from 'react'

export function GlassCard({ children, className = '' }) {
  return (
    <div className={`glass rounded-2xl border border-zinc-800/60 shadow-xl backdrop-blur-md ${className}`}>
      {children}
    </div>
  )
}

export default GlassCard
