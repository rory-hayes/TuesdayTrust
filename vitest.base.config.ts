export const baseTestConfig = {
  include: ["tests/**/*.test.{ts,tsx}"],
  globals: true
}

export const baseCoverageConfig = {
  provider: "v8",
  reporter: ["text", "json-summary"],
  lines: 95,
  statements: 95,
  functions: 95,
  branches: 95,
  all: false
}
