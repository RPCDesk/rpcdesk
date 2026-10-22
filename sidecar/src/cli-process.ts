import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createLineReader } from "./transport";

export interface CliProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  onLine: (line: string) => void;
  onExit: (code: number | null) => void;
}

export class CliProcess {
  private child: ChildProcessWithoutNullStreams;
  private reader;
  private options: CliProcessOptions;
  private stopping = false;
  private finished = false;
  private stderrLines: string[] = [];
  private exited: Promise<number | null>;
  private resolveExit!: (code: number | null) => void;

  constructor(options: CliProcessOptions) {
    this.options = options;
    this.reader = createLineReader((line) => this.options.onLine(line));
    this.exited = new Promise((resolve) => {
      this.resolveExit = resolve;
    });

    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stdout.on("data", (chunk: Buffer) => this.reader.push(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text.length === 0) return;
      console.error(`[cli] ${text}`);
      this.stderrLines.push(text);
      if (this.stderrLines.length > 8) this.stderrLines.shift();
    });
    this.child.on("error", (error) => {
      console.error(`[cli] spawn failed: ${error.message}`);
      this.finish(null);
    });
    this.child.on("exit", (code) => {
      this.reader.flush();
      this.finish(code);
    });
  }

  stderrTail(): string | undefined {
    const text = this.stderrLines.join("\n").trim();
    return text.length > 0 ? text : undefined;
  }

  private finish(code: number | null): void {
    if (this.finished) return;
    this.finished = true;
    this.resolveExit(code);
    if (!this.stopping) this.options.onExit(code);
  }

  send(value: unknown): void {
    if (!this.child.stdin.writable) {
      throw new Error("CLI process is not accepting input");
    }
    this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  async stop(): Promise<number | null> {
    if (this.stopping) return this.exited;
    this.stopping = true;
    try {
      this.child.stdin.end();
    } catch {
      // stdin may already be closed
    }
    const timer = setTimeout(() => {
      this.child.kill("SIGTERM");
      setTimeout(() => this.child.kill("SIGKILL"), 1000);
    }, 1500);
    const code = await this.exited;
    clearTimeout(timer);
    return code;
  }
}
