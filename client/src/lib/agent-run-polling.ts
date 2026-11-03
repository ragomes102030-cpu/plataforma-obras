type RunStatus = { status: string };

type PollOptions = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  limitMs?: number;
  intervalMs?: number;
};

/** O servidor encerra a execução em 120 s por padrão; a janela aguarda a gravação do estado terminal. */
export async function acompanharRun<T extends RunStatus>(
  consultar: () => Promise<T | null>,
  terminal: (status: string) => boolean,
  options: PollOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const inicio = now();
  const limite = options.limitMs ?? 150_000;
  const intervalo = options.intervalMs ?? 1_500;
  let errosConsecutivos = 0;

  for (;;) {
    try {
      const run = await consultar();
      errosConsecutivos = 0;
      if (run && terminal(run.status)) return run;
    } catch {
      errosConsecutivos += 1;
      if (errosConsecutivos >= 3) throw new Error("Falha repetida ao consultar a execução do Arquimedes.");
    }
    if (now() - inicio >= limite) throw new Error("A execução não retornou um estado final dentro do tempo de acompanhamento.");
    await sleep(intervalo);
  }
}
