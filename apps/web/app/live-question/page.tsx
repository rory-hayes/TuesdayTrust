"use client"

import React from "react"
import { Button, Divider, Heading, Input, Text, Textarea } from "@tuesdaytrust/ui"
import { ConfidenceBadge } from "../../components/confidence-badge"
import { sampleLiveQuestionHistory, sampleLiveQuestionSuggestion } from "../../lib/sample-data"
import { canUseLiveQuestion } from "../../lib/permissions"
import { useWorkspace } from "../../lib/use-workspace"

export default function LiveQuestionPage() {
  const [questionText, setQuestionText] = React.useState("")
  const [showSuggestion, setShowSuggestion] = React.useState(false)
  const { role, workspaceId } = useWorkspace()
  const canUse = canUseLiveQuestion(role) && Boolean(workspaceId)

  const suggestion = showSuggestion ? sampleLiveQuestionSuggestion : null

  return (
    <div className="space-y-8">
      <div>
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Live Question Mode
        </Heading>
        <Text className="text-zinc-600 dark:text-zinc-400">
          Paste portal questions, get a suggested answer, and save the mapping for reuse.
        </Text>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="space-y-6">
          <form
            className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900"
            onSubmit={(event) => {
              event.preventDefault()
              if (!canUse) return
              if (questionText.trim().length > 0) {
                setShowSuggestion(true)
              }
            }}
          >
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Portal question
            </Text>
            <Textarea
              className="mt-3"
              rows={5}
              placeholder="Paste the portal question here"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              disabled={!canUse}
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Section
                </Text>
                <Input className="mt-2" placeholder="Access control" disabled={!canUse} />
              </div>
              <div>
                <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Constraint
                </Text>
                <Input className="mt-2" placeholder="Max 500 characters" disabled={!canUse} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" color="dark" disabled={!canUse}>
                Get suggestion
              </Button>
              <Button outline type="button" disabled={!canUse}>Clear</Button>
            </div>
            {!canUse ? (
              <Text className="mt-3 text-sm text-amber-600">
                {!workspaceId
                  ? "Select a workspace to use Live Question Mode."
                  : "Your role does not permit Live Question Mode."}
              </Text>
            ) : null}
          </form>

          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Suggested answer
                </Text>
                <Heading level={3} className="mt-2 text-zinc-950 dark:text-white">
                  {suggestion ? "Suggested response" : "No suggestion yet"}
                </Heading>
              </div>
              <div>
                <ConfidenceBadge
                  bucket={suggestion?.bucket ?? sampleLiveQuestionSuggestion.bucket}
                />
              </div>
            </div>
            <Divider className="my-4 border-zinc-950/10 dark:border-white/10" />
            <Text className="text-zinc-950 dark:text-white">
              {suggestion
                ? suggestion.answer
                : "Submit a portal question to retrieve the best matching approved answer."}
            </Text>
            <div className="mt-4 space-y-2">
              <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Evidence
              </Text>
              <ul className="space-y-1 text-sm text-zinc-950 dark:text-white">
                {(suggestion?.evidence ?? []).map((item) => (
                  <li key={item.title}>{item.title}</li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button color="dark" type="button" disabled={!canUse}>
                Copy answer
              </Button>
              <Button outline type="button" disabled={!canUse}>Accept + save mapping</Button>
              <Button outline type="button" disabled={!canUse}>Edit answer</Button>
              <Button outline type="button" disabled={!canUse}>New answer needed</Button>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Recent portal questions
            </Text>
            <Divider className="my-3 border-zinc-950/10 dark:border-white/10" />
            <div className="space-y-4">
              {sampleLiveQuestionHistory.map((item) => (
                <div key={item.id} className="space-y-1">
                  <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
                    {item.question}
                  </Text>
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                    {item.action} • {item.time}
                  </Text>
                  <Text className="text-sm text-zinc-950 dark:text-white">{item.answer}</Text>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
