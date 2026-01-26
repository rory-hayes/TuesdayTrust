import { ConfidenceBucket, QuestionnaireStatus } from "@tuesdaytrust/shared"

export const sampleQuestionnaires = [
  {
    id: "q-001",
    title: "Acme Security Questionnaire",
    status: QuestionnaireStatus.READY_FOR_REVIEW,
    progress: { done: 124, total: 180 },
    counts: {
      autoFill: 98,
      needsReview: 22,
      manual: 4
    }
  },
  {
    id: "q-002",
    title: "Globex Vendor Review",
    status: QuestionnaireStatus.PARSING,
    progress: { done: 0, total: 220 },
    counts: {
      autoFill: 0,
      needsReview: 0,
      manual: 0
    }
  },
  {
    id: "q-003",
    title: "Initech 2025 DDQ",
    status: QuestionnaireStatus.COMPLETED,
    progress: { done: 210, total: 210 },
    counts: {
      autoFill: 180,
      needsReview: 20,
      manual: 10
    }
  }
]

export const sampleReviewQueue = [
  {
    id: "r-001",
    question: "Do you enforce MFA for administrator access?",
    suggestion: "We enforce MFA for all administrator access.",
    bucket: ConfidenceBucket.AUTO_FILL,
    reasons: {
      vector_similarity: 0.9,
      scope_match: true,
      freshness_days: 32
    },
    answer: {
      id: "a-001",
      title: "MFA for Admin Access",
      body: "We enforce MFA for all administrator access.",
      owner: "Jordan Lee",
      lastReviewed: "2026-01-12",
      usageCount: 18,
      scope: {
        products: ["Core Platform"],
        regions: ["Global"],
        tiers: ["Enterprise"]
      },
      evidence: [
        { title: "Access Control Policy", url: "https://example.com/policies/mfa" }
      ]
    }
  },
  {
    id: "r-002",
    question: "Describe your incident response process.",
    suggestion: "We maintain a documented incident response plan with quarterly tabletop exercises.",
    bucket: ConfidenceBucket.NEEDS_REVIEW,
    reasons: {
      vector_similarity: 0.72,
      scope_match: true,
      freshness_days: 120
    },
    answer: {
      id: "a-002",
      title: "Incident Response",
      body: "We maintain a documented incident response plan with quarterly tabletop exercises.",
      owner: "Alex Park",
      lastReviewed: "2025-10-03",
      usageCount: 6,
      scope: {
        products: ["Core Platform"],
        regions: ["US"],
        tiers: ["Mid-market"]
      },
      evidence: [
        { title: "IR Runbook", url: "https://example.com/runbooks/ir" }
      ]
    }
  },
  {
    id: "r-003",
    question: "What is your RTO for critical services?",
    suggestion: "",
    bucket: ConfidenceBucket.MANUAL,
    reasons: {
      vector_similarity: 0.2,
      scope_match: false,
      freshness_days: 365
    },
    answer: null
  }
]

export const sampleAnswers = [
  {
    id: "a-001",
    title: "MFA for Admin Access",
    status: "APPROVED",
    owner: "Jordan Lee",
    lastReviewed: "2026-01-12",
    usageCount: 18,
    scope: {
      products: ["Core Platform"],
      regions: ["Global"],
      tiers: ["Enterprise"]
    }
  },
  {
    id: "a-002",
    title: "Incident Response",
    status: "DRAFT",
    owner: "Alex Park",
    lastReviewed: "2025-10-03",
    usageCount: 6,
    scope: {
      products: ["Core Platform"],
      regions: ["US"],
      tiers: ["Mid-market"]
    }
  },
  {
    id: "a-003",
    title: "Disaster Recovery",
    status: "APPROVED",
    owner: "Priya Shah",
    lastReviewed: "2025-11-20",
    usageCount: 9,
    scope: {
      products: ["Core Platform"],
      regions: ["EU"],
      tiers: ["Enterprise"]
    }
  }
]

export const sampleDuplicateAnswers = [
  {
    id: "dup-001",
    primary: { id: "a-001", title: "MFA for Admin Access" },
    duplicate: { id: "a-014", title: "Admin MFA Requirement" },
    similarity: 0.83
  },
  {
    id: "dup-002",
    primary: { id: "a-010", title: "Encryption at Rest" },
    duplicate: { id: "a-011", title: "Data at Rest Encryption" },
    similarity: 0.79
  }
]

export const sampleExpiringAnswers = [
  {
    id: "exp-001",
    title: "Access Reviews",
    owner: "Jordan Lee",
    lastReviewed: "2025-10-01",
    dueInDays: 9
  },
  {
    id: "exp-002",
    title: "Vendor Risk Management",
    owner: "Alex Park",
    lastReviewed: "2025-09-20",
    dueInDays: 3
  }
]

export const sampleRoiMetrics = {
  autoFillRate: 0.74,
  timeSavedHours: 18.5,
  avgCompletionTimeHours: 5.2,
  autoFillCount: 312,
  totalSuggestions: 420
}

export const sampleLiveQuestionSuggestion = {
  question: "Do you encrypt customer data at rest?",
  answer: "Yes. Customer data is encrypted at rest using AES-256 in our primary data stores.",
  bucket: ConfidenceBucket.NEEDS_REVIEW,
  reasons: {
    vector_similarity: 0.76,
    scope_match: true,
    freshness_days: 45
  },
  evidence: [{ title: "Encryption Standard", url: "https://example.com/policies/encryption" }]
}

export const sampleLiveQuestionHistory = [
  {
    id: "lq-001",
    question: "Do you enforce MFA for administrators?",
    action: "accepted",
    answer: "We enforce MFA for all administrator access.",
    time: "2 hours ago"
  },
  {
    id: "lq-002",
    question: "What is your incident response cadence?",
    action: "edited",
    answer: "We run quarterly tabletop exercises and update runbooks annually.",
    time: "Yesterday"
  }
]
