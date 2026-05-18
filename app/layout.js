import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Altiflow — Industrial Photogrammetry Operations',
  description: 'Multi-tenant drone data pipeline with dynamic SLA engine and refly automation.',
}

export const viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="text-zinc-100 antialiased">
        {children}
        <Toaster theme="dark" position="top-right" toastOptions={{
          style: {
            background: 'rgba(24,24,27,0.9)',
            border: '1px solid rgba(63,63,70,0.6)',
            backdropFilter: 'blur(20px)',
          }
        }} />
      </body>
    </html>
  )
}
