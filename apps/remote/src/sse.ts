// Splits buffered text/event-stream input into complete frames. A frame can
// arrive split across network chunks, so the unfinished tail is handed back to
// be prepended to the next chunk.
export function takeFrames(buffer: string): { data: string[]; rest: string } {
  const data: string[] = [];
  let rest = buffer;
  let sep: number;
  while ((sep = rest.indexOf("\n\n")) !== -1) {
    const frame = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    const payload = frame
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice(6))
      .join("\n");
    if (payload) data.push(payload);
  }
  return { data, rest };
}
