import { describe, expect, it } from "vitest"
import { parseClaudeAuthStatus, parseCodexAuthStatus } from "@/lib/agent/local-cli-detection"

describe("local CLI detection", () => {
  it("parses Codex login status without exposing credential text", () => {
    expect(parseCodexAuthStatus(true, "Logged in using an API key - gx-***")).toBe("ok")
    expect(parseCodexAuthStatus(false, "Not logged in. Run codex login.")).toBe("missing")
    expect(parseCodexAuthStatus(false, "error: unexpected argument 'status'")).toBe("unknown")
  })

  it("checks Claude missing-auth phrases before positive authenticated matches", () => {
    expect(parseClaudeAuthStatus(true, '{"loggedIn":true,"authMethod":"oauth_token"}')).toBe("ok")
    expect(parseClaudeAuthStatus(true, '{"loggedIn":false}')).toBe("missing")
    expect(parseClaudeAuthStatus(false, "Not authenticated. Run claude auth login.")).toBe("missing")
  })
})
