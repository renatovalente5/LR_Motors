/* Testa o Worker sem lhe deixar tocar no GitHub: o fetch global é substituído
   por um que finge ser a API e regista tudo o que lhe foi pedido.

   Correr:  node worker/testar.mjs        (a partir da raiz do projecto)

   Não precisa de rede, de chaves nem de conta na Cloudflare, portanto pode
   correr sempre que se mexer no enviar-fotos.js. O que aqui se verifica é o
   que impede um estranho de fazer estragos: quem entra, que ficheiros passam,
   onde é que eles podem ir parar, e se o commit é mesmo um só. */
import worker from './enviar-fotos.js';

const SENHA = 'uma-senha-comprida-de-teste-123456';
const ambiente = { GITHUB_TOKEN: 'ghp_falso', SENHA };
const ORIGEM = 'https://lrmotorsautomoveis.pt';

let chamadas = [];
let falharCom = null;

globalThis.fetch = async (url, opcoes = {}) => {
  const caminho = String(url).replace('https://api.github.com', '');
  /* O corpo do /git/blobs é agora um ReadableStream — o Worker monta o JSON à
     volta da fotografia enquanto ela passa, sem a juntar em memória. Aqui
     lê-se até ao fim, que é a única forma de confirmar que o JSON sai bem
     formado e com a fotografia inteira lá dentro. */
  let corpo = null;
  if (opcoes.body instanceof ReadableStream) {
    corpo = JSON.parse(await new Response(opcoes.body).text());
  } else if (opcoes.body) {
    corpo = JSON.parse(opcoes.body);
  }
  chamadas.push({ caminho, metodo: opcoes.method || 'GET', corpo });
  if (falharCom) return new Response(JSON.stringify({ message: 'nope' }), { status: falharCom });
  const r = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (caminho.endsWith('/git/blobs')) return r({ sha: 'a'.repeat(40) });
  if (caminho.includes('/git/ref/heads/')) return r({ object: { sha: 'b'.repeat(40) } });
  if (caminho.includes('/git/commits/')) return r({ tree: { sha: 'c'.repeat(40) } });
  if (caminho.endsWith('/git/trees')) return r({ sha: 'd'.repeat(40) });
  if (caminho.endsWith('/git/commits')) return r({ sha: 'e'.repeat(40) });
  if (caminho.includes('/git/refs/heads/')) return r({ ok: true });
  return r({});
};

const b64 = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');
const JPEG = b64([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6, 7, 8]);
const PNG = b64([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]);
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
const PDF = b64([0x25, 0x50, 0x44, 0x46, 0x2D, 1, 2, 3]);
const SVG = b64([...Buffer.from('<svg onload="alert(1)"></svg>')]);

/* O /blob tem um contrato diferente do resto: o corpo é o base64 em cru e o
   nome e a senha vão em cabeçalhos. Não é preciosismo — é o que impede o Worker
   de ter de ler a fotografia para memória e rebentar os 10 ms de CPU do plano
   gratuito da Cloudflare. Ver o comentário em guardarBlob(). */
async function pedir(rota, corpo, cabecalhos = { Origin: ORIGEM }) {
  chamadas = [];
  const req = rota === '/blob'
    ? new Request('https://w.workers.dev/blob', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          /* O browser não põe Content-Length no objecto Request — quem o põe é
             a rede, ao enviar — mas o Worker recebe-o sempre. Sem ele aqui, o
             teste não exercitava o mesmo caminho que a produção. Confirmado
             contra o Worker a sério: 9 MB devolvem 413. */
          'Content-Length': String((corpo.conteudo ?? '').length),
          ...(corpo.senha === undefined ? {} : { 'X-Senha': corpo.senha }),
          'X-Nome': corpo.nome ?? '',
          ...cabecalhos,
        },
        body: corpo.conteudo ?? '',
      })
    : new Request('https://w.workers.dev' + rota, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecalhos },
        body: JSON.stringify(corpo),
      });
  const res = await worker.fetch(req, ambiente);
  return { estado: res.status, corpo: await res.json().catch(() => ({})), cors: res.headers.get('Access-Control-Allow-Origin') };
}

