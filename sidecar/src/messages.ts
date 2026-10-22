export function titleFromMessages(messages: unknown[]): string {
  for (const message of messages as Array<{
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  }>) {
    if (message.role !== "user") continue;
    if (typeof message.content === "string") {
      const value = message.content.trim();
      if (value.length > 0) return value.slice(0, 80);
    }
    if (Array.isArray(message.content)) {
      const value = message.content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (value.length > 0) return value.slice(0, 80);
    }
  }
  return "New session";
}
