import {
  Button,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text
} from "@tuesdaytrust/ui"
import Link from "next/link"
import { StatusBadge } from "../../components/status-badge"
import { sampleQuestionnaires } from "../../lib/sample-data"

export default function InboxPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level={1} className="text-zinc-950 dark:text-white">
            Questionnaire Inbox
          </Heading>
          <Text className="text-zinc-500 dark:text-zinc-400">
            Track upload status, review readiness, and confidence distribution.
          </Text>
        </div>
        <Button color="dark" href="/upload">
          Upload questionnaire
        </Button>
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Questionnaire</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Progress</TableHeader>
            <TableHeader>Auto-fill</TableHeader>
            <TableHeader>Needs review</TableHeader>
            <TableHeader>Manual</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {sampleQuestionnaires.map((item) => (
            <TableRow key={item.id} href={`/review/${item.id}`} title={item.title}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-semibold text-zinc-950 dark:text-white">{item.title}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.id}</span>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                <Text className="text-zinc-950 dark:text-white">
                  {item.progress.done} / {item.progress.total}
                </Text>
              </TableCell>
              <TableCell>{item.counts.autoFill}</TableCell>
              <TableCell>{item.counts.needsReview}</TableCell>
              <TableCell>{item.counts.manual}</TableCell>
              <TableCell>
                <Link className="text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-white dark:hover:text-zinc-200" href={`/review/${item.id}`}>
                  Open review
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
