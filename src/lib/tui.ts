import { confirm, intro, isCancel, outro, select, spinner, text } from "@clack/prompts";
import pc from "picocolors";
import { CliError } from "./errors.js";
import { isInteractive } from "./context.js";
import type { GlobalFlags } from "./context.js";

export type Spin = ReturnType<typeof spinner>;

/** Branded clack intro banner (Vercel-style). */
export function brandIntro(): void {
  intro(pc.bgYellow(pc.black(" PocketStack ")));
}

/** Branded clack outro line. */
export function brandOutro(message: string): void {
  outro(message);
}

/**
 * Run an async task behind a spinner when interactive; otherwise just run it.
 * The task receives the spinner handle (or undefined) so it can update text.
 */
export async function withSpinner<T>(
  flags: GlobalFlags,
  message: string,
  task: (spin?: Spin) => Promise<T>,
): Promise<T> {
  if (!isInteractive(flags)) return task(undefined);
  const spin = spinner();
  spin.start(message);
  try {
    const result = await task(spin);
    spin.stop(message);
    return result;
  } catch (err) {
    spin.stop(message);
    throw err;
  }
}

/** Yes/no prompt that throws a (cancelled) CliError if the user aborts. */
export async function promptConfirm(message: string): Promise<boolean> {
  const value = await confirm({ message });
  if (isCancel(value)) throw new CliError("Cancelled.", 130);
  return value;
}

/** Free-text prompt that throws a (cancelled) CliError if the user aborts. */
export async function promptText(message: string, placeholder?: string): Promise<string> {
  const value = await text({ message, placeholder });
  if (isCancel(value)) throw new CliError("Cancelled.", 130);
  return value;
}

/** Single-choice prompt that throws a (cancelled) CliError if the user aborts. */
export async function promptSelect<T>(
  message: string,
  options: { value: T; label: string; hint?: string }[],
): Promise<T> {
  // clack's `Option<Value>` is a conditional type that won't resolve against an
  // abstract generic, so cast the (structurally identical) options array.
  const value = await select<T>({
    message,
    options: options as unknown as Parameters<typeof select<T>>[0]["options"],
  });
  if (isCancel(value)) throw new CliError("Cancelled.", 130);
  return value as T;
}
