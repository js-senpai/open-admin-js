import { describe, expect, it, vi } from "vitest";
import type { MailDriver, MailMessage, SentInfo } from "./index";

describe("mail types", () => {
  it("allows a driver implementation to send messages", async () => {
    const sent: MailMessage[] = [];
    const driver: MailDriver = {
      send: vi.fn(async (message: MailMessage) => {
        sent.push(message);
        const accepted = Array.isArray(message.to) ? message.to : [message.to];
        return {
          messageId: "test-message-id",
          accepted
        } satisfies SentInfo;
      })
    };

    await driver.send({ to: "a@b.com", subject: "Hi", template: "welcome", data: { name: "x" } });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("a@b.com");
  });
});
