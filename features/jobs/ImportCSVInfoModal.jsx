import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { FileText, X, Upload } from 'lucide-react'
import Btn from '@/components/ui/Btn'

export function ImportCSVInfoModal({ jobs, onOpenImportCSV, onClose }) {
  const lastStandCount = useMemo(() => {
    return (jobs || []).filter(j => (j.category || 'Stand Count') === 'Stand Count').sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
  }, [jobs])

  const lastUniformity = useMemo(() => {
    return (jobs || []).filter(j => j.category === 'Uniformity').sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
  }, [jobs])

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="font-semibold text-zinc-100 flex items-center gap-2">
            <FileText size={18} className="text-amber-400" />
            Last Uploaded Job Cards
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          <div className="text-xs text-zinc-400">
            Below are the field names and parameters from the last created job cards for each category to help you structure your CSV before importing:
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Stand Count Category — Last Created Job
              </span>
              {lastStandCount && <span className="text-[10px] text-zinc-500">{new Date(lastStandCount.created_at).toLocaleDateString()}</span>}
            </div>
            {lastStandCount ? (
              <div className="grid grid-cols-2 gap-2.5 text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">
                <div><span className="text-zinc-500">Field Name:</span> <strong className="text-zinc-100">{lastStandCount.title}</strong></div>
                <div><span className="text-zinc-500">Drone:</span> <span className="text-zinc-200">{lastStandCount.drone_name || 'N/A'}</span></div>
                <div><span className="text-zinc-500">Capture Date:</span> <span className="text-zinc-200">{lastStandCount.capture_date || 'N/A'}</span></div>
                <div><span className="text-zinc-500">Flight Count:</span> <span className="text-zinc-200">{lastStandCount.flight_count || 1} flight(s)</span></div>
                {lastStandCount.comments && (
                  <div className="col-span-2 text-[11px] text-zinc-400 border-t border-zinc-800/50 pt-2 mt-1">
                    <span className="text-zinc-500">Notes:</span> {lastStandCount.comments}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 italic bg-zinc-950/30 p-3 rounded-lg border border-zinc-800/40">
                No Stand Count job card created yet.
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                Uniformity Category — Last Created Job
              </span>
              {lastUniformity && <span className="text-[10px] text-zinc-500">{new Date(lastUniformity.created_at).toLocaleDateString()}</span>}
            </div>
            {lastUniformity ? (
              <div className="grid grid-cols-2 gap-2.5 text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">
                <div><span className="text-zinc-500">Field Name:</span> <strong className="text-zinc-100">{lastUniformity.title}</strong></div>
                <div><span className="text-zinc-500">Drone:</span> <span className="text-zinc-200">{lastUniformity.drone_name || 'N/A'}</span></div>
                <div><span className="text-zinc-500">Capture Date:</span> <span className="text-zinc-200">{lastUniformity.capture_date || 'N/A'}</span></div>
                <div><span className="text-zinc-500">Flight Count:</span> <span className="text-zinc-200">{lastUniformity.flight_count || 1} flight(s)</span></div>
                {lastUniformity.comments && (
                  <div className="col-span-2 text-[11px] text-zinc-400 border-t border-zinc-800/50 pt-2 mt-1">
                    <span className="text-zinc-500">Notes:</span> {lastUniformity.comments}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 italic bg-zinc-950/30 p-3 rounded-lg border border-zinc-800/40">
                No Uniformity job card created yet.
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/40 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 font-medium cursor-pointer">Close</button>
          <Btn icon={Upload} onClick={onOpenImportCSV} variant="primary">Import CSV</Btn>
        </div>
      </motion.div>
    </div>
  )
}

export default ImportCSVInfoModal
