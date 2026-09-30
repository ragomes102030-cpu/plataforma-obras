// Vigia o deploy e confirma que a versão que subiu é a que foi commitada.
//
// POR QUE ISTO EXISTE
//
// A Railway mantém o último deploy com SUCCESS em produção, e o `healthz`
// responde `ok: true` mesmo quando a versão que está no ar é antiga. Descobri
// deploy quebrado e versão desatualizada só porque o dono avisou. Verificar o
// SHA depois de cada push é o que fecha esse buraco.
//
// POR QUE OS COMENTÁRIOS SÃO COM `//` E NÃO COM `#`
//
// Neste ambiente, Node 24.21.0lan SyntaxError num arquivo `.mjs` cuja
// primeira linha começa com `#`. A primeira versão deste arquivo usou `#`, e
// o erro aponta a PRIMEIRA linha, com o caret embaixo do `#`:
//
//   # Vigia o deploy e confirma...
//   ^
//   SyntaxError: Invalid or unexpected token
//
// Um arquivo de duas linhas com `# x` seguido de `console.log(1)` reproduz, e
// o mesmo arquivo com `// x` roda. O `migrate-core.mjs` — que roda dentro do
// container em produção — começa com `/**`, e passa. A lição vale para os
// scripts deste repo, não só para este.
//
// Uso:
//   node scripts/verificar-deploy.mjs <sha-esperado> [tentativas] [intervaloMs]
// Exemplo:
//   node scripts/verificar-deploy.mjs 32fcf3a 20 15000

const esperado = (process.argv[2] ?? "").toLowerCase();
const tentativas = Number(process.argv[3] ?? 20);
const intervalo = Number(process.argv[4] ?? 15000);

// A URL do ar.
//
// Este valor era a da Railway (`plataforma-obras-staging-production.up.railway.app`),
// de um servico que nao existe mais. O script nao accusava: ele ficava em
// `TIMEOUT` vinte vezes, dando a impressao de que o deploy estava lento, quando
// o que faltava era um host que responde.
//
// A environment `PLATAFORMA_HEALTHZ` continua valendo e tem precedencia, para
// quem conferir um ambiente que nao seja producao.
const HEALTHZ =
  process.env.PLATAFORMA_HEALTHZ ??
  "https://plataforma-obras-api.onrender.com/healthz";

if (!/^[0-9a-f]{7,40}$/.test(esperado)) {
  console.error(`SHA invalido: "${esperado}". Use de 7 a 40 caracteres hex.`);
  process.exit(2);
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
  let corpo = null;
  let erro = null;

  try {
    const resposta = await fetch(HEALTHZ, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (resposta.ok) corpo = await resposta.json();
    else erro = `HTTP ${resposta.status}`;
  } catch (e) {
    erro = e?.message ?? String(e);
  }

  const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
  const emProducao = (corpo?.commit ?? "").toLowerCase();

  if (corpo && emProducao.startsWith(esperado.slice(0, 7))) {
    console.log(
      `${agora}  CONFIRMADO  ${emProducao.slice(0, 7)} no ar (esperado ${esperado.slice(0, 7)})`
    );
    console.log(`             uptime ${corpo.uptimeSeconds}s - ok ${corpo.ok}`);
    process.exit(0);
  }

  if (tentativa === tentativas) {
    console.error(`${agora}  NAO CONFIRMADO apos ${tentativas} tentativas.`);
    console.error(`             em producao: ${emProducao || "(sem resposta)"}`);
    console.error(`             esperado:     ${esperado}`);
    if (erro) console.error(`             ultimo erro:  ${erro}`);
    process.exit(1);
  }

  console.log(
    `${agora}  aguardando  ${tentativa}/${tentativas} - em producao: ${
      emProducao ? emProducao.slice(0, 7) : (erro ?? "sem resposta")
    }`
  );
  await dormir(intervalo);
}
