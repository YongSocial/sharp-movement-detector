// Minimal SSE reader for TxLINE's /api/odds/stream and /api/scores/stream.
export function parseSseBlock(block) {
  const message = { data: "" };
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separatorIndex = rawLine.indexOf(":");
    const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    const value =
      separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
    if (field === "retry") message.retry = Number(value);
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

export async function* readSseMessages(response) {
  if (!response.body) throw new Error("Stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.match(/\r?\n\r?\n/);
      while (separator?.index !== undefined) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const message = parseSseBlock(block);
        if (message) yield message;
        separator = buffer.match(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    const message = parseSseBlock(buffer);
    if (message) yield message;
  } finally {
    reader.releaseLock();
  }
}

export function parseSseData(data) {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

// Connects with automatic reconnect + backoff. Calls onMessage(event, data) for each message.
export async function streamWithReconnect({ url, jwt, apiToken, onMessage, onStatus }) {
  let backoffMs = 1000;
  const maxBackoffMs = 30000;

  while (true) {
    try {
      onStatus?.("connecting");
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          "X-Api-Token": apiToken,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      onStatus?.("connected");
      backoffMs = 1000; // reset backoff on success

      for await (const message of readSseMessages(response)) {
        const data = parseSseData(message.data);
        onMessage(message.event ?? "message", data);
      }

      onStatus?.("disconnected");
    } catch (err) {
      onStatus?.("error", err);
    }

    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
  }
}
