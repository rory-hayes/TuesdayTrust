import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConfidenceBadge } from "../components/confidence-badge"
import { StatusBadge } from "../components/status-badge"
import { ScopeChip } from "../components/scope-chip"
import { ReviewQueueRow } from "../components/review-queue-row"
import { AnswerCard } from "../components/answer-card"
import { RoiTile } from "../components/roi-tile"
import { ConfidenceBucket, QuestionnaireStatus } from "@tuesdaytrust/shared"


describe("UI badges", () => {
  it("renders confidence badge label", () => {
    render(<ConfidenceBadge bucket={ConfidenceBucket.AUTO_FILL} />)
    expect(screen.getByText("Auto-fill")).toBeInTheDocument()
  })

  it("renders status badge label", () => {
    render(<StatusBadge status={QuestionnaireStatus.READY_FOR_REVIEW} />)
    expect(screen.getByText("ready for review")).toBeInTheDocument()
  })
})

describe("UI components", () => {
  it("renders scope chip label", () => {
    render(<ScopeChip label="Core Platform" status="match" />)
    expect(screen.getByText("Core Platform")).toBeInTheDocument()
  })

  it("renders review queue row", () => {
    render(<ReviewQueueRow question="Do you encrypt data?" bucket={ConfidenceBucket.AUTO_FILL} />)
    expect(screen.getByText("Do you encrypt data?")).toBeInTheDocument()
    expect(screen.getByText("Auto-fill")).toBeInTheDocument()
  })

  it("renders active review queue row", () => {
    render(
      <ReviewQueueRow
        question="Is data encrypted at rest?"
        bucket={ConfidenceBucket.NEEDS_REVIEW}
        active
      />
    )
    expect(screen.getByText("Is data encrypted at rest?")).toBeInTheDocument()
    expect(screen.getByText("Needs review")).toBeInTheDocument()
  })

  it("renders answer card metadata", () => {
    render(
      <AnswerCard
        title="Encryption at Rest"
        body="All data is encrypted at rest."
        owner="Jordan Lee"
        lastReviewed="2026-01-12"
        usageCount={12}
        scope={{ products: ["Core"], regions: ["Global"], tiers: ["Enterprise"] }}
        evidence={[{ title: "Encryption Standard" }]}
      />
    )
    expect(screen.getByText("Encryption at Rest")).toBeInTheDocument()
    expect(screen.getByText(/Owner: Jordan Lee/)).toBeInTheDocument()
  })

  it("renders answer card without evidence", () => {
    render(
      <AnswerCard
        title="Backup Policy"
        body="Backups run nightly."
        owner="Ava Ortiz"
        lastReviewed="2026-01-05"
        usageCount={4}
        scope={{ products: ["Core"], regions: ["Global"], tiers: ["SMB"] }}
      />
    )
    expect(screen.getByText("Backup Policy")).toBeInTheDocument()
    expect(screen.queryByText("Evidence")).not.toBeInTheDocument()
  })

  it("renders ROI tile", () => {
    render(<RoiTile label="Auto-fill rate" value="78%" helper="Test helper" />)
    expect(screen.getByText("Auto-fill rate")).toBeInTheDocument()
    expect(screen.getByText("78%")).toBeInTheDocument()
  })

  it("renders ROI tile without helper", () => {
    render(<RoiTile label="Time saved" value="12 hours" />)
    expect(screen.getByText("Time saved")).toBeInTheDocument()
    expect(screen.getByText("12 hours")).toBeInTheDocument()
    expect(screen.queryByText("Test helper")).not.toBeInTheDocument()
  })
})
