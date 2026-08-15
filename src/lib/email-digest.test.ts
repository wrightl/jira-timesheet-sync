import { describe, expect, it } from "vitest";
import { slackDigestToPlainText } from "@/lib/email-digest";

describe("slackDigestToPlainText", () => {
  it("strips Slack bold and emoji shortcodes", () => {
    const plain = slackDigestToPlainText(
      "*Engineering risk alerts*\n:red_circle: *Alpha* — Budget burn 95%",
    );
    expect(plain).toContain("Engineering risk alerts");
    expect(plain).toContain("Alpha — Budget burn 95%");
    expect(plain).not.toContain("*");
    expect(plain).not.toContain(":red_circle:");
  });
});
