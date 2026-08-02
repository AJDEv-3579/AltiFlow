export const ROLES = {
  SUPER_ADMIN: 'Super-Admin',
  ADMIN: 'Admin',
  CLIENT_ADMIN: 'Client-Admin',
  CLIENT_USER: 'Client-User',
}

export const INTERNAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN]
export const CLIENT_ROLES = [ROLES.CLIENT_ADMIN, ROLES.CLIENT_USER]

export function isInternalRole(role) {
  return INTERNAL_ROLES.includes(role)
}

export function isClientRole(role) {
  return CLIENT_ROLES.includes(role)
}

export function isAdminRole(role) {
  return [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CLIENT_ADMIN].includes(role)
}