let passou = 0, falhou = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) { passou++; console.log(`  ok   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
};

console.log('\n— autenticação —');
ok('senha errada = 401', (await pedir('/blob', { senha: 'x', nome: 'a.jpg', conteudo: JPEG })).estado === 401);
ok('sem senha = 401', (await pedir('/blob', { nome: 'a.jpg', conteudo: JPEG })).estado === 401);
ok('senha certa passa', (await pedir('/blob', { senha: SENHA, nome: 'a.jpg', conteudo: JPEG })).estado === 200);
{
  const r = await pedir('/blob', { senha: SENHA, nome: 'a.jpg', conteudo: JPEG }, { Origin: 'https://mau.example' });
  ok('outra origem = 403', r.estado === 403);
}
{
  const r = await pedir('/rota-que-nao-existe', { senha: SENHA });
  ok('rota desconhecida = 404', r.estado === 404);
}
{
  const res = await worker.fetch(new Request('https://w.workers.dev/blob', { method: 'GET' }), ambiente);
  ok('GET = 405', res.status === 405);
}

console.log('\n— que ficheiros entram —');
for (const [nome, conteudo, esperado] of [
  ['foto.jpg', JPEG, 200], ['foto.jpeg', JPEG, 200], ['foto.png', PNG, 200], ['foto.webp', WEBP, 200],
  ['foto.pdf', PDF, 400], ['foto.svg', SVG, 400],
  ['mentira.jpg', PDF, 400],            // extensão certa, conteúdo não
  ['mentira.jpg', SVG, 400],            // SVG disfarçado: seria XSS servido do domínio
  ['script.js', JPEG, 400], ['.htaccess', JPEG, 400], ['sem-extensao', JPEG, 400],
  ['../../../scripts/gerar.mjs', JPEG, 400],
  ['..%2F..%2Fx.jpg', JPEG, 400],
  ['a/b.jpg', JPEG, 400],
]) {
  const r = await pedir('/blob', { senha: SENHA, nome, conteudo });
  ok(`${nome.padEnd(28)} -> ${r.estado}`, r.estado === esperado, JSON.stringify(r.corpo));
}
{
  const grande = Buffer.concat([Buffer.from([0xFF,0xD8,0xFF]), Buffer.alloc(9 * 1024 * 1024)]).toString('base64');
  ok('ficheiro > 8 MB = 413', (await pedir('/blob', { senha: SENHA, nome: 'g.jpg', conteudo: grande })).estado === 413);

  /* E se não vier Content-Length nenhum, o corte tem de acontecer à mesma —
     conta-se o que passa e trava-se a meio. */
  const semTamanho = await worker.fetch(new Request('https://w.workers.dev/blob', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-Senha': SENHA, 'X-Nome': 'g.jpg', Origin: ORIGEM },
    body: grande,
  }), ambiente);
  ok('sem Content-Length, grande de mais é travado', semTamanho.status >= 400,
     `foi ${semTamanho.status}`);
}

console.log('\n— nome da pasta —');
const SHA = 'a'.repeat(40);
for (const [pasta, esperado] of [
  ['carro-01', 200], ['bmw-serie-3', 200], ['a', 200],
  ['../scripts', 400], ['..', 400], ['a/b', 400], ['Carro', 400], ['carro 01', 400],
  ['carro.01', 400], ['-carro', 400], ['carro-', 400], ['', 400], ['x'.repeat(61), 400],
  ['assets', 200],
]) {
  const r = await pedir('/commit', { senha: SENHA, pasta, ficheiros: [{ nome: 'a.jpg', sha: SHA }] });
  ok(`pasta ${JSON.stringify(pasta).padEnd(24)} -> ${r.estado}`, r.estado === esperado, JSON.stringify(r.corpo));
}

console.log('\n— o commit —');
{
  const fs = [{ nome: '01.jpg', sha: 'a'.repeat(40) }, { nome: '02.jpg', sha: 'b'.repeat(40) }];
  const r = await pedir('/commit', { senha: SENHA, pasta: 'bmw-serie-3', ficheiros: fs });
  ok('grava e devolve 200', r.estado === 200, JSON.stringify(r.corpo));
  const arvore = chamadas.find((c) => c.caminho.endsWith('/git/trees'));
  const commits = chamadas.filter((c) => c.caminho.endsWith('/git/commits') && c.metodo === 'POST');
  ok('UM só commit', commits.length === 1, `foram ${commits.length}`);
  ok('caminhos presos a assets/veiculos/<pasta>/',
    arvore.corpo.tree.every((t) => t.path.startsWith('assets/veiculos/bmw-serie-3/')),
    JSON.stringify(arvore.corpo.tree.map((t) => t.path)));
  ok('modo de ficheiro normal (não executável, não link)',
    arvore.corpo.tree.every((t) => t.mode === '100644'));
  ok('assenta na árvore actual (não apaga o resto)', arvore.corpo.base_tree === 'c'.repeat(40));
  const ref = chamadas.find((c) => c.metodo === 'PATCH');
  ok('actualiza a ref sem force', ref && ref.corpo.force === false);
}
{
  const r = await pedir('/commit', { senha: SENHA, pasta: 'x', ficheiros: [{ nome: 'a.jpg', sha: 'nao-e-sha' }] });
  ok('sha inválido = 400', r.estado === 400);
}
{
  const r = await pedir('/commit', {
    senha: SENHA, pasta: 'x',
    ficheiros: [{ nome: 'a.jpg', sha: SHA }, { nome: 'A.JPG', sha: SHA }],
  });
  ok('dois nomes iguais = 400', r.estado === 400, JSON.stringify(r.corpo));
}
{
  const muitos = Array.from({ length: 51 }, (_, i) => ({ nome: `${i}.jpg`, sha: SHA }));
  ok('mais de 50 = 400', (await pedir('/commit', { senha: SENHA, pasta: 'x', ficheiros: muitos })).estado === 400);
}
{
  const r = await pedir('/commit', { senha: SENHA, pasta: 'x', ficheiros: [] });
  ok('lista vazia = 400', r.estado === 400);
}

console.log('\n— quando o GitHub falha —');
falharCom = 409;
{
  const r = await pedir('/commit', { senha: SENHA, pasta: 'x', ficheiros: [{ nome: 'a.jpg', sha: SHA }] });
  ok('conflito = 409 com conselho útil', r.estado === 409 && /outra vez/.test(r.corpo.erro), JSON.stringify(r.corpo));
}
falharCom = 500;
{
  const r = await pedir('/commit', { senha: SENHA, pasta: 'x', ficheiros: [{ nome: 'a.jpg', sha: SHA }] });
  ok('avaria = 502 sem revelar detalhes', r.estado === 502 && !/github/i.test(r.corpo.erro), JSON.stringify(r.corpo));
}
falharCom = null;

console.log('\n— configuração em falta —');
{
  const res = await worker.fetch(
    new Request('https://w.workers.dev/blob', { method: 'POST', body: '{}' }), { SENHA: 'x' });
  /* 503 e não 500: a Cloudflare troca o corpo das respostas 500 pela sua
     própria página de erro e a mensagem em JSON nunca chegaria à página. */
  ok('sem GITHUB_TOKEN = 503', res.status === 503, `foi ${res.status}`);
}

console.log(`\n${passou} passaram · ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
