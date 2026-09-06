// Wrangler's CLI accepts SQL files, not bound parameters. Never invoke a shell.
export function sqlString(value: string): string {
  if (value.includes(String.fromCharCode(0)))
    throw new Error("SQL strings cannot contain NUL");
  return `'${value.replaceAll("'", "''")}'`;
}
