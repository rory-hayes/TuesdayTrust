import { OrgRole } from "@tuesdaytrust/shared"

const uploadRoles = new Set([OrgRole.ADMIN, OrgRole.EDITOR])
const editRoles = new Set([OrgRole.ADMIN, OrgRole.EDITOR])
const reviewRoles = new Set([OrgRole.ADMIN, OrgRole.REVIEWER])
const liveQuestionRoles = new Set([OrgRole.ADMIN, OrgRole.EDITOR, OrgRole.REVIEWER])
const settingsRoles = new Set([OrgRole.ADMIN])

function normalizeRole(role?: OrgRole | null) {
  return role ?? OrgRole.VIEWER
}

export function canUploadQuestionnaires(role?: OrgRole | null) {
  return uploadRoles.has(normalizeRole(role))
}

export function canEditAnswers(role?: OrgRole | null) {
  return editRoles.has(normalizeRole(role))
}

export function canCreateAnswer(role?: OrgRole | null) {
  return editRoles.has(normalizeRole(role))
}

export function canReviewAnswers(role?: OrgRole | null) {
  return reviewRoles.has(normalizeRole(role))
}

export function canUseLiveQuestion(role?: OrgRole | null) {
  return liveQuestionRoles.has(normalizeRole(role))
}

export function canAccessSettings(role?: OrgRole | null) {
  return settingsRoles.has(normalizeRole(role))
}

export function canRequeueJobs(role?: OrgRole | null) {
  return reviewRoles.has(normalizeRole(role))
}
