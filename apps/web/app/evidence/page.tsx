import { Button, Heading, Text } from "@tuesdaytrust/ui"

export default function EvidencePage() {
  return (
    <div className="space-y-6">
      <Heading level={1} className="text-zinc-950 dark:text-white">
        Evidence
      </Heading>
      <Text className="text-zinc-500 dark:text-zinc-400">
        Upload or link evidence to support canonical answers. Access is controlled per item.
      </Text>
      <Button color="dark">Add evidence</Button>
    </div>
  )
}
