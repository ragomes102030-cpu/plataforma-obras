/**
 * A final response can follow a server-side write performed by the agent.
 * Only successfully completed operational runs can leave project queries stale.
 */
export function deveRevalidarDadosDaObraAposExecucao(run: {
  status: string;
  readOnly: boolean | null;
}): boolean {
  return run.status === "respondido" && run.readOnly === false;
}
