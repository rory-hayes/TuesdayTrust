import "./globals.css"
import type { Metadata } from "next"
import { AppShell } from "../components/app-shell"

export const metadata: Metadata = {
  title: "TuesdayTrust",
  description: "Governed answers for trust reviews"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950"
    >
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
