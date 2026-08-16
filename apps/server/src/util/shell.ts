export async function run(cmd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`${cmd} exited ${code}: ${stderr.trim()}`);
  }
  return stdout;
}

export async function runOrEmpty(cmd: string, args: string[]): Promise<string> {
  try {
    return await run(cmd, args);
  } catch {
    return "";
  }
}
