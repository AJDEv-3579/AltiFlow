/**
 * AltiFlow Automated Security Guardrails & Contract Verification Script
 *
 * Runs AST/pattern assertion checks to ensure AI agents or code changes
 * do not break role security boundaries, password confirmation rules,
 * or authentication flows.
 *
 * Usage: node scripts/security_guardrails_check.js
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

const checks = []
let hasError = false

function assert(condition, testName, failureMessage) {
  if (condition) {
    console.log(`  ✓ ${testName}`)
    checks.push({ testName, passed: true })
  } else {
    console.error(`  ✕ ${testName}`)
    console.error(`    -> ${failureMessage}`)
    checks.push({ testName, passed: false, failureMessage })
    hasError = true
  }
}

console.log('\n🔒 Running AltiFlow Codebase Security Guardrails Check...\n')

// --- CHECK 1: Backend Route Security Isolation (route.js) ---
const routePath = path.join(rootDir, 'app', 'api', '[[...path]]', 'route.js')
if (fs.existsSync(routePath)) {
  const routeContent = fs.readFileSync(routePath, 'utf8')

  assert(
    routeContent.includes("user.role === CLIENT_ADMIN") &&
    (routeContent.includes("!CLIENT_ROLES.includes(role)") || routeContent.includes("role !== CLIENT_USER")),
    'Backend POST /api/users Role Restriction',
    'POST /api/users must validate and restrict Client-Admin creators from assigning Owner roles.'
  )

  assert(
    routeContent.includes("assignedClientId = user.role === CLIENT_ADMIN ? (user.client_id || user.client?.id)") ||
    routeContent.includes("assignedClientId = user.role === CLIENT_ADMIN ? user.client_id"),
    'Backend Client Organization Lockdown',
    'POST /api/users must strictly lock assignedClientId to user.client_id when created by a Client-Admin.'
  )
} else {
  assert(false, 'Backend Route File Exists', 'app/api/[[...path]]/route.js not found.')
}

// --- CHECK 2: Frontend Client-Admin Isolation (app/page.js) ---
const pagePath = path.join(rootDir, 'app', 'page.js')
if (fs.existsSync(pagePath)) {
  const pageContent = fs.readFileSync(pagePath, 'utf8')

  assert(
    pageContent.includes("isClientAdminCreator = user?.role === 'Client-Admin'") ||
    pageContent.includes("allowedRoles = isClientAdminCreator"),
    'Frontend CreateUserModal Client-Admin Role Restriction',
    'CreateUserModal must detect Client-Admin creator role and restrict allowed roles to Client category.'
  )

  assert(
    pageContent.includes("isClientAdminCreator ? (user?.client_id") ||
    pageContent.includes("Locked to your org"),
    'Frontend CreateUserModal Client Organization Lockdown',
    'CreateUserModal must lock Client Organization field for Client-Admin creators.'
  )

  assert(
    pageContent.includes("confirmPassword") && pageContent.includes("newPassword !== confirmPassword"),
    'Universal Password Confirmation (Login / Recovery / Passkey)',
    'Login & Recovery forms must contain confirmPassword field and enforce password matching.'
  )

  assert(
    pageContent.includes("confirmNext") && pageContent.includes("next !== confirmNext"),
    'Force Password Change Confirmation (ChangePassword Component)',
    'ChangePassword component must contain confirmNext field and enforce matching validation.'
  )

  assert(
    pageContent.includes("recoveryUser") && (pageContent.includes("#access_token=") || pageContent.includes("access_token")),
    'Password Reset Link Recovery Interceptor',
    'app/page.js must intercept URL recovery tokens and render the dedicated Set New Password page.'
  )
} else {
  assert(false, 'Frontend Page File Exists', 'app/page.js not found.')
}

// --- CHECK 3: Branded Email Templates (supabase/templates/) ---
const inviteTemplatePath = path.join(rootDir, 'supabase', 'templates', 'invite_user.html')
if (fs.existsSync(inviteTemplatePath)) {
  const inviteContent = fs.readFileSync(inviteTemplatePath, 'utf8')

  assert(
    inviteContent.includes("Alti-FLow-Full-Logo.jpeg") || inviteContent.includes("Alti-FLow%20-%20Full%20Logo.jpeg"),
    'Email Template Logo Asset Check',
    'invite_user.html must reference the branded AltiFlow full logo image.'
  )

  assert(
    inviteContent.includes("border-radius: 14px") || inviteContent.includes("border-radius:"),
    'Email Template Squircle Styling',
    'invite_user.html must apply squircle logo styling.'
  )
} else {
  assert(false, 'Email Template Exists', 'supabase/templates/invite_user.html not found.')
}

// --- SUMMARY OUTPUT ---
console.log('\n---------------------------------------------------------')
if (hasError) {
  console.error('✕ Security Guardrails Check Failed! Fix the errors above before committing.\n')
  process.exit(1)
} else {
  console.log('✓ All AltiFlow Codebase Security Guardrails Passed Successfully!\n')
  process.exit(0)
}
