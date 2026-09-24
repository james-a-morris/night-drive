// Keep credentials, SQL parameters and database error details out of logs.
// SQLSTATE/network codes identify failures without exposing rider data.
export function errorDiagnostic(error: unknown): object {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code = "code" in error ? error.code : undefined;
  return {
    name: error.name,
    ...(typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
      ? { code }
      : {}),
    ...(error.cause ? { cause: errorDiagnostic(error.cause) } : {}),
  };
}
