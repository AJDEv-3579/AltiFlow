export function downloadTextFile(fileName, content) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function readUploadedFile(file) {
  if (!file) return ''
  return file.text()
}

export function toDbJobStage(stage) {
  if (stage === 'Pending') return 'Open'
  if (stage === 'Cancelled') return 'Blocked'
  return stage
}

export function toUiJobStage(stage) {
  if (stage === 'Open') return 'Pending'
  if (stage === 'Blocked') return 'Cancelled'
  return stage || 'Pending'
}

export function getJobPipelineStage(job) {
  if (!job) return 'Pending'
  const stageByCategory = (job.category === 'Uniformity' ? job.uni_status : job.sc_status)
  if (stageByCategory) return toUiJobStage(stageByCategory)
  if (job.status === 'In Progress' || job.status === 'Done' || job.status === 'Blocked') return toUiJobStage(job.status)
  return 'Pending'
}
