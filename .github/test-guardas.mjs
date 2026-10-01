#!/usr/bin/env node
/* A BATERIA DA GUARDA DO CONTEÚDO E DO CI.
 *
 * Corre em local (não no CI: afirma coisas sobre os dados de HOJE, e uma
 * viatura mal preenchida pelo dono não pode parar a publicação por causa de um
 * teste).
 *
 *     PYTHON=<python com Pillow> node .github/test-guardas.mjs
 *
 * (No Mac, o python3 do sistema é o do Xcode: dar-lhe o de um venv com Pillow.
 * Sem Pillow, o caminho de ponta a ponta não corre e a bateria falha a dizê-lo.)
 *
 * O que prova:
 *   · regras.mjs é ES module puro (corre no browser e num Worker);
 *   · os dados de hoje passam sem nada que pare e sem nada neutralizado, e os
 *     lembretes são exactamente os que os dados pedem; os 21 ficheiros saem do
 *     serializar() byte a byte, cada um com a sua terminação;
 *   · re-jogar TODOS os commits que mexeram em data/: nenhum teria parado a
 *     publicação (os que parariam listam-se, com a razão);
 *   · cada regra com um caso e a classe certa — e os casos em que a regra diz
 *     «sim»; uma viatura partida nunca dá exit 1;
 *   · uma chave, uma classe (o Worker do painel compara só as chaves);
 *   · o varrimento: apagar cada chave de cada viatura e do definicoes.json dá
 *     o problema certo, com o ecrã nomeado, ou nada se o campo é opcional;
 *   · 30 problemas → 9 anotações + «e mais 21», e os 30 no resumo;
 *   · na consola, nenhum dado abre um comando do runner (uma mudança de linha
 *     a começar por «::», ou um «##[» em qualquer sítio — .github/consola.mjs);
 *   · a cópia que o gerador lê muda só o que tem de mudar, e nada sem nada;
 *   · a guarda e o gerador verdadeiro contam as fotografias em falta da mesma
 *     maneira;
 *   · o publicar.yml: os passos corridos TAL COMO ESTÃO ESCRITOS (extraídos,
 *     nunca reescritos — memória correr-a-guarda-verdadeira): a guarda, o job
 *     «avisar» com um gh de faz-de-conta, e o job «construir» de ponta a ponta
 *     num repositório de ensaio com uma origem própria — o commit de volta leva
 *     as vendidas e as fotografias preparadas e NUNCA a cópia neutralizada. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, existsSync, statSync, copyFileSync, symlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as R from './regras.mjs';
import * as G from './guardas.mjs';
import { umaLinha } from './consola.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON || 'python3';
const GUARDA = join(RAIZ, '.github', 'guardas.mjs');
const YAML = readFileSync(join(RAIZ, '.github', 'workflows', 'publicar.yml'), 'utf8');
const TMP = mkdtempSync(join(tmpdir(), 'lr-guardas-'));
const HOJE_DATA = new Date();

let passou = 0; let falhou = 0;
const certo = (c, d, extra = '') => {
  if (c) { passou++; console.log(`  ✓ ${d}`); } else { falhou++; console.log(`  ✗ ${d}${extra ? `  — ${String(extra).slice(0, 1500)}` : ''}`); }
};
const secao = (t) => console.log(`\n— ${t}`);
const clonar = (x) => JSON.parse(JSON.stringify(x));
const correr = (cmd, args, opcoes = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opcoes, env: { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_ACTIONS: '', ...(opcoes.env || {}) } });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
};
const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/* Os dados de hoje, como a guarda os lê (texto), e lidos (objectos). */
const { dados: TEXTO } = G.lerDados(RAIZ);
const lerTudo = (t) => ({
  definicoes: JSON.parse(t.definicoes),
  viaturas: Object.fromEntries(Object.entries(t.viaturas).map(([k, v]) => [k, JSON.parse(v)])),
  vendidas: Object.fromEntries(Object.entries(t.vendidas).map(([k, v]) => [k, JSON.parse(v)])),
});
const HOJE = lerTudo(TEXTO);
const dadosDeHoje = () => clonar(HOJE);
const LISTAR = G.listarPastaEm(RAIZ);   // guarda o que já leu: as varreduras perguntam pela mesma pasta milhares de vezes
const OP = { listarPasta: LISTAR, hoje: HOJE_DATA };
const tem = (lista, classe, chave) => lista.some((p) => p.classe === classe && (chave instanceof RegExp ? chave.test(p.chave) : p.chave === chave));
const deClasse = (lista, classe) => lista.filter((p) => p.classe === classe);
const avisos = (lista) => lista.filter((p) => p.classe === 'avisa' && !p.lembrete);
const lembretes = (lista) => lista.filter((p) => p.lembrete);

const J = 'jaguar-xf-2-2-d-premium-luxury';        // à venda, fotografias na pasta com o nome dela
const P = 'ford-puma-titanium';                     // brevemente, sem preço, fotografia na raiz da biblioteca
const V = 'volvo-v60-24-d6-r-design-phev';          // vendida
const N = 'nissan-patrol-gr61';                     // vendida, «Cópia de Cópia de Stock.jpeg»
const viat = (nome, mudar) => (d) => mudar(d.viaturas[nome] || d.vendidas[nome], d);
const def = (mudar) => (d) => mudar(d.definicoes, d);

/* Um repositório de ensaio mínimo: data/ como se mandar, e as fotografias do
   repositório verdadeiro por uma ligação (a guarda só lista as pastas). */
function repoDeEnsaio(dados) {
  const dir = mkdtempSync(join(TMP, 'repo-'));
  mkdirSync(join(dir, 'data', 'viaturas', 'vendidas'), { recursive: true });
  if (dados.definicoes !== undefined && dados.definicoes !== null) writeFileSync(join(dir, R.FICHEIROS.definicoes), typeof dados.definicoes === 'string' ? dados.definicoes : R.serializar(dados.definicoes, '\n'));
  for (const pasta of ['viaturas', 'vendidas']) {
    for (const [nome, v] of Object.entries(dados[pasta] || {})) {
      if (v === undefined || v === null) continue;
      writeFileSync(join(dir, R.ficheiroDaViatura(pasta, nome)), typeof v === 'string' ? v : R.serializar(v, ''));
    }
  }
  symlinkSync(join(RAIZ, 'assets'), join(dir, 'assets'));
  return dir;
}
function guardaEm(dir, env = {}, extra = []) {
  const rel = join(dir, 'relatorio.json');
  const r = correr('node', [GUARDA, '--raiz', dir, '--relatorio-em', rel, ...extra], { env });
  return { ...r, relatorio: existsSync(rel) ? JSON.parse(readFileSync(rel, 'utf8')) : null };
}

/* O run: de um passo do publicar.yml, tal e qual. */
function passoDoYaml(nome, yaml = YAML) {
  const linhas = yaml.split('\n');
  const ind = (l) => l.match(/^ */)[0].length;
  const i0 = linhas.findIndex((l) => l.trim() === `- name: ${nome}`);
  if (i0 < 0) throw new Error(`o publicar.yml não tem o passo «${nome}»`);
  let fim = linhas.length;
  for (let i = i0 + 1; i < linhas.length; i++) if (linhas[i].trim() && ind(linhas[i]) <= ind(linhas[i0])) { fim = i; break; }
  const r = linhas.slice(i0, fim).findIndex((l) => /^\s*run:/.test(l));
  if (r < 0) throw new Error(`o passo «${nome}» não tem run:`);
  const m = linhas[i0 + r].match(/^\s*run:\s*(.*)$/);
  if (m[1] && m[1] !== '|') return m[1] + '\n';
  const corpo = linhas.slice(i0 + r + 1, fim);
  while (corpo.length && !corpo[corpo.length - 1].trim()) corpo.pop();
  const base = Math.min(...corpo.filter((l) => l.trim()).map(ind));
  return corpo.map((l) => l.slice(base)).join('\n') + '\n';
}
/* O env: de um passo (só valores simples, como os do «Gerar o site»). */
function envDoPasso(nome) {
  const linhas = YAML.split('\n');
  const i0 = linhas.findIndex((l) => l.trim() === `- name: ${nome}`);
  const ind = (l) => l.match(/^ */)[0].length;
  const out = {};
  let dentro = false; let indEnv = 0;
  for (let i = i0 + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.trim() && ind(l) <= ind(linhas[i0])) break;
    if (/^\s*env:\s*$/.test(l)) { dentro = true; indEnv = ind(l); continue; }
    if (dentro) {
      if (l.trim() && ind(l) <= indEnv) { dentro = false; continue; }
      const m = l.match(/^\s*([A-Z_]+):\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
    }
  }
  return out;
}
function jobDoYaml(nome) {
  const linhas = YAML.split('\n');
  const i0 = linhas.findIndex((l) => l === `  ${nome}:`);
  if (i0 < 0) throw new Error(`o publicar.yml não tem o job «${nome}»`);
  let fim = linhas.length;
  for (let i = i0 + 1; i < linhas.length; i++) if (/^  [a-z]/.test(linhas[i]) || /^[a-z]/.test(linhas[i])) { fim = i; break; }
  return linhas.slice(i0, fim).join('\n');
}
/* Os nomes dos passos do job «construir», pela ordem (os `uses:` sem nome
   ficam com o nome da action). */
function passosDoConstruir() {
  return jobDoYaml('construir').split('\n')
    .map((l) => l.match(/^      - (?:name: (.+)|uses: (\S+))$/)).filter(Boolean).map((m) => m[1] || m[2]);
}
/* O mesmo, sem rebentar quando o passo não existe (as verificações de estrutura
   têm de falhar como afirmações, e a bateria seguir até ao fim). */
const passoOuNada = (nome) => { try { return passoDoYaml(nome); } catch { return ''; } };
function correrPasso(nome, cwd, env = {}) {
  const f = join(TMP, `passo-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(f, passoDoYaml(nome));
  return correr('bash', ['-e', f], { cwd, env });
}

/* Os ecrãs do painel (plano §5) e as mensagens sem caminhos de JSON. */
const ECRAS = /^(?:(?:Viaturas|Vendidas) › .+|Dados do stand(?: › (?:Contactos|Morada do stand|Horário|Redes sociais|Textos do site|Opções|Dados legais da empresa|Sede social))?)$/;
const CAMINHO_JSON = /\b(?:[a-z]+_[a-z_]+|(?:contactos|stand|empresa|textos|opcoes|redes|horario|sede_social)\.[a-z0-9_.]+)\b/;
const bemDito = (p) => ECRAS.test(p.ecra) && typeof p.mensagem === 'string' && p.mensagem.length > 15 && !CAMINHO_JSON.test(p.mensagem);

try {
  /* ================================================================== */
  secao('regras.mjs corre no browser e num Worker');
  const fonte = readFileSync(join(RAIZ, '.github', 'regras.mjs'), 'utf8');
  certo(!/^\s*import\s/m.test(fonte) && !/\bimport\s*\(/.test(fonte), 'não importa nada');
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  certo(codigo.length > 10000 && !/\brequire\s*\(|\bprocess\.|node:|\bfs\b|Buffer\b|__dirname/.test(codigo), 'nada de require, process, node:, fs ou Buffer (no código, fora dos comentários)');
  certo(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u00AD\u0300-\u036F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/.test(fonte), 'sem caracteres de controlo, invisíveis nem marcas combinantes literais no código (escrevem-se por escape)');
  const soltinho = await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
  certo(typeof soltinho.problemas === 'function' && typeof soltinho.neutralizar === 'function' && typeof soltinho.gerarSlug === 'function', 'importa-se sozinho, sem a pasta à volta (como a cópia do painel)');
  console.log(`    SHA-256 do regras.mjs: ${createHash('sha256').update(fonte).digest('hex')}`);

  /* ================================================================== */
  secao('os dados de hoje');
  const hoje = R.problemas(TEXTO, OP);
  certo(deClasse(hoje, 'bloqueia').length === 0, 'nada que pare', deClasse(hoje, 'bloqueia').map((p) => p.chave).join(', '));
  certo(deClasse(hoje, 'neutraliza').length === 0, 'nenhuma viatura a neutralizar', deClasse(hoje, 'neutraliza').map((p) => p.chave).join(', '));
  certo(avisos(hoje).length === 0, 'nenhum aviso de campo (o painel deixava gravar tudo o que lá está)', avisos(hoje).map((p) => p.chave).join(', '));
  const nHoje = R.neutralizar(TEXTO, hoje);
  certo(!nHoje.mudou && nHoje.efeitos.length === 0 && Object.keys(nHoje.ficheiros).length === 0, 'neutralizar() não muda nada');
  {
    /* Os lembretes esperados, contados à parte a partir dos dados (sem as
       regras): as viaturas à venda no site, e o que lhes falta. */
    const aVenda = Object.entries({ ...HOJE.viaturas, ...HOJE.vendidas }).filter(([, v]) => v.publicado !== false && String(v.estado).trim() !== 'vendido');
    const falta = (x) => x === undefined || x === null || (typeof x === 'string' && !x.trim());
    const esperado = {
      'sem-matricula': aVenda.filter(([, v]) => falta(v.matricula)).length,
      'sem-donos': aVenda.filter(([, v]) => falta(v.registos_anteriores)).length,
      'sem-ano': aVenda.filter(([, v]) => falta(v.ano)).length,
      'sem-preco': aVenda.filter(([, v]) => !(typeof v.preco === 'number' && v.preco > 0)).length,
      'sem-km': aVenda.filter(([, v]) => falta(v.km)).length,
      'sem-fotos': aVenda.filter(([, v]) => !(v.fotos || []).some((c) => typeof c === 'string' && c.trim())).length,
      'garantia-3-anos': aVenda.filter(([, v]) => /\b(3\s*anos|36\s*meses)\b/i.test(v.garantia || '')).length,
      'garantia-curta': aVenda.filter(([, v]) => /\b([0-9]|1[0-7])\s*meses\b|\b1\s*ano\b/i.test(v.garantia || '')).length,
    };
    const veio = {};
    for (const p of lembretes(hoje)) { const regra = p.chave.split(':').pop(); veio[regra] = (veio[regra] || 0) + 1; }
    const iguais = Object.keys({ ...esperado, ...veio }).every((k) => (esperado[k] || 0) === (veio[k] || 0));
    certo(iguais && lembretes(hoje).length > 0, `${lembretes(hoje).length} lembretes, exactamente os que os dados pedem: ${Object.entries(veio).map(([k, n]) => `${k} ${n}`).join(', ')} (${aVenda.length} viaturas à venda)`, JSON.stringify({ esperado, veio }));
    certo(lembretes(hoje).every((p) => p.ficheiro && !p.ficheiro.includes('/vendidas/')), '   nenhum lembrete numa vendida (a lei pede-os ao anúncio)');
    certo(aVenda.every(([, v]) => falta(v.matricula)), `   hoje nenhuma das ${aVenda.length} à venda tem matrícula (decisão do Renato: só lembra)`);
  }
  {
    const todos = [['data/definicoes.json', TEXTO.definicoes], ...Object.entries(TEXTO.viaturas).map(([n, t]) => [R.ficheiroDaViatura('viaturas', n), t]), ...Object.entries(TEXTO.vendidas).map(([n, t]) => [R.ficheiroDaViatura('vendidas', n), t])];
    const diferentes = todos.filter(([, t]) => R.serializar(JSON.parse(t), R.terminacaoDe(t)) !== t).map(([f]) => f);
    const semFim = todos.filter(([f, t]) => f.includes('/viaturas/') && !t.endsWith('\n')).length;
    certo(todos.length >= 20 && diferentes.length === 0, `serializar() reproduz os ${todos.length} ficheiros byte a byte, cada um com a sua terminação (${semFim} viaturas sem \\n no fim, como o Pages CMS as deixa; o definicoes.json com)`, diferentes.join(', '));
    certo(R.terminacaoDe(TEXTO.definicoes) === '\n', '   o definicoes.json acaba em \\n');
  }
  {
    const relF = join(TMP, 'hoje.json');
    const r = correr('node', [GUARDA, '--relatorio-em', relF]);
    const rel = JSON.parse(readFileSync(relF, 'utf8'));
    certo(r.status === 0, 'a guarda verdadeira, sobre o repositório, sai com 0', r.err);
    certo(rel.bloqueia === 0 && rel.neutraliza === 0 && rel.neutralizados.length === 0 && rel.lembretes === lembretes(hoje).length && rel.problemas.length === rel.lembretes,
      `o relatório diz 0 que param, 0 neutralizados, 0 avisos e ${rel.lembretes} lembretes (e lê-se)`);
    const antes = Object.fromEntries(Object.keys(TEXTO.viaturas).map((n) => [n, statSync(join(RAIZ, R.ficheiroDaViatura('viaturas', n))).mtimeMs]));
    const n = correr('node', [GUARDA, '--neutralizar', RAIZ]);
    const depois = Object.fromEntries(Object.keys(TEXTO.viaturas).map((n2) => [n2, statSync(join(RAIZ, R.ficheiroDaViatura('viaturas', n2))).mtimeMs]));
    certo(n.status === 2 && /só numa cópia/.test(n.err) && JSON.stringify(antes) === JSON.stringify(depois), '--neutralizar recusa-se a escrever no próprio repositório fora do CI (sai com 2, sem tocar em nada)', `${n.status} ${n.err}`);
  }

  /* ================================================================== */
  secao('re-jogar os commits de data/');
  certo(git('rev-parse', '--is-shallow-repository').trim() === 'false', 'o histórico está inteiro (um clone raso não prova nada)');
  /* Um commit lido como a guarda o leria: os JSON pela árvore do commit, e as
     pastas das fotografias pela árvore também (ficheiros e pastas, como o
     readdirSync que o gerador usa). */
  const lerBlobs = (ids) => {
    const r = spawnSync('git', ['-C', RAIZ, 'cat-file', '--batch'], { input: ids.join('\n') + '\n', maxBuffer: 512 * 1024 * 1024 });
    const out = r.stdout; const m = new Map(); let i = 0;
    for (const id of ids) {
      const nl = out.indexOf(0x0a, i);
      const tam = Number(out.subarray(i, nl).toString().split(' ')[2]);
      m.set(id, out.subarray(nl + 1, nl + 1 + tam).toString('utf8'));
      i = nl + 1 + tam + 1;
    }
    return m;
  };
  const noCommit = (c) => {
    const entradas = git('ls-tree', '-r', '-z', c, '--', 'data/').split('\0').filter(Boolean).map((l) => { const [cab, caminho] = l.split('\t'); return { id: cab.split(' ')[2], caminho }; });
    const blobs = lerBlobs(entradas.map((e) => e.id));
    const dados = { viaturas: {}, vendidas: {}, definicoes: null };
    for (const { id, caminho } of entradas) {
      if (caminho === R.FICHEIROS.definicoes) dados.definicoes = blobs.get(id);
      else if (/^data\/viaturas\/vendidas\/[^/]+\.json$/.test(caminho)) dados.vendidas[caminho.split('/').pop().slice(0, -5)] = blobs.get(id);
      else if (/^data\/viaturas\/[^/]+\.json$/.test(caminho)) dados.viaturas[caminho.split('/').pop().slice(0, -5)] = blobs.get(id);
    }
    const pastas = new Map();
    for (const caminho of git('ls-tree', '-r', '-t', '-z', '--name-only', c, '--', 'assets/veiculos', 'assets/fotos').split('\0').filter(Boolean)) {
      const pai = caminho.slice(0, caminho.lastIndexOf('/'));
      if (!pastas.has(pai)) pastas.set(pai, []);
      pastas.get(pai).push(caminho.slice(caminho.lastIndexOf('/') + 1));
    }
    return { dados, listarPasta: (p) => pastas.get(p) || [] };
  };
  const commits = git('log', '--format=%H %h', '--reverse', '--', 'data/').trim().split('\n').map((l) => l.split(' '));
  let comBloqueio = 0; let comNeutralizados = 0;
  for (const [c, h] of commits) {
    const { dados, listarPasta } = noCommit(c);
    const lista = R.problemas(dados, { listarPasta, hoje: HOJE_DATA });
    const b = deClasse(lista, 'bloqueia');
    const efeitos = R.neutralizar(dados, lista).efeitos;
    const msg = git('log', '-1', '--format=%ad %an: %s', '--date=short', c).trim();
    if (b.length) comBloqueio++;
    if (efeitos.length) comNeutralizados++;
    const nV = Object.keys(dados.viaturas).length + Object.keys(dados.vendidas).length;
    console.log(`    · ${h} ${msg.slice(0, 90)} — ${b.length ? `PARAVA: ${b.map((p) => `${p.ecra}: ${p.mensagem}`).join(' | ')}` : 'publicava'} (${nV} viaturas; ${efeitos.length ? `mudavam no site: ${efeitos.map((e) => `${e.nome} — ${R.descreverEfeitos(e)}`).join('; ')}` : 'nada neutralizado'}; ${avisos(lista).length} avisos, ${lembretes(lista).length} lembretes)`);
  }
  certo(commits.length >= 50, `${commits.length} commits re-jogados (todos os que mexeram em data/, desde o primeiro)`);
  certo(comBloqueio === 0, `nenhum teria parado a publicação${comNeutralizados ? ` (em ${comNeutralizados} alguma viatura mudava no site — ver a lista)` : ''}`);
  {
    /* A mesma máquina tem de saber dizer «pára». */
    const [c] = commits.at(-1);
    const { dados, listarPasta } = noCommit(c);
    const d = JSON.parse(dados.definicoes); d.empresa.nif = '517541905';
    const lista = R.problemas({ ...dados, definicoes: R.serializar(d, '\n') }, { listarPasta });
    certo(tem(lista, 'bloqueia', 'definicoes:empresa.nif'), '   e a mesma máquina diz «pára» quando é caso disso (o último commit, com o NIF trocado)');
  }

  /* ================================================================== */
  secao('cada regra, com a classe certa');
  const anoSeguinte = HOJE_DATA.getFullYear() + 1;
  const fotosQueExistem = [...new Set(Object.values({ ...HOJE.viaturas, ...HOJE.vendidas }).flatMap((v) => v.fotos || []))];
  const CASOS = [
    // [descrição, mudar(dados), classe, chave (texto ou RegExp), efeito?, lembrete?]
    ['viatura sem marca', viat(J, (v) => { delete v.marca; }), 'neutraliza', `viatura:${J}:marca`, 'esconder'],
    ['marca só com espaços', viat(J, (v) => { v.marca = '   '; }), 'neutraliza', `viatura:${J}:marca`, 'esconder'],
    ['marca que é um número', viat(J, (v) => { v.marca = 7; }), 'neutraliza', `viatura:${J}:marca`, 'esconder'],
    ['viatura sem modelo', viat(J, (v) => { v.modelo = ''; }), 'neutraliza', `viatura:${J}:modelo`, 'esconder'],
    ['vendida sem modelo', viat(V, (v) => { delete v.modelo; }), 'neutraliza', `viatura:${V}:modelo`, 'esconder'],
    ['«</script>» na descrição', viat(J, (v) => { v.descricao += '</script><script>alert(1)</script>'; }), 'neutraliza', `viatura:${J}:partia-a-pagina`, 'esconder'],
    ['«<!--» na versão', viat(J, (v) => { v.versao = 'XF <!-- x'; }), 'neutraliza', `viatura:${J}:partia-a-pagina`, 'esconder'],
    ['aspas no estado', viat(J, (v) => { v.estado = 'disponivel" onmouseover="x'; }), 'neutraliza', `viatura:${J}:partia-a-pagina`, 'esconder'],
    ['aspas no preço escrito como texto', viat(J, (v) => { v.preco = '1" x="'; }), 'neutraliza', `viatura:${J}:partia-a-pagina`, 'esconder'],
    ['fotografia que já não existe', viat(J, (v) => { v.fotos[3] = `assets/veiculos/${J}/APAGADA.jpg`; }), 'neutraliza', `viatura:${J}:foto-em-falta:assets/veiculos/${J}/APAGADA.jpg`, 'sem_fotografia'],
    ['fotografia numa pasta que não existe', viat(P, (v) => { v.fotos.push('assets/veiculos/nao-existe/x.jpg'); }), 'neutraliza', `viatura:${P}:foto-em-falta:assets/veiculos/nao-existe/x.jpg`, 'sem_fotografia'],
    ['fotografia de uma vendida que já não existe', viat(V, (v) => { v.fotos[0] = 'assets/veiculos/APAGADA.jpeg'; }), 'neutraliza', `viatura:${V}:foto-em-falta:assets/veiculos/APAGADA.jpeg`, 'sem_fotografia'],
    ['fotografia fora da biblioteca', viat(J, (v) => { v.fotos.push('assets/img/logo.svg'); }), 'neutraliza', `viatura:${J}:foto-invalida:assets/img/logo.svg`, 'sem_fotografia'],
    ['fotografia nas geradas', viat(J, (v) => { v.fotos.push(`assets/fotos/${J}/01-1600.webp`); }), 'neutraliza', `viatura:${J}:foto-invalida:assets/fotos/${J}/01-1600.webp`, 'sem_fotografia'],
    ['fotografia com «..»', viat(J, (v) => { v.fotos.push('assets/veiculos/../../CNAME.jpg'); }), 'neutraliza', /^viatura:jaguar-xf-2-2-d-premium-luxury:foto-invalida:assets\/veiculos\/\.\.\//, 'sem_fotografia'],
    ['fotografia de outro site', viat(J, (v) => { v.fotos.push('https://exemplo.pt/a.jpg'); }), 'neutraliza', `viatura:${J}:foto-invalida:https://exemplo.pt/a.jpg`, 'sem_fotografia'],
    ['fotografia com «#» no nome', viat(J, (v) => { v.fotos.push(`assets/veiculos/${J}/a#b.jpg`); }), 'neutraliza', `viatura:${J}:foto-invalida:assets/veiculos/${J}/a#b.jpg`, 'sem_fotografia'],
    ['fotografia com aspas no nome', viat(J, (v) => { v.fotos.push(`assets/veiculos/${J}/a".jpg`); }), 'neutraliza', `viatura:${J}:foto-invalida:assets/veiculos/${J}/a".jpg`, 'sem_fotografia'],
    ['fotografia .gif', viat(J, (v) => { v.fotos.push(`assets/veiculos/${J}/a.gif`); }), 'neutraliza', `viatura:${J}:foto-invalida:assets/veiculos/${J}/a.gif`, 'sem_fotografia'],
    ['fotografia que não é texto', viat(J, (v) => { v.fotos.push(null); }), 'neutraliza', `viatura:${J}:foto-invalida:null`, 'sem_fotografia'],
    ['a mesma fotografia duas vezes', viat(J, (v) => { v.fotos.push(v.fotos[0]); }), 'avisa', `viatura:${J}:foto-repetida:${HOJE.viaturas[J].fotos[0]}`],
    ['51 fotografias', viat(J, (v) => { v.fotos = fotosQueExistem.slice(0, 51); }), 'avisa', `viatura:${J}:fotos-a-mais`],
    ['fotografias que não são uma lista', viat(J, (v) => { v.fotos = v.fotos[0]; }), 'avisa', `viatura:${J}:fotos`],
    ['tipo fora da lista', viat(J, (v) => { v.tipo = 'camião'; }), 'avisa', `viatura:${J}:tipo`],
    ['tipo em falta', viat(J, (v) => { delete v.tipo; }), 'avisa', `viatura:${J}:tipo`],
    ['estado desconhecido', viat(J, (v) => { v.estado = 'vendida'; }), 'avisa', `viatura:${J}:estado`],
    ['estado em falta', viat(J, (v) => { delete v.estado; }), 'avisa', `viatura:${J}:estado`],
    ['carroçaria «Sedan»', viat(J, (v) => { v.carrocaria = 'Sedan'; }), 'avisa', `viatura:${J}:carrocaria`],
    ['mês em minúsculas', viat(J, (v) => { v.mes = 'abril'; }), 'avisa', `viatura:${J}:mes`],
    ['combustível «Electrico»', viat(J, (v) => { v.combustivel = 'Electrico'; }), 'avisa', `viatura:${J}:combustivel`],
    ['caixa «Auto»', viat(J, (v) => { v.caixa = 'Auto'; }), 'avisa', `viatura:${J}:caixa`],
    ['origem «Importada»', viat(J, (v) => { v.origem = 'Importada'; }), 'avisa', `viatura:${J}:origem`],
    ['«Publicado no site» como texto', viat(J, (v) => { v.publicado = 'sim'; }), 'avisa', `viatura:${J}:publicado`],
    ['«Destaque» como número', viat(J, (v) => { v.destaque = 1; }), 'avisa', `viatura:${J}:destaque`],
    ['preço negativo', viat(J, (v) => { v.preco = -1; }), 'avisa', `viatura:${J}:preco`],
    ['preço com 3 casas', viat(J, (v) => { v.preco = 13990.999; }), 'avisa', `viatura:${J}:preco`],
    ['preço como texto', viat(J, (v) => { v.preco = '13990'; }), 'avisa', `viatura:${J}:preco`],
    ['preço acima de um milhão', viat(J, (v) => { v.preco = 1000001; }), 'avisa', `viatura:${J}:preco`],
    ['quilómetros com casas decimais', viat(J, (v) => { v.km = 214000.5; }), 'avisa', `viatura:${J}:km`],
    ['quilómetros negativos', viat(J, (v) => { v.km = -5; }), 'avisa', `viatura:${J}:km`],
    ['ano 1949', viat(J, (v) => { v.ano = 1949; }), 'avisa', `viatura:${J}:ano`],
    [`ano ${anoSeguinte + 1} (depois do ano seguinte)`, viat(J, (v) => { v.ano = anoSeguinte + 1; }), 'avisa', `viatura:${J}:ano`],
    ['ano como texto', viat(J, (v) => { v.ano = '2013'; }), 'avisa', `viatura:${J}:ano`],
    ['ano de construção depois da matrícula', viat(J, (v) => { v.ano_construcao = 2014; }), 'avisa', `viatura:${J}:ano_construcao:depois-da-matricula`],
    ['ano de construção com 2 algarismos', viat(J, (v) => { v.ano_construcao = 12; }), 'avisa', `viatura:${J}:ano_construcao`],
    ['potência zero', viat(J, (v) => { v.potencia = 0; }), 'avisa', `viatura:${J}:potencia`],
    ['cilindrada de 20 000 cm³', viat(J, (v) => { v.cilindrada = 20000; }), 'avisa', `viatura:${J}:cilindrada`],
    ['10 lugares', viat(J, (v) => { v.lugares = 10; }), 'avisa', `viatura:${J}:lugares`],
    ['0 portas', viat(J, (v) => { v.portas = 0; }), 'avisa', `viatura:${J}:portas`],
    ['ordem negativa', viat(J, (v) => { v.ordem = -1; }), 'avisa', `viatura:${J}:ordem`],
    ['ordem com casas decimais', viat(J, (v) => { v.ordem = 2.5; }), 'avisa', `viatura:${J}:ordem`],
    ['31 donos anteriores', viat(J, (v) => { v.registos_anteriores = 31; }), 'avisa', `viatura:${J}:registos_anteriores`],
    ['marca com 41 caracteres', viat(J, (v) => { v.marca = 'x'.repeat(41); }), 'avisa', `viatura:${J}:marca:tamanho`],
    ['mudança de linha na versão', viat(J, (v) => { v.versao = '2.2 D\nPremium'; }), 'avisa', `viatura:${J}:versao:controlo`],
    ['descrição com 6001 caracteres', viat(J, (v) => { v.descricao = 'x'.repeat(6001); }), 'avisa', `viatura:${J}:descricao:tamanho`],
    ['descrição com um ** sem par', viat(J, (v) => { v.descricao = 'Viatura **irrepreensível, nacional.'; }), 'avisa', `viatura:${J}:descricao:negrito`],
    ['negrito a atravessar uma mudança de linha', viat(J, (v) => { v.descricao = '**Viatura\nnacional**'; }), 'avisa', `viatura:${J}:descricao:negrito`],
    ['descrição com um carácter de controlo', viat(J, (v) => { v.descricao = 'a\u0001b'; }), 'avisa', `viatura:${J}:descricao:controlo`],
    ['matrícula «não tem»', viat(J, (v) => { v.matricula = 'não tem'; }), 'avisa', `viatura:${J}:matricula:formato`],
    ['equipamento como texto', viat(J, (v) => { v.equipamento = 'AC automático'; }), 'avisa', `viatura:${J}:equipamento`],
    ['61 linhas de equipamento', viat(J, (v) => { v.equipamento = Array.from({ length: 61 }, (_, i) => `Coisa ${i}`); }), 'avisa', `viatura:${J}:equipamento:quantos`],
    ['uma linha de equipamento com 121 caracteres', viat(J, (v) => { v.equipamento.push('x'.repeat(121)); }), 'avisa', `viatura:${J}:equipamento:tamanho`],
    ['uma linha de equipamento que é um número', viat(J, (v) => { v.equipamento.push(5); }), 'avisa', `viatura:${J}:equipamento:texto`],
    ['viatura a chegar ao limite do painel', viat(J, (v) => { v.descricao = 'x'.repeat(5000); v.equipamento = Array.from({ length: 60 }, () => 'y'.repeat(800)); }), 'avisa', `viatura:${J}:tecto`, undefined, true],
    // --- lembretes (só nas que estão à venda) ---
    ['à venda sem donos anteriores', viat(J, (v) => { delete v.registos_anteriores; }), 'avisa', `viatura:${J}:sem-donos`, undefined, true],
    ['à venda sem ano', viat(J, (v) => { delete v.ano; }), 'avisa', `viatura:${J}:sem-ano`, undefined, true],
    ['à venda sem preço', viat(J, (v) => { delete v.preco; }), 'avisa', `viatura:${J}:sem-preco`, undefined, true],
    ['à venda com preço 0 («Sob consulta»)', viat(J, (v) => { v.preco = 0; }), 'avisa', `viatura:${J}:sem-preco`, undefined, true],
    ['à venda sem quilómetros', viat(J, (v) => { v.km = null; }), 'avisa', `viatura:${J}:sem-km`, undefined, true],
    ['à venda sem fotografias', viat(J, (v) => { v.fotos = []; }), 'avisa', `viatura:${J}:sem-fotos`, undefined, true],
    ['reservada sem matrícula', viat(J, (v) => { v.estado = 'reservado'; }), 'avisa', `viatura:${J}:sem-matricula`, undefined, true],
    ['garantia de 12 meses', viat(J, (v) => { v.garantia = '12 meses'; }), 'avisa', `viatura:${J}:garantia-curta`, undefined, true],
    ['garantia de «1 ano»', viat(J, (v) => { v.garantia = 'Garantia 1 ano'; }), 'avisa', `viatura:${J}:garantia-curta`, undefined, true],
    ['garantia «12» (só algarismos são meses, como no site)', viat(J, (v) => { v.garantia = '12'; }), 'avisa', `viatura:${J}:garantia-curta`, undefined, true],
    ['garantia de «3 anos»', viat(J, (v) => { v.garantia = '3 anos'; }), 'avisa', `viatura:${J}:garantia-3-anos`, undefined, true],
    ['garantia de «três anos»', viat(J, (v) => { v.garantia = 'Três anos'; }), 'avisa', `viatura:${J}:garantia-3-anos`, undefined, true],
    ['garantia de 36 meses', viat(J, (v) => { v.garantia = '36 meses'; }), 'avisa', `viatura:${J}:garantia-3-anos`, undefined, true],
    // --- os ficheiros das viaturas ---
    ['viatura ilegível', (d) => { d.viaturas[J] = '{"marca": "Jaguar",'; }, 'bloqueia', `viatura:${J}:ilegivel`],
    ['viatura que é uma lista', (d) => { d.viaturas[J] = '[]'; }, 'bloqueia', `viatura:${J}:forma`],
    ['viatura «null»', (d) => { d.viaturas[J] = 'null'; }, 'bloqueia', `viatura:${J}:forma`],
    ['a mesma viatura nas duas pastas', (d) => { d.vendidas[J] = clonar(d.viaturas[J]); }, 'bloqueia', `viatura:${J}:repetida`],
    ['«renault-captur-» e «renault-captur» (o mesmo endereço)', (d) => { d.viaturas['renault-captur-'] = clonar(d.viaturas[J]); d.vendidas['renault-captur'] = clonar(d.viaturas[J]); }, 'bloqueia', 'viatura:renault-captur:repetida'],
    ['um ficheiro que só tem hífens no nome', (d) => { d.viaturas['--'] = clonar(d.viaturas[J]); }, 'bloqueia', 'viatura:--:endereco-vazio'],
    ['um endereço com maiúsculas e espaços', (d) => { d.viaturas['Ford Puma'] = clonar(d.viaturas[P]); }, 'avisa', 'viatura:Ford Puma:endereco'],
    // --- o definicoes.json ---
    ['definicoes.json ilegível', (d) => { d.definicoes = '{'; }, 'bloqueia', 'definicoes:ilegivel'],
    ['definicoes.json em falta', (d) => { d.definicoes = null; }, 'bloqueia', 'definicoes:ausente'],
    ['definicoes.json que é uma lista', (d) => { d.definicoes = []; }, 'bloqueia', 'definicoes:forma'],
    ...['contactos', 'stand', 'redes', 'textos', 'opcoes', 'empresa'].map((s) => [`sem a secção «${s}»`, def((x) => { delete x[s]; }), 'bloqueia', `definicoes:${s}:forma`]),
    ['o horário não é uma lista', def((x) => { x.horario = { dias: 'Sábado' }; }), 'bloqueia', 'definicoes:horario:forma'],
    ['uma linha do horário vazia (null)', def((x) => { x.horario[1] = null; }), 'bloqueia', 'definicoes:horario.2:forma'],
    ['telefone 1 vazio', def((x) => { x.contactos.telefone_1 = ''; }), 'bloqueia', 'definicoes:contactos.telefone_1'],
    ['telefone 1 com 8 algarismos', def((x) => { x.contactos.telefone_1 = '96105336'; }), 'bloqueia', 'definicoes:contactos.telefone_1'],
    ['telefone 1 que não é telemóvel nem fixo (um 800: o site não sabe que nota pôr)', def((x) => { x.contactos.telefone_1 = '800123456'; x.contactos.telefone_1_texto = '800 123 456'; }), 'bloqueia', 'definicoes:contactos.telefone_1'],
    ['telefone 2 começado por 20 (não há fixos 20)', def((x) => { x.contactos.telefone_2 = '203123456'; x.contactos.telefone_2_texto = '203 123 456'; }), 'bloqueia', 'definicoes:contactos.telefone_2'],
    ['telefone 2 fixo com o «como aparece» de outro número', def((x) => { x.contactos.telefone_2 = '253123456'; x.contactos.telefone_2_texto = '253 123 457'; }), 'bloqueia', 'definicoes:contactos.telefone_2_texto'],
    ['telefone 1 com espaços', def((x) => { x.contactos.telefone_1 = '961 053 363'; }), 'bloqueia', 'definicoes:contactos.telefone_1'],
    ['telefone 1 (como aparece) com HTML', def((x) => { x.contactos.telefone_1_texto = '961 053 363 <b>'; }), 'bloqueia', 'definicoes:contactos.telefone_1_texto'],
    ['telefone 1 (como aparece) com outro número', def((x) => { x.contactos.telefone_1_texto = '916 228 513'; }), 'bloqueia', 'definicoes:contactos.telefone_1_texto'],
    ['telefone 1 (como aparece) vazio', def((x) => { delete x.contactos.telefone_1_texto; }), 'bloqueia', 'definicoes:contactos.telefone_1_texto'],
    ['telefone 2 vazio com o «como aparece» preenchido', def((x) => { delete x.contactos.telefone_2; }), 'bloqueia', 'definicoes:contactos.telefone_2'],
    ['telefone 2 preenchido sem o «como aparece»', def((x) => { x.contactos.telefone_2_texto = ''; }), 'bloqueia', 'definicoes:contactos.telefone_2_texto'],
    ['WhatsApp vazio', def((x) => { delete x.contactos.whatsapp; }), 'bloqueia', 'definicoes:contactos.whatsapp'],
    ['WhatsApp sem o 351', def((x) => { x.contactos.whatsapp = '961053363'; }), 'bloqueia', 'definicoes:contactos.whatsapp'],
    ['WhatsApp com +', def((x) => { x.contactos.whatsapp = '+351961053363'; }), 'bloqueia', 'definicoes:contactos.whatsapp'],
    ['WhatsApp de um fixo (351 + 2…)', def((x) => { x.contactos.whatsapp = '351253123456'; }), 'bloqueia', 'definicoes:contactos.whatsapp'],
    ['email com acento', def((x) => { x.contactos.email = 'geral@lrmotorsautomóveis.pt'; }), 'avisa', 'definicoes:contactos.email'],
    ['rua do stand vazia', def((x) => { x.stand.morada = ' '; }), 'bloqueia', 'definicoes:stand.morada'],
    ['código postal do stand vazio', def((x) => { delete x.stand.codigo_postal; }), 'bloqueia', 'definicoes:stand.codigo_postal'],
    ['código postal «4730»', def((x) => { x.stand.codigo_postal = '4730'; }), 'bloqueia', 'definicoes:stand.codigo_postal'],
    ['localidade do stand vazia', def((x) => { x.stand.localidade = ''; }), 'bloqueia', 'definicoes:stand.localidade'],
    ['distrito vazio', def((x) => { delete x.stand.distrito; }), 'avisa', 'definicoes:stand.distrito'],
    ['link do mapa sem https', def((x) => { x.stand.mapa = 'maps.app.goo.gl/6PmhYMPwHr8iWwNo8'; }), 'avisa', 'definicoes:stand.mapa'],
    ['link do mapa «javascript:»', def((x) => { x.stand.mapa = 'javascript:alert(1)'; }), 'avisa', 'definicoes:stand.mapa'],
    ['latitude escrita como texto', def((x) => { x.stand.latitude = '41.6469"'; }), 'bloqueia', 'definicoes:stand.latitude:forma'],
    ['longitude vazia', def((x) => { delete x.stand.longitude; }), 'avisa', 'definicoes:stand.longitude'],
    ['latitude 200', def((x) => { x.stand.latitude = 200; }), 'avisa', 'definicoes:stand.latitude'],
    ['horário sem linhas', def((x) => { x.horario = []; }), 'avisa', 'definicoes:horario:vazio'],
    ['uma linha do horário sem os dias', def((x) => { x.horario[0].dias = ''; }), 'avisa', 'definicoes:horario.1.dias'],
    ['uma linha do horário toda vazia (o site não a mostra)', def((x) => { x.horario.push({ dias: ' ', horas: '' }); }), 'avisa', 'definicoes:horario.4:vazia'],
    ['uma linha do horário que é {} (o backoffice apaga as chaves vazias)', def((x) => { x.horario.splice(1, 0, {}); }), 'avisa', 'definicoes:horario.2:vazia'],
    ['horário: dias que o Google não percebe («Feriados»)', def((x) => { x.horario.push({ dias: 'Feriados', horas: '10h-13h' }); }), 'avisa', 'definicoes:horario.4:google', undefined, true],
    ['horário: dias com um parêntese («Segunda a sexta (exceto feriados)»)', def((x) => { x.horario[0].dias = 'Segunda a sexta (exceto feriados)'; }), 'avisa', 'definicoes:horario.1:google', undefined, true],
    ['horário: horas que o Google não percebe («Por marcação»)', def((x) => { x.horario[1].horas = 'Por marcação'; }), 'avisa', 'definicoes:horario.2:google', undefined, true],
    ['horário: dois intervalos que se sobrepõem', def((x) => { x.horario[0].horas = '9h-13h e 12h-19h'; }), 'avisa', 'definicoes:horario.1:google', undefined, true],
    ['horário: um intervalo ao contrário («19h-9h»)', def((x) => { x.horario[1].horas = '19h-9h'; }), 'avisa', 'definicoes:horario.2:google', undefined, true],
    ['horário: o sábado em duas linhas (1.ª)', def((x) => { x.horario[0].dias = 'Segunda a sábado'; }), 'avisa', 'definicoes:horario.1:google', undefined, true],
    ['horário: o sábado em duas linhas (2.ª)', def((x) => { x.horario[0].dias = 'Segunda a sábado'; }), 'avisa', 'definicoes:horario.2:google', undefined, true],
    ['horário: o domingo aberto numa linha e fechado noutra', def((x) => { x.horario.push({ dias: 'Domingo', horas: '10h-13h' }); }), 'avisa', 'definicoes:horario.3:google', undefined, true],
    ['Instagram «javascript:»', def((x) => { x.redes.instagram = 'javascript:alert(1)'; }), 'avisa', 'definicoes:redes.instagram'],
    ['título da página inicial vazio', def((x) => { x.textos.hero_titulo = ''; }), 'avisa', 'definicoes:textos.hero_titulo'],
    ['frase da marca com 81 caracteres', def((x) => { x.textos.reclamo = 'x'.repeat(81); }), 'avisa', 'definicoes:textos.reclamo:tamanho'],
    ['aviso da visita que é um número (rebentava o gerador)', def((x) => { x.textos.aviso_visita = 5; }), 'bloqueia', 'definicoes:textos.aviso_visita:forma'],
    ['aviso da visita com um ** sem par', def((x) => { x.textos.aviso_visita = 'Com marcação, em **Vila do Conde.'; }), 'avisa', 'definicoes:textos.aviso_visita:negrito'],
    ['«Mostrar vendidas» como texto', def((x) => { x.opcoes.mostrar_vendidos = 'sim'; }), 'avisa', 'definicoes:opcoes.mostrar_vendidos'],
    ['denominação social vazia', def((x) => { x.empresa.denominacao_social = ''; }), 'bloqueia', 'definicoes:empresa.denominacao_social'],
    ['forma jurídica vazia', def((x) => { delete x.empresa.forma_juridica; }), 'bloqueia', 'definicoes:empresa.forma_juridica'],
    ['capital social vazio', def((x) => { x.empresa.capital_social = ''; }), 'bloqueia', 'definicoes:empresa.capital_social'],
    ['NIF vazio', def((x) => { delete x.empresa.nif; }), 'bloqueia', 'definicoes:empresa.nif'],
    ['NIF com o algarismo de controlo errado', def((x) => { x.empresa.nif = '517541905'; }), 'bloqueia', 'definicoes:empresa.nif'],
    ['NIF 000000000 «de espera»', def((x) => { x.empresa.nif = '000000000'; }), 'bloqueia', 'definicoes:empresa.nif'],
    ['capital social sem algarismos', def((x) => { x.empresa.capital_social = 'vinte mil euros'; }), 'avisa', 'definicoes:empresa.capital_social:formato'],
    ['nome comercial vazio', def((x) => { x.empresa.nome_comercial = ''; }), 'avisa', 'definicoes:empresa.nome_comercial'],
    ['«</script>» num texto das definições', def((x) => { x.textos.sobre_texto += '</script>'; }), 'bloqueia', 'definicoes:partia-a-pagina'],
    ['sede social só com a rua', def((x) => { x.sede_social = { morada: 'Rua Dom Egas Pais 837' }; }), 'avisa', 'definicoes:sede_social.codigo_postal'],
    ['sede social com o código postal mal escrito', def((x) => { x.sede_social = { morada: 'Rua Dom Egas Pais 837', codigo_postal: '4730 531', localidade: 'São Miguel Carreiras' }; }), 'avisa', 'definicoes:sede_social.codigo_postal'],
    ['definições a chegar ao limite do painel', def((x) => { x.textos.locais = 'x'.repeat(60000); }), 'avisa', 'definicoes:tecto', undefined, true],
  ];
  const SEM_PROBLEMA = [
    ['vendida sem matrícula, sem donos e sem preço (os lembretes são do anúncio)', viat(V, (v) => { delete v.matricula; delete v.registos_anteriores; delete v.preco; delete v.km; })],
    ['rascunho (não publicado) sem matrícula nem preço', viat(J, (v) => { v.publicado = false; delete v.preco; })],
    ['estado «vendido » com um espaço (o gerador apara)', viat(J, (v) => { v.estado = 'vendido '; })],
    ['carroçaria «SUV » com um espaço (o gerador apara)', viat(J, (v) => { v.carrocaria = 'SUV '; })],
    ['preço com 2 casas', viat(J, (v) => { v.preco = 13990.5; })],
    ['0 quilómetros e 0 donos anteriores (zero é uma escolha)', viat(J, (v) => { v.km = 0; v.registos_anteriores = 0; })],
    ['garantia «18 meses»', viat(J, (v) => { v.garantia = '18 meses'; })],
    ['garantia «24 meses»', viat(J, (v) => { v.garantia = '24 meses'; })],
    ['garantia «Garantia mútuo acordo»', viat(J, (v) => { v.garantia = 'Garantia mútuo acordo'; })],
    ['garantia «Garantia de fábrica até 2027»', viat(J, (v) => { v.garantia = 'Garantia de fábrica até 2027'; })],
    ['garantia vazia (o site mostra a garantia legal)', viat(J, (v) => { delete v.garantia; })],
    [`ano ${anoSeguinte} (o ano seguinte)`, viat(J, (v) => { v.ano = anoSeguinte; })],
    ['ano de construção igual ao da matrícula', viat(J, (v) => { v.ano_construcao = 2013; })],
    ['ano de construção um ano antes', viat(J, (v) => { v.ano_construcao = 2012; })],
    ['matrícula «AA-00-BB», «00-AA-00» e «AA 00 BB»', viat(J, (v) => { v.matricula = 'AA-00-BB'; }), viat(J, (v) => { v.matricula = '00-AA-00'; }), viat(J, (v) => { v.matricula = 'AA 00 BB'; })],
    ['fotografia com espaços e acentos que existe (o Nissan Patrol)', viat(N, () => {})],
    ['fotografia com a barra à frente', viat(J, (v) => { v.fotos[0] = '/' + v.fotos[0]; })],
    ['fotografia só com o nome, na pasta da viatura', viat(J, (v) => { v.fotos[0] = v.fotos[0].split('/').pop(); })],
    ['fotografia na forma antiga, com a largura, que tem as geradas', viat(J, (v) => { v.fotos[0] = v.fotos[0].replace(/\.[a-z]+$/i, '-1600.webp'); })],
    ['fotografia escrita com outra extensão (o gerador procura pelo nome)', viat(J, (v) => { v.fotos[0] = v.fotos[0].replace(/\.jpg$/i, '.jpeg'); })],
    ['uma linha vazia na lista das fotografias (o gerador deita-a fora)', viat(J, (v) => { v.fotos.push(''); })],
    ['descrição com **negrito** certo e U+2028 (como a do Corsa)', viat(J, (v) => { v.descricao = 'Viatura **nacional**,\u2028revista.\n\n**Garantia** incluída.'; })],
    ['outro telemóvel no telefone 2', def((x) => { x.contactos.telefone_2 = '931234567'; x.contactos.telefone_2_texto = '931 234 567'; })],
    ['um fixo no telefone 1 (o site diz «rede fixa» junto dele)', def((x) => { x.contactos.telefone_1 = '253123456'; x.contactos.telefone_1_texto = '253 123 456'; })],
    ['um fixo de Lisboa no telefone 2, escrito «21 123 4567»', def((x) => { x.contactos.telefone_2 = '211234567'; x.contactos.telefone_2_texto = '21 123 4567'; })],
    ['sem o telefone 2 (os dois campos vazios: o site mostra só o 1, sem linha vazia)', def((x) => { x.contactos.telefone_2 = ''; delete x.contactos.telefone_2_texto; }), def((x) => { delete x.contactos.telefone_2; delete x.contactos.telefone_2_texto; })],
    ['horário de outras maneiras que o Google percebe', def((x) => { x.horario = [{ dias: '2.ª a 6.ª', horas: '9h-12h30 e 14h-19h' }, { dias: 'Sábados', horas: 'Das 9:00 às 13:00' }, { dias: 'Domingos e feriados', horas: 'Encerrado' }]; }),
      def((x) => { x.horario = [{ dias: 'Seg-Sex', horas: '9.00-19.00' }, { dias: 'Fim de semana', horas: 'Fechado' }]; }), def((x) => { x.horario = [{ dias: 'Todos os dias', horas: '24 horas' }]; })],
    ['o domingo fechado em duas linhas (dizem o mesmo)', def((x) => { x.horario.push({ dias: 'Domingo', horas: 'Encerrado' }); })],
    ['uma linha fechada com dias que o Google não percebe («Feriados» · «Fechado»: não lhe tira nada)', def((x) => { x.horario.push({ dias: 'Feriados', horas: 'Fechado' }); })],
    ['telefone 1 (como aparece) com «+351»', def((x) => { x.contactos.telefone_1_texto = '+351 961 053 363'; })],
    ['email válido', def((x) => { x.contactos.email = 'geral@lrmotorsautomoveis.pt'; })],
    ['TikTok com https', def((x) => { x.redes.tiktok = 'https://www.tiktok.com/@lrmotors'; })],
    ['sede social completa', def((x) => { x.sede_social = { morada: 'Rua Dom Egas Pais 837', codigo_postal: '4730-531', localidade: 'São Miguel Carreiras', distrito: 'Braga' }; })],
    ['NIF escrito como número', def((x) => { x.empresa.nif = 517541904; })],
    ['sem o aviso da visita', def((x) => { delete x.textos.aviso_visita; })],
    ['sem o «tecnico» (sai no dia da troca)', def((x) => { delete x.tecnico; })],
  ];
  const chavesHoje = new Set(hoje.map((p) => `${p.classe}|${p.chave}`));
  for (const [desc, mudar, classe, chave, efeito, lembrete] of CASOS) {
    const d = dadosDeHoje(); mudar(d);
    const lista = R.problemas(d, OP);
    const achado = lista.find((p) => p.classe === classe && (chave instanceof RegExp ? chave.test(p.chave) : p.chave === chave));
    certo(Boolean(achado) && (!efeito || achado.efeito === efeito) && Boolean(achado.lembrete) === Boolean(lembrete) && achado.ecra && achado.mensagem && ECRAS.test(achado.ecra),
      `${desc} → ${classe}${efeito ? ` (${efeito})` : ''}${lembrete ? ' (lembrete)' : ''}`,
      achado ? JSON.stringify(achado) : lista.filter((p) => !chavesHoje.has(`${p.classe}|${p.chave}`)).map((p) => `${p.classe} ${p.chave}`).join(', ') || 'nenhum problema');
    if (classe === 'neutraliza') certo(deClasse(lista, 'bloqueia').length === 0, '   e não pára a publicação');
  }
  for (const [desc, ...mudancas] of SEM_PROBLEMA) {
    const novos = mudancas.flatMap((mudar) => { const d = dadosDeHoje(); mudar(d); return R.problemas(d, OP).filter((p) => !chavesHoje.has(`${p.classe}|${p.chave}`)); });
    certo(novos.length === 0, `${desc} → sem problema novo (a regra também sabe dizer «sim»)`, novos.map((p) => `${p.classe} ${p.chave}`).join(', '));
  }

  // O CLI: cada viatura partida sai com 0; cada «bloqueia» sai com 1.
  {
    let cliViaturas = 0; let cliBloqueia = 0; const cliFalhas = [];
    for (const [desc, mudar, classe] of CASOS) {
      if (classe === 'avisa') continue;
      const d = dadosDeHoje(); mudar(d);
      const dir = repoDeEnsaio(d);
      const r = guardaEm(dir);
      const esperado = classe === 'bloqueia' ? 1 : 0;
      if (r.status !== esperado) cliFalhas.push(`${desc}: saiu ${r.status} ${r.err.slice(-200)}`);
      else if (classe === 'bloqueia') cliBloqueia++; else cliViaturas++;
      rmSync(dir, { recursive: true, force: true });
    }
    certo(cliFalhas.length === 0 && cliViaturas >= 15 && cliBloqueia >= 30, `a guarda verdadeira: ${cliViaturas} viaturas partidas saem com 0, ${cliBloqueia} problemas de estrutura ou da lei saem com 1`, cliFalhas.join(' | '));
  }
  {
    // O que só o disco tem: um «.json» que é uma pasta.
    const dir = repoDeEnsaio(dadosDeHoje());
    mkdirSync(join(dir, 'data', 'viaturas', 'pasta.json'));
    const r = guardaEm(dir);
    certo(r.status === 1 && r.relatorio && r.relatorio.problemas.some((p) => p.classe === 'bloqueia' && p.chave === 'estrutura:data/viaturas/pasta.json'), 'um «.json» que é uma pasta pára (o gerador rebentava a lê-lo)', r.out.slice(-300));
    rmSync(dir, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('uma chave, uma classe (o Worker do painel compara só a chave)');
  {
    /* Cada campo de cada ficheiro apagado ou trocado por valores de cada tipo,
       com a viatura à venda, vendida e escondida. */
    const VALS = ['', ' ', 'x', 'Março', 'vendido', '3 anos', '12 meses', 'a**b', '\u0001', '"', '</script>', null, undefined, 5, -1, 0, 2.5, 2013, 1949, true, false, [], {}, [null], ['x'], 'x'.repeat(7000), 'https://x.pt', 'javascript:alert(1)', '961053363', '351961053363', '4730-251', '517541904'];
    const classes = new Map();
    const registar = (lista) => { for (const p of lista) { if (!classes.has(p.chave)) classes.set(p.chave, new Set()); classes.get(p.chave).add(p.classe + (p.lembrete ? ' (lembrete)' : '')); } };
    const caminhos = (o, pre = []) => Object.entries(o).flatMap(([k, v]) => (v !== null && typeof v === 'object' ? [[...pre, k], ...caminhos(v, [...pre, k])] : [[...pre, k]]));
    let n = 0;
    for (const cam of caminhos(HOJE.definicoes)) {
      for (const v of VALS) {
        const d = clonar(HOJE.definicoes); let o = d; for (const k of cam.slice(0, -1)) o = o[k];
        if (v === undefined) delete o[cam.at(-1)]; else o[cam.at(-1)] = clonar(v);
        registar(R.problemas({ definicoes: d }, OP)); n++;
      }
    }
    for (const [pasta, nome] of [['viaturas', J], ['viaturas', P], ['vendidas', V], ['vendidas', N]]) {
      for (const k of [...new Set([...Object.keys(HOJE[pasta][nome]), ...R.CAMPOS_VIATURA])]) {
        for (const v of VALS) {
          for (const estado of ['disponivel', 'vendido', 'escondida']) {
            const x = clonar(HOJE[pasta][nome]);
            if (v === undefined) delete x[k]; else x[k] = clonar(v);
            if (estado === 'escondida') x.publicado = false; else if (k !== 'estado') x.estado = estado;
            registar(R.problemas({ [pasta]: { [nome]: x } }, OP)); n++;
          }
        }
      }
    }
    const duplas = [...classes].filter(([, c]) => c.size > 1).map(([k, c]) => `${k} (${[...c].join(' e ')})`);
    certo(classes.size > 120 && duplas.length === 0, `${n} variações, ${classes.size} chaves: nenhuma aparece com duas classes`, duplas.join(' · '));
  }

  /* ================================================================== */
  secao('varrimento: apagar cada chave, uma a uma');
  {
    /* O caminho do cliente (memória testar-o-caminho-do-cliente): o Pages CMS
       apaga as chaves dos campos que ficam vazios. Cada viatura de hoje, sem
       cada uma das suas chaves. */
    const LEMBRETE_SE_A_VENDA = { matricula: 'sem-matricula', registos_anteriores: 'sem-donos', ano: 'sem-ano', preco: 'sem-preco', km: 'sem-km', fotos: 'sem-fotos' };
    let n = 0; const f = [];
    for (const pasta of ['viaturas', 'vendidas']) {
      for (const [nome, v0] of Object.entries(HOJE[pasta])) {
        const base = R.problemas({ [pasta]: { [nome]: v0 } }, OP);
        const aVenda = R.aVendaNoSite(v0);
        for (const k of Object.keys(v0)) {
          const v = clonar(v0); delete v[k]; n++;
          let lista;
          try { lista = R.problemas({ [pasta]: { [nome]: v } }, OP); } catch (e) { f.push(`${nome} sem ${k}: rebentou (${e.message})`); continue; }
          const novos = lista.filter((x) => !base.some((b) => b.chave === x.chave && b.classe === x.classe));
          const esperado = k === 'marca' || k === 'modelo' ? 'neutraliza'
            : k === 'tipo' || k === 'estado' ? 'avisa'
              : LEMBRETE_SE_A_VENDA[k] && aVenda ? 'lembrete' : null;
          const ok = esperado === null ? novos.length === 0
            : esperado === 'lembrete' ? novos.some((x) => x.lembrete && x.chave.endsWith(`:${LEMBRETE_SE_A_VENDA[k]}`)) && novos.every((x) => x.lembrete)
              : novos.some((x) => x.classe === esperado && x.campo === k && !x.lembrete);
          if (!ok) f.push(`${nome} sem ${k}: esperava ${esperado || 'nada'}, veio ${novos.map((x) => `${x.classe}${x.lembrete ? '(L)' : ''} ${x.chave}`).join(',') || 'nada'}`);
          for (const x of lista) if (!bemDito(x)) f.push(`${nome} sem ${k}: mensagem mal dita: ${x.ecra} / ${x.mensagem}`);
        }
      }
    }
    certo(f.length === 0 && n > 300, `viaturas: ${n} chaves apagadas; marca e modelo escondem, tipo e estado avisam, os campos da lei lembram nas que estão à venda, o resto passa — e cada mensagem nomeia o ecrã`, f.slice(0, 6).join(' | '));
  }
  {
    const caminhos = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => {
      const c = pre ? `${pre}.${k}` : k;
      return v && typeof v === 'object' ? [c, ...caminhos(v, c)] : [c];
    });
    const apagar = (o, c) => { const partes = c.split('.'); const ult = partes.pop(); let x = o; for (const p of partes) x = x[p]; if (Array.isArray(x)) x.splice(Number(ult), 1); else delete x[ult]; };
    const ESPERADO = (c) => {
      if (/^(contactos|stand|redes|textos|opcoes|empresa|horario)$/.test(c)) return 'bloqueia';
      if (/^contactos\.(telefone_1|telefone_1_texto|telefone_2|telefone_2_texto|whatsapp)$/.test(c)) return 'bloqueia';
      if (/^stand\.(morada|codigo_postal|localidade)$/.test(c)) return 'bloqueia';
      if (/^empresa\.(denominacao_social|nif|capital_social|forma_juridica)$/.test(c)) return 'bloqueia';
      if (/^stand\.(distrito|latitude|longitude)$/.test(c) || /^horario\.\d+\.(dias|horas)$/.test(c)) return 'avisa';
      if (/^textos\.(reclamo|hero_titulo|hero_texto|sobre_titulo|sobre_texto)$/.test(c) || c === 'opcoes.mostrar_vendidos' || c === 'empresa.nome_comercial') return 'avisa';
      return null;   // contactos.email, stand.pais, stand.mapa, redes.*, textos.locais, textos.aviso_visita, empresa.cae, horario.N, tecnico…
    };
    const base = R.problemas({ definicoes: HOJE.definicoes }, OP);
    let n = 0; const f = [];
    for (const c of caminhos(HOJE.definicoes)) {
      const o = clonar(HOJE.definicoes); apagar(o, c); n++;
      let lista;
      try { lista = R.problemas({ definicoes: o }, OP); } catch (e) { f.push(`${c}: rebentou (${e.message})`); continue; }
      const novos = lista.filter((x) => !base.some((b) => b.chave === x.chave && b.classe === x.classe));
      const esp = ESPERADO(c);
      if (esp === null && novos.length) f.push(`${c} (opcional): ${novos.map((x) => `${x.classe} ${x.chave}`).join(',')}`);
      if (esp && !novos.some((x) => x.classe === esp && !x.lembrete)) f.push(`${c}: esperava ${esp}, veio ${novos.map((x) => `${x.classe} ${x.chave}`).join(',') || 'nada'}`);
      for (const x of novos) if (!bemDito(x)) f.push(`${c}: mensagem mal dita: ${x.ecra} / ${x.mensagem}`);
    }
    certo(f.length === 0 && n > 40, `definicoes.json: ${n} caminhos apagados, cada um com o problema certo ou nenhum, e a mensagem nomeia o ecrã`, f.slice(0, 6).join(' | '));
  }

  /* ================================================================== */
  secao('as anotações: 9 de cada, e «e mais N»');
  {
    const d = dadosDeHoje(); d.viaturas = {}; d.vendidas = {};
    for (let i = 0; i < 30; i++) d.viaturas[`partida-${i}`] = '{"marca": ';
    const dir = repoDeEnsaio(d);
    const resumoF = join(TMP, 'resumo.md'); writeFileSync(resumoF, '');
    const r = guardaEm(dir, { GITHUB_STEP_SUMMARY: resumoF });
    const erros = r.out.split('\n').filter((l) => l.startsWith('::error'));
    const resumo = readFileSync(resumoF, 'utf8');
    certo(r.status === 1, '30 problemas que param: sai com 1');
    certo(erros.length === 10 && erros.slice(0, 9).every((l) => l.includes('title=')) && /e mais 21 — veja o resumo/.test(erros[9]), '9 ::error com o ecrã, e a 10.ª diz «e mais 21»', `${erros.length} linhas ::error`);
    certo((resumo.match(/^\| PÁRA \|/gm) || []).length === 30, 'o resumo da corrida tem os 30');
    certo(r.relatorio && r.relatorio.bloqueia === 30 && r.relatorio.problemas.length === 30, 'e o relatório também');
    rmSync(dir, { recursive: true, force: true });
  }
  {
    const d = dadosDeHoje();
    for (let i = 0; i < 30; i++) d.viaturas[`sem-marca-${String(i).padStart(2, '0')}`] = { ...clonar(HOJE.viaturas[J]), marca: '' };
    const dir = repoDeEnsaio(d);
    const r = guardaEm(dir);
    const warn = r.out.split('\n').filter((l) => l.startsWith('::warning'));
    const notice = r.out.split('\n').filter((l) => l.startsWith('::notice'));
    const total = r.relatorio.problemas.filter((p) => p.classe !== 'bloqueia' && !p.lembrete).length;
    const nLembretes = r.relatorio.problemas.filter((p) => p.lembrete).length;
    certo(r.status === 0, '30 viaturas sem marca: sai com 0');
    certo(warn.length === 10 && new RegExp(`e mais ${total - 9} — veja`).test(warn[9]) && warn.slice(0, 9).every((l) => l.includes('Muda no site: ')), `9 ::warning (as que mudam no site primeiro) e «e mais ${total - 9}»`, `${warn.length} linhas`);
    certo(notice.length === 10 && new RegExp(`e mais ${nLembretes - 9} — veja`).test(notice[9]) && notice.slice(0, 9).every((l) => l.includes('Lembrete: ')), `os lembretes à parte, em ::notice: 9 e «e mais ${nLembretes - 9}»`, `${notice.length} linhas`);
    certo(r.relatorio.neutralizados.length === 30 && r.relatorio.neutralizados.every((e) => e.descricao === 'escondida do site'), 'o relatório diz que as 30 ficam escondidas do site');
    rmSync(dir, { recursive: true, force: true });
  }
  certo(G.anotacoes([{ classe: 'avisa', ficheiro: 'data/x.json', ecra: 'A, b: c', mensagem: '50% feito\nlinha 2' }])[0] === '::warning file=data/x.json,title=A%2C b%3A c::50%25 feito%0Alinha 2', 'as anotações escapam %, mudanças de linha, : e ,');
  {
    /* A CONSOLA. O runner lê comandos no que a guarda escreve: «::x::» no
       princípio de uma linha, e «##[x]» em QUALQUER sítio de uma linha (ver
       .github/consola.mjs). A listagem leva os dados tal e qual — o nome da
       viatura, o caminho de uma fotografia, o texto da garantia — e nenhum pode
       abrir um comando: as únicas linhas de comando são as anotações da própria
       guarda. As linhas partem-se como o runner as parte: \n, \r e \r\n. */
    const d = dadosDeHoje();
    d.viaturas[P].fotos.push('LINHA-A\n::error title=Injectado::pela fotografia.jpg');   // a mensagem da foto-invalida leva o nome
    d.viaturas[P].modelo = 'Puma ##[warning]Injectado pelo modelo';                      // o ecrã e o «MUDA NO SITE» levam o nome
    d.viaturas[J].garantia = '36 meses\r##[error]Injectado pela garantia';               // o lembrete dos 3 anos leva o texto
    const dir = repoDeEnsaio(d);
    const r = guardaEm(dir);
    const n = correr('node', [GUARDA, '--neutralizar', dir]);
    const daGuarda = new Set(G.anotacoes(r.relatorio ? r.relatorio.problemas : []));
    const comandos = (out) => out.split(/\r\n|\r|\n/).filter((l) => !daGuarda.has(l) && (l.trimStart().startsWith('::') || l.includes('##[')));
    const maus = [...comandos(r.out), ...comandos(n.out)];
    certo(r.status === 0 && n.status === 0 && daGuarda.size > 0 && maus.length === 0,
      'na consola, um dado com uma mudança de linha ou um «##[» não abre comando nenhum do runner (as únicas linhas de comando são as anotações da guarda)', maus.slice(0, 4).join(' ‖ '));
    certo(/NO SITE {2}Viaturas › Ford Puma ## \[warning\]Injectado pelo modelo/.test(r.out) && /«LINHA-A ::error title=Injectado::pela fotografia\.jpg»/.test(r.out) && /no site: Ford Puma ## \[warning\]Injectado/.test(n.out),
      '   e o texto continua lá, numa linha só, para quem lê a corrida', [...r.out.split('\n'), ...n.out.split('\n')].filter((l) => /Injectado/.test(l)).slice(0, 4).join(' ‖ '));
    rmSync(dir, { recursive: true, force: true });
  }
  {
    const LS = String.fromCharCode(0x2028); const PS = String.fromCharCode(0x2029); const NEL = String.fromCharCode(0x85);
    certo(umaLinha(`a\nb\r\nc${LS}d${NEL}e\u0000f${PS}g ##[error]x ###[y]`) === 'a b c d e f g ## [error]x ### [y]', 'umaLinha: o controlo (C0, DEL, C1) e os separadores de linha passam a espaço, e o «##[» leva um espaço');
  }

  /* ================================================================== */
  secao('a cópia que o gerador lê');
  {
    const d = dadosDeHoje();
    delete d.viaturas[J].marca;                                          // escondida
    d.viaturas[P].fotos.push('assets/img/logo.svg');                      // fora da biblioteca: sai da lista
    d.vendidas[V].fotos[1] = 'assets/veiculos/APAGADA.jpeg';              // já não existe: fica (o gerador salta-a)
    const dir = repoDeEnsaio(d);
    const texto = (pasta, nome) => readFileSync(join(dir, R.ficheiroDaViatura(pasta, nome)), 'utf8');
    const antes = { J: texto('viaturas', J), P: texto('viaturas', P), V: texto('vendidas', V) };
    const outros = Object.keys(d.viaturas).filter((n) => n !== J && n !== P).map((n) => [n, statSync(join(dir, R.ficheiroDaViatura('viaturas', n))).mtimeMs]);
    const r = guardaEm(dir);
    certo(r.status === 0 && r.relatorio.neutralizados.length === 3, 'três viaturas partidas: a guarda sai com 0 e o relatório diz que 3 mudam no site', `${r.status} ${JSON.stringify(r.relatorio && r.relatorio.neutralizados.map((e) => `${e.slug}: ${e.descricao}`))}`);
    certo(Object.values(antes).every((t, i) => t === [texto('viaturas', J), texto('viaturas', P), texto('vendidas', V)][i]), '   (conferir não escreve nada)');
    const n = correr('node', [GUARDA, '--neutralizar', dir, '--relatorio-em', join(dir, 'rel2.json')]);
    const esperadoJ = clonar(d.viaturas[J]); esperadoJ.publicado = false;
    const esperadoP = clonar(d.viaturas[P]); esperadoP.fotos.pop();
    certo(n.status === 0 && texto('viaturas', J) === R.serializar(esperadoJ, R.terminacaoDe(antes.J)), 'sem marca: na cópia fica «Publicado no site: não», e mais nada muda no ficheiro (mesma ordem de chaves, mesma terminação)', n.err);
    certo(texto('viaturas', P) === R.serializar(esperadoP, R.terminacaoDe(antes.P)), 'a fotografia de fora da biblioteca sai da lista da cópia, e só ela');
    certo(texto('vendidas', V) === antes.V, 'a fotografia que já não existe fica na lista (o gerador salta-a; tirá-la podia esvaziar a lista e mostrar a pasta inteira)');
    certo(outros.every(([nome, t]) => statSync(join(dir, R.ficheiroDaViatura('viaturas', nome))).mtimeMs === t), 'as outras viaturas nem se tocam');
    const n2 = correr('node', [GUARDA, '--neutralizar', dir]);
    certo(n2.status === 0 && /nada a neutralizar/.test(n2.out), 'outra vez: não há mais nada a mudar (é idempotente)', n2.out + n2.err);
    rmSync(dir, { recursive: true, force: true });
  }
  {
    const dir = repoDeEnsaio(TEXTO);
    const tempos = () => readdirSync(join(dir, 'data', 'viaturas')).filter((f) => f.endsWith('.json')).map((f) => statSync(join(dir, 'data', 'viaturas', f)).mtimeMs).join(',');
    const t0 = tempos();
    const n = correr('node', [GUARDA, '--neutralizar', dir]);
    certo(n.status === 0 && tempos() === t0 && Object.entries(TEXTO.viaturas).every(([nome, t]) => readFileSync(join(dir, R.ficheiroDaViatura('viaturas', nome)), 'utf8') === t), 'com os dados de hoje, a cópia nem se toca (byte a byte, e a hora dos ficheiros também)');
    rmSync(dir, { recursive: true, force: true });
  }
  {
    const d = dadosDeHoje(); d.definicoes.empresa.nif = '1'; delete d.viaturas[J].marca;
    const dir = repoDeEnsaio(d);
    const antes = readFileSync(join(dir, R.ficheiroDaViatura('viaturas', J)), 'utf8');
    const n = correr('node', [GUARDA, '--neutralizar', dir]);
    certo(n.status === 1 && readFileSync(join(dir, R.ficheiroDaViatura('viaturas', J)), 'utf8') === antes, '--neutralizar com um «bloqueia» sai com 1 e não escreve nada');
    rmSync(dir, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('ajudantes');
  certo(R.gerarSlug('Mercedes-Benz', 'Classe E', 'E 300 de 9G-TRONIC AMG Line') === 'mercedes-benz-classe-e-e-300-de-9g-tronic-amg-line', 'gerarSlug: minúsculas, o resto passa a hífen');
  certo(R.gerarSlug('Citroën', 'C3', 'Aircross 1.2 PureTech') === 'citroen-c3-aircross-1-2-puretech' && R.gerarSlug('Škoda', 'Octávia', '') === 'skoda-octavia', 'gerarSlug: sem acentos');
  certo(R.gerarSlug('Ford ', ' Puma', '1.0 EcoBoost Titanium ') === 'ford-puma-1-0-ecoboost-titanium' && R.gerarSlug('Smart', 'Fortwo', null) === 'smart-fortwo', 'gerarSlug: espaços nas pontas e versão vazia');
  certo(R.gerarSlug('Jaguar', 'XF', '2.2 D Premium Luxury', Object.keys(HOJE.viaturas)) === 'jaguar-xf-2-2-d-premium-luxury-2', 'gerarSlug: -2 se já existir (o Jaguar de hoje)');
  certo(R.gerarSlug('Polaris', 'RZR', '', new Set(['polaris-rzr', 'polaris-rzr-2'])) === 'polaris-rzr-3', 'gerarSlug: -3 depois do -2 — e as pastas da biblioteca contam (assets/veiculos/polaris-rzr é do Polaris vendido)');
  certo(R.gerarSlug('', '', '') === 'viatura' && R.gerarSlug('!!!', '', '').length > 0 && R.gerarSlug('x'.repeat(200), '', '').length === 80, 'gerarSlug: sem letras, «viatura»; corta a 80');
  certo(Object.keys({ ...HOJE.viaturas, ...HOJE.vendidas }).every((n) => R.slugDoFicheiro(n) === n) && R.slugDoFicheiro('renault-captur-.json') === 'renault-captur' && R.slugDoFicheiro('a--b') === 'a-b', 'slugDoFicheiro: como o gerador (os de hoje são o próprio nome; «renault-captur-» é «renault-captur»)');
  certo(R.nifValido('517541904') && R.nifValido(517541904) && !R.nifValido('517541905') && !R.nifValido('000000000') && !R.nifValido('51754190') && !R.nifValido(' 517541904'), 'nifValido: o da LR sim; controlo errado, zeros, 8 algarismos ou espaços não');
  certo(R.terminacaoDe('{}\n') === '\n' && R.terminacaoDe('{}') === '' && R.serializar({ a: 1 }, '\n') === '{\n  "a": 1\n}\n' && R.serializar({ a: 1 }) === '{\n  "a": 1\n}', 'serializar/terminacaoDe: 2 espaços e a terminação de cada ficheiro');
  certo(R.mesesDeGarantia('18 meses') === 18 && R.mesesDeGarantia('Garantia 3 anos Peugeot') === 36 && R.mesesDeGarantia('36 meses') === 36 && R.mesesDeGarantia('12') === 12 && R.mesesDeGarantia('um ano') === 12
    && R.mesesDeGarantia('Garantia mútuo acordo') === null && R.mesesDeGarantia('') === null && R.mesesDeGarantia('18 meses - BREVEMENTE') === 18 && R.mesesDeGarantia('2024 anos?') === null, 'mesesDeGarantia: meses, anos, por extenso, só algarismos; null quando não diz um prazo');
  certo(R.negritoCerto('a **b** c') && !R.negritoCerto('a **b c') && !R.negritoCerto('**a\nb**') && R.negritoCerto('**a**\n\n**b**') && R.negritoCerto('5* de 5') && R.negritoCerto('Em **Vila do\nConde**', { porParagrafo: false }), 'negritoCerto: como o gerador o lê (na descrição, o negrito não atravessa linhas)');
  {
    const puma = HOJE.viaturas[P];   // destaque e ordem no fim, à moda antiga
    const depois = { ...puma, preco: 18990, registos_anteriores: 1, iva_dedutivel: false, extra: 1 };
    const o = Object.keys(R.ordenarComo(puma, depois));
    const i = (k) => o.indexOf(k);
    certo(i('preco') === i('carrocaria') + 1 && i('iva_dedutivel') === i('preco') + 1 && i('registos_anteriores') === i('garantia') - 1 && o.at(-1) === 'extra' && o.slice(-3, -1).join() === 'destaque,ordem',
      'ordenarComo: as chaves que lá estavam ficam onde estavam; as novas entram pela ordem do .pages.yml; as desconhecidas no fim', o.join(' '));
    certo(Object.keys(R.ordenarComo(puma, { ...puma, garantia: undefined })).length === Object.keys(puma).length && !('fotos' in R.ordenarComo(puma, (({ fotos, ...x }) => x)(puma))), '   e as que saíram, saem');
  }
  {
    const d0 = HOJE.definicoes;
    certo(R.mudancasBloqueadas(d0, { ...clonar(d0), contactos: { ...d0.contactos, email: 'a@b.pt' } }).length === 0, 'mudancasBloqueadas: os contactos mudam-se (são do dono)');
    certo(JSON.stringify(R.mudancasBloqueadas(d0, { ...clonar(d0), tecnico: { worker_fotos: 'https://outro.workers.dev' } })) === '[{"caminho":"tecnico","motivo":"mudou"}]', 'mudancasBloqueadas: o «tecnico» não muda pelo painel');
    certo(JSON.stringify(R.mudancasBloqueadas(d0, { ...clonar(d0), sede_social: { morada: 'x' }, outra: 1 })) === '[{"caminho":"outra","motivo":"chave_nova"}]', 'mudancasBloqueadas: a sede social pode nascer (é um ecrã); uma chave de topo desconhecida não');
    const j = HOJE.viaturas[J];
    certo(R.mudancasBloqueadas(j, { ...clonar(j), preco: 12990, matricula: 'AA-00-BB' }, 'viatura').length === 0, 'mudancasBloqueadas (viatura): os campos do .pages.yml mudam-se');
    certo(JSON.stringify(R.mudancasBloqueadas({ ...j, slug: 'x' }, { ...clonar(j), slug: 'y', novo: 1 }, 'viatura')) === '[{"caminho":"slug","motivo":"mudou"},{"caminho":"novo","motivo":"chave_nova"}]', 'mudancasBloqueadas (viatura): uma chave que o painel não conhece não muda, nem aparece');
  }
  {
    const pastas = { 'assets/veiculos/a': ['x.jpg', 'y.jpeg', 'pasta'], 'assets/fotos/a': ['z-480.webp', 'z-960.webp', 'z-1600.webp'], 'assets/veiculos': ['solta.jpg'] };
    const l = (p) => pastas[p] || [];
    const e = (c, s = 'a') => R.fotografiaExiste(c, s, l);
    certo(e('assets/veiculos/a/x.jpg') && e('assets/veiculos/a/y.jpg') && e('assets/veiculos/a/z.jpg') && e('assets/veiculos/a/z-1600.webp') && e('/assets/veiculos/a/x.jpg') && e('x.jpg') && e('assets/veiculos/solta.jpg') && e('assets/veiculos/a/pasta.jpg')
      && !e('assets/veiculos/a/w.jpg') && !e('assets/veiculos/b/x.jpg') && !e('x.jpg', 'b'), 'fotografiaExiste: o nome, o nome sem extensão, as geradas, a barra à frente, só o nome (na pasta da viatura), a raiz da biblioteca — como o resolver() do gerador');
  }

  /* ================================================================== */
  secao('o horário que o site dá ao Google (lerHorario), casos reais e hostis');
  {
    const D = (x) => JSON.stringify(R.lerDiasDoHorario(x));
    const H = (x) => JSON.stringify(R.lerHorasDoHorario(x));
    const NBSP = String.fromCharCode(0xA0); const TRAVESSAO = String.fromCharCode(0x2014);
    const SS = '[0,1,2,3,4]';
    const DIAS = [
      ['Segunda a sexta', SS], ['segunda à sexta', SS], ['De segunda-feira a sexta-feira', SS], ['2.ª a 6.ª', SS], ['2ª-6ª', SS], ['Seg-Sex', SS],
      ['Seg. a Sex.', SS], ['Das segundas às sextas', SS], ['Segunda até sexta', SS], ['Dias úteis', SS], ['  SEGUNDA   A SEXTA ', SS],
      ['Sábado', '[5]'], ['Sábados', '[5]'], ['Aos sábados', '[5]'], ['Sáb.', '[5]'], ['Domingo', '[6]'],
      ['Sábado e domingo', '[5,6]'], ['Fim de semana', '[5,6]'], ['Fins-de-semana', '[5,6]'], ['Seg/Qua/Sex', '[0,2,4]'], ['Segunda, quarta e sexta', '[0,2,4]'],
      ['Todos os dias', '[0,1,2,3,4,5,6]'], ['Segunda a domingo', '[0,1,2,3,4,5,6]'], ['Sexta a segunda', '[0,4,5,6]'], ['Segunda a sexta e sábado', '[0,1,2,3,4,5]'],
      ['Feriados', 'null'], ['Domingos e feriados', 'null'], ['Segunda a sexta (exceto feriados)', 'null'], ['segunda a segunda', 'null'], ['Sábado de manhã', 'null'],
      ['Segunda,', 'null'], ['', 'null'], ['   ', 'null'], ['constructor', 'null'], ['__proto__', 'null'], ['</script><script>alert(1)</script>', 'null'], ['x'.repeat(5000), 'null'],
    ];
    const falhasD = DIAS.filter(([t, e]) => D(t) !== e).map(([t, e]) => `«${t.slice(0, 30)}» deu ${D(t)}, esperava ${e}`);
    const naoTexto = [null, undefined, 5, {}, [], ['Sábado']].every((x) => R.lerDiasDoHorario(x) === null && R.lerHorasDoHorario(x) === null);
    certo(falhasD.length === 0 && naoTexto, `lerDiasDoHorario: ${DIAS.length} formas, das que o dono escreve às hostis (as que não percebe dão null; o que não é texto também)`, falhasD.join(' | '));
    const U = '[["09:00","19:00"]]';
    const HORAS = [
      ['09:00 – 19:00', U], [`09:00 ${TRAVESSAO} 19:00`, U], [`09:00${NBSP}–${NBSP}19:00`, U], ['9h-19h', U], ['9h às 19h', U], ['de 9h a 19h', U], ['9h até às 19h', U],
      ['9.00-19.00', U], ['9 às 19 horas', U], ['9:00h-19:00h', U], ['09h00 - 19h00', U], ['9 h - 19 h', U], ['9-19', U],
      ['Das 9:00 às 13:00 / 14:30 às 19:00', '[["09:00","13:00"],["14:30","19:00"]]'], ['9h-12h30 e 14h-19h', '[["09:00","12:30"],["14:00","19:00"]]'],
      ['9h-13h, 14h-19h', '[["09:00","13:00"],["14:00","19:00"]]'], ['14h-19h e 9h-13h', '[["09:00","13:00"],["14:00","19:00"]]'],
      ['18h-24h', '[["18:00","23:59"]]'], ['24 horas', '[["00:00","23:59"]]'], ['Aberto 24h', '[["00:00","23:59"]]'],
      ['Fechado', '"fechado"'], ['Encerrado', '"fechado"'], ['FECHADO.', '"fechado"'],
      ['Por marcação', 'null'], ['até às 19h', 'null'], ['19h-9h', 'null'], ['9h-9h', 'null'], ['9h-13h e 12h-19h', 'null'], ['9h-25h', 'null'], ['9h60-10h', 'null'], ['24h-24h', 'null'],
      ['9h - 19h (almoço 13h-14h)', 'null'], ['9h-19h; sábado 9h-13h', 'null'], ['</script><script>alert(1)</script>', 'null'], ['', 'null'], ['x'.repeat(5000), 'null'],
    ];
    const falhasH = HORAS.filter(([t, e]) => H(t) !== e).map(([t, e]) => `«${t.slice(0, 30)}» deu ${H(t)}, esperava ${e}`);
    certo(falhasH.length === 0, `lerHorasDoHorario: ${HORAS.length} formas (traços, espaço inquebrável, «h», «:», «.», dois intervalos, meia-noite, fechado; e as que não se percebem)`, falhasH.join(' | '));
    const t0 = Date.now();
    for (const lixo of ['9h-'.repeat(4000), 'a '.repeat(5000), 'segunda a '.repeat(1000), '1'.repeat(10000), '9h e '.repeat(3000)]) { R.lerHorasDoHorario(lixo); R.lerDiasDoHorario(lixo); }
    certo(Date.now() - t0 < 500, `   e texto hostil comprido não o encrava (${Date.now() - t0} ms para cinco de 10 000 caracteres)`);
    /* Os dados de hoje dão EXACTAMENTE o JSON-LD que estava escrito à mão no gerador. */
    const aMao = [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '13:00' },
    ];
    const deHoje = R.lerHorario(HOJE.definicoes.horario);
    certo(JSON.stringify(deHoje.especificacao) === JSON.stringify(aMao) && deHoje.linhas.map((l) => l.estado).join() === 'aberto,aberto,fechado',
      'o horário de hoje dá, byte a byte, o JSON-LD que estava escrito à mão no gerador (e o domingo «Fechado» não vai)', JSON.stringify(deHoje));
    const contra = R.lerHorario([{ dias: 'Segunda a sábado', horas: '9h-19h' }, { dias: 'Sábado', horas: '9h-13h' }, { dias: 'Domingo', horas: 'Fechado' }, { dias: 'Domingo', horas: 'Encerrado' }]);
    certo(contra.especificacao.length === 0 && contra.linhas.map((l) => `${l.estado}:${l.motivo || ''}`).join() === 'nao-percebido:repetido,nao-percebido:repetido,fechado:,fechado:'
      && JSON.stringify(contra.linhas[0].repetidos) === '[5]', 'um dia em duas linhas: as duas saem (o sábado aberto em duas); dois «fechado» no mesmo dia não se contradizem', JSON.stringify(contra.linhas));
    const buracos = [{ dias: 'Sábado', horas: '9h-13h' }]; buracos[2] = { dias: 'Domingo', horas: '10h-12h' };
    const b = R.lerHorario(buracos);
    certo(b.linhas.map((l) => l.estado).join() === 'aberto,vazio,aberto' && b.especificacao.length === 2 && R.lerHorario(null).especificacao.length === 0 && R.lerHorario({ dias: 'Sábado' }).linhas.length === 0,
      'uma lista com buracos, uma linha null, um horário que não é lista: sem rebentar', JSON.stringify(b.linhas));
    const doisIntervalos = R.lerHorario([{ dias: 'Sábado e domingo', horas: '9h-13h / 14h30-19h' }]).especificacao;
    certo(JSON.stringify(doisIntervalos) === JSON.stringify([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '09:00', closes: '13:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '14:30', closes: '19:00' }]), 'dois intervalos na mesma linha: duas entradas com os mesmos dias', JSON.stringify(doisIntervalos));
  }
  {
    const rede = (n) => R.redeDoTelefone(n);
    const moveis = ['961053363', '916228513', '912345678', '921234567', '931234567'];
    const fixos = ['253123456', '211234567', '221234567', '291234567', '296123456'];
    const nenhum = ['203123456', '800123456', '707123456', '808123456', '308123456', '901234567', '96105336', '9610533630', '961 053 363', '+351961053363', '351961053363', ' 961053363', '', 961053363, null, undefined];
    certo(moveis.every((n) => rede(n) === 'movel') && fixos.every((n) => rede(n) === 'fixa') && nenhum.every((n) => rede(n) === null),
      `redeDoTelefone: ${moveis.length} telemóveis (91, 92, 93, 96), ${fixos.length} fixos (2…), e ${nenhum.length} que não são nenhum dos dois (20…, 800, 707, 808, 30…, 90…, curtos, compridos, com espaços, com o 351, números do JSON)`,
      [...moveis, ...fixos, ...nenhum].map((n) => `${n}:${rede(n)}`).join(' '));
    certo(R.notaDaChamada('961053363') === 'Chamada para a rede móvel nacional' && R.notaDaChamada('253123456') === 'Chamada para a rede fixa nacional' && R.notaDaChamada('800123456') === null,
      'notaDaChamada: «Chamada para a rede móvel nacional» / «Chamada para a rede fixa nacional», e null quando não há nota certa');
  }

  /* ================================================================== */
  secao('a guarda e o gerador verdadeiro contam as fotografias da mesma maneira');
  {
    const mini = mkdtempSync(join(TMP, 'gerador-'));
    const copiar = (rel) => { mkdirSync(dirname(join(mini, rel)), { recursive: true }); copyFileSync(join(RAIZ, rel), join(mini, rel)); };
    for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
      if (/^(assets\/(veiculos|fotos)|data\/viaturas|_fonte)\//.test(f)) continue;
      copiar(f);
    }
    const escrever = (rel, t = 'x') => { mkdirSync(dirname(join(mini, rel)), { recursive: true }); writeFileSync(join(mini, rel), t); };
    const B = 'assets/veiculos/fotos-teste';
    for (const f of ['existe.jpg', 'outra-extensao.jpeg', 'com-barra.jpg', 'so-o-nome.jpg', 'Cópia de Stock.jpeg']) escrever(`${B}/${f}`);
    mkdirSync(join(mini, B, 'e-uma-pasta'), { recursive: true });
    for (const w of [480, 960, 1600]) escrever(`assets/fotos/fotos-teste/antiga-${w}.webp`);
    escrever('assets/veiculos/solta-na-raiz.jpg');
    const viatura = (marca, fotos, extra = {}) => ({ marca, modelo: 'Teste', versao: '1.0', tipo: 'carro', preco: 1000, publicado: true, estado: 'disponivel', destaque: false, ordem: 1, fotos, ano: 2020, km: 1000, ...extra });
    const dados = {
      viaturas: {
        'fotos-teste': viatura('Ford', [`${B}/existe.jpg`, `${B}/outra-extensao.jpg`, `${B}/antiga-1600.webp`, `${B}/falta.jpg`, `/${B}/com-barra.jpg`, 'so-o-nome.jpg', 'assets/veiculos/solta-na-raiz.jpg',
          'assets/veiculos/outra-pasta/falta-tambem.jpg', `${B}/e-uma-pasta.jpg`, `${B}/Cópia de Stock.jpeg`, 'nao-existe.png']),
        'todas-em-falta': viatura('Opel', ['assets/veiculos/todas-em-falta/a.jpg', 'assets/veiculos/todas-em-falta/b.jpg']),
        rascunho: viatura('Fiat', ['assets/veiculos/rascunho/a.jpg'], { publicado: false }),
      },
      vendidas: { 'ja-vendida': viatura('Seat', ['assets/veiculos/ja-vendida/a.jpg', `${B}/existe.jpg`], { estado: 'vendido' }) },
    };
    for (const pasta of ['viaturas', 'vendidas']) for (const [nome, v] of Object.entries(dados[pasta])) escrever(R.ficheiroDaViatura(pasta, nome), R.serializar(v, ''));
    const env = envDoPasso('Gerar o site');
    const g = correr('node', ['scripts/gerar.mjs'], { cwd: mini, env });
    const doGerador = new Set([...g.err.matchAll(/!! (\S+): a foto (.+) está na lista mas não existe — ignorada/g)].map((m) => `${m[1]}|${m[2]}`));
    const lista = R.problemas({ ...dados, definicoes: HOJE.definicoes }, { listarPasta: G.listarPastaEm(mini) });
    const publicadas = new Set(['fotos-teste', 'todas-em-falta', 'ja-vendida']);
    const daGuarda = new Set(lista.filter((p) => /:foto-em-falta:/.test(p.chave) && publicadas.has(p.slug)).map((p) => `${p.slug}|${String(p.foto).replace(/^\/+/, '')}`));
    certo(g.status === 0 && doGerador.size === 6 && [...doGerador].every((x) => daGuarda.has(x)) && [...daGuarda].every((x) => doGerador.has(x)),
      `o gerador deita fora ${doGerador.size} fotografias (3 da viatura de ensaio, as 2 da que não tem nenhuma, e a da vendida), e são exactamente as que a guarda diz que faltam (o nome sem extensão, as geradas da forma antiga, a barra à frente, só o nome, a raiz, e até uma pasta com o nome da fotografia contam como o gerador conta)`,
      `${g.status} ${g.err.slice(-300)} | gerador: ${[...doGerador].join(', ')} | guarda: ${[...daGuarda].join(', ')}`);
    certo(lista.some((p) => p.slug === 'rascunho' && /:foto-em-falta:/.test(p.chave)), '   no rascunho também se diz (o gerador não a procura, mas o painel tem de a mostrar)');
    rmSync(mini, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('o publicar.yml: o que está onde');
  const construir = jobDoYaml('construir'); const publicar = jobDoYaml('publicar'); const avisar = jobDoYaml('avisar');
  const passos = passosDoConstruir();
  const pos = (n) => passos.indexOf(n);
  certo(pos('actions/setup-node@v4') >= 0 && pos('Conferir o conteúdo') === pos('actions/setup-node@v4') + 1 && pos('Conferir o conteúdo') < pos('Arrumar as viaturas vendidas'),
    'a guarda corre logo a seguir ao Node, antes de mexer em seja o que for', passos.join(' → '));
  certo(passoOuNada('Conferir o conteúdo').trim() === 'node .github/guardas.mjs --relatorio-em "$RUNNER_TEMP/relatorio.json"', '   e é a guarda verdadeira, com o relatório fora do repositório');
  const guardar = 'Guardar as mudanças de pasta e as fotografias preparadas';
  const copia = 'Preparar a cópia que o gerador lê';
  certo(pos(guardar) >= 0 && pos(copia) === pos(guardar) + 1 && pos('Gerar o site') === pos(copia) + 1, 'a cópia neutralizada prepara-se DEPOIS do commit de volta e logo antes de gerar', passos.join(' → '));
  certo(/git add -A data\/viaturas/.test(passoOuNada(guardar)) && /git commit/.test(passoOuNada(guardar)), '   (o «Guardar…» continua a fazer git add -A data/viaturas e commit — é disso que a cópia se defende)');
  certo(passoOuNada(copia).trim() === 'node .github/guardas.mjs --neutralizar . --relatorio-em "$RUNNER_TEMP/relatorio.json"', '   e é a guarda verdadeira, em modo --neutralizar');
  const depoisDaCopia = pos(copia) < 0 ? 'git commit (sem o passo da cópia)' : passos.slice(pos(copia) + 1).filter((n) => !/^actions\//.test(n)).map((n) => passoOuNada(n)).join('\n');
  certo(!/\bgit\s+(add|commit|push|stash)\b/.test(depoisDaCopia), 'nenhum passo depois da cópia grava no repositório');
  certo(/actions\/upload-artifact@v4\n\s+if: \$\{\{ !cancelled\(\) \}\}\n\s+with:\n\s+name: relatorio\n\s+path: \$\{\{ runner\.temp \}\}\/relatorio\.json/.test(construir), 'o relatório vai como artefacto, também quando a guarda parou');
  certo(!/secrets\./.test(construir) && !/secrets\./.test(avisar), 'construir e avisar: sem segredos');
  certo(/^\s+needs: \[construir, publicar\]\n\s+if: \$\{\{ !cancelled\(\) \}\}\n\s+runs-on: ubuntu-latest\n\s+permissions:\n\s+issues: write\n\s+steps:/m.test(avisar) && !/actions\/checkout/.test(avisar), 'avisar: depois dos outros dois, nunca numa corrida cancelada, sem checkout, só issues');
  certo(!passoDoYaml('Abrir, comentar ou fechar a issue «Publicação parada»').includes('${{'), 'nenhum ${{ }} dentro do run: do avisar (os valores entram por env:)');
  certo(/name: Abrir, comentar ou fechar a issue «Publicação parada»\n\s+continue-on-error: true/.test(YAML), 'o passo do gh tem continue-on-error (um aviso que não sai não é uma publicação falhada)');
  certo(/workflow_dispatch:\n\s+inputs:\n\s+payload:/.test(YAML) && /ensaiar_aviso:\n\s+description: .+\n\s+type: boolean\n\s+default: false/.test(YAML), 'o botão do Pages CMS (o input payload) continua, e há o ensaiar_aviso');
  certo(/concurrency:\n\s+group: pages\n\s+cancel-in-progress: true/.test(YAML) && /uses: actions\/deploy-pages@v4/.test(publicar) && /uses: actions\/upload-pages-artifact@v3/.test(construir), 'a publicação continua no GitHub Pages, uma de cada vez');
  certo(JSON.stringify(envDoPasso('Gerar o site')) === '{"BASE":"","SITE":"https://lrmotorsautomoveis.pt"}', 'o «Gerar o site» continua com BASE vazio e o domínio');

  /* ================================================================== */
  secao('o publicar.yml: o job «avisar», com um gh de faz-de-conta');
  const avisarEm = ({ construir: c = 'success', publicar: p = 'success', ensaio = '', abertas = [], relatorio = null, falha = '' }) => {
    const d = mkdtempSync(join(TMP, 'avisar-'));
    mkdirSync(join(d, 'bin'));
    writeFileSync(join(d, 'bin', 'gh'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${d}/gh.log"
if [ -n "$FALSO_FALHA" ] && [ "$1 $2" = "$FALSO_FALHA" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
case "$1 $2" in
  "issue list") printf '%s' "$FALSO_ABERTAS" ;;
  "issue create") echo "https://github.com/renatovalente5/LR_Motors/issues/42" ;;
esac
`, { mode: 0o755 });
    if (relatorio) { mkdirSync(join(d, 'relatorio')); writeFileSync(join(d, 'relatorio', 'relatorio.json'), JSON.stringify(relatorio)); }
    const r = correrPasso('Abrir, comentar ou fechar a issue «Publicação parada»', d, {
      PATH: `${join(d, 'bin')}:${process.env.PATH}`, GH_TOKEN: 'x', GH_REPO: 'renatovalente5/LR_Motors',
      CONSTRUIR: c, PUBLICAR: p, ENSAIO: ensaio, CORRIDA: 'https://github.com/renatovalente5/LR_Motors/actions/runs/1',
      COMMIT: 'abc123', QUEM: 'pages-cms[bot]', FALSO_ABERTAS: JSON.stringify(abertas), FALSO_FALHA: falha,
    });
    const log = existsSync(join(d, 'gh.log')) ? readFileSync(join(d, 'gh.log'), 'utf8').trim().split('\n').filter(Boolean) : [];
    const aviso = existsSync(join(d, 'aviso.md')) ? readFileSync(join(d, 'aviso.md'), 'utf8') : '';
    rmSync(d, { recursive: true, force: true });
    return { ...r, log, aviso, accoes: log.filter((l) => !l.startsWith('issue list')) };
  };
  const BOT = { login: 'app/github-actions', is_bot: true };
  {
    const a = avisarEm({});
    certo(a.status === 0 && a.accoes.length === 0, 'tudo verde e nenhuma issue aberta: não faz nada', a.err + a.log.join('|'));
    const b = avisarEm({ construir: 'failure', publicar: 'skipped' });
    certo(b.status === 0 && b.accoes.length === 2 && /^issue create --title Publicação parada --body-file aviso\.md$/.test(b.accoes[0]) && /parou/.test(b.aviso) && /actions\/runs\/1/.test(b.aviso), 'a construção falhou: abre a issue, com a ligação para a corrida', b.err + b.accoes.join('|'));
    certo(b.accoes[1] === 'issue lock 42', '   e tranca-a: só quem tem acesso ao repositório comenta', b.accoes.join('|'));
    const c = avisarEm({ publicar: 'failure', abertas: [{ number: 3, title: 'Publicação parada — ensaio do aviso', author: BOT }, { number: 7, title: 'Publicação parada', author: BOT }] });
    certo(c.accoes.length === 1 && c.accoes[0] === 'issue comment 7 --body-file aviso.md', 'já há uma aberta (com o título exacto): comenta-a, e não confunde com a do ensaio', c.accoes.join('|'));
    const e = avisarEm({ abertas: [{ number: 7, title: 'Publicação parada', author: BOT }] });
    certo(e.accoes.length === 1 && /^issue close 7 --comment Voltou a publicar sem problemas \(commit abc123\)/.test(e.accoes[0]), 'voltou a publicar limpo: fecha-a', e.accoes.join('|'));
    const hostil = { versao: 1, problemas: [], neutralizados: [{ slug: 'x', nome: 'Jaguar ~~~~\n@renatovalente5 [clique](https://mal.example)', descricao: 'escondida do site', efeitos: ['esconder'], motivos: ['Falta o modelo.'], fotos: [] }] };
    const f = avisarEm({ relatorio: hostil });
    const linhas = f.aviso.split('\n');
    const dentro = linhas.slice(linhas.indexOf('~~~~') + 1, linhas.lastIndexOf('~~~~'));
    certo(f.accoes.length === 2 && /^issue create/.test(f.accoes[0]) && /1 viatura\(s\) mudaram no site/.test(f.aviso), 'publicou mas escondeu uma viatura: abre a issue', f.accoes.join('|'));
    certo(linhas.filter((l) => l.startsWith('~~~')).length === 2 && dentro.length === 1 && dentro[0].startsWith('- NO SITE · Jaguar ~~~~ @renatovalente5'), 'um nome hostil fica dentro do bloco ~~~~, numa linha só (não fecha o bloco nem vira menção)', JSON.stringify(dentro));
    const g = avisarEm({ construir: 'failure', publicar: 'skipped', relatorio: { problemas: [{ classe: 'bloqueia', ecra: 'Dados do stand › Dados legais da empresa', mensagem: 'O NIF não é válido.' }, { classe: 'avisa', lembrete: true, ecra: 'X', mensagem: 'só lembrete' }], neutralizados: [] } });
    certo(/- PÁRA · Dados do stand › Dados legais da empresa — O NIF não é válido\./.test(g.aviso) && !/só lembrete/.test(g.aviso), 'a guarda parou: a issue diz o quê e onde se corrige (e não os lembretes)');
    const so = { versao: 1, bloqueia: 0, neutraliza: 0, avisa: 0, lembretes: 1, problemas: [{ classe: 'avisa', lembrete: true, ecra: 'Viaturas › X', mensagem: 'Falta a matrícula.' }], neutralizados: [] };
    const i = avisarEm({ relatorio: so });
    certo(i.accoes.length === 0, 'só lembretes, numa corrida verde: não abre issue nenhuma', i.accoes.join('|'));
    const j = avisarEm({ construir: 'failure', publicar: 'skipped', relatorio: so });
    certo(j.accoes.length === 2 && !/O que a guarda encontrou/.test(j.aviso) && !j.aviso.includes('~~~~'), 'parou depois da guarda (o gerador, as fotografias): a issue não traz um bloco vazio da guarda', j.aviso);
    const estranho = { number: 9, title: 'Publicação parada', author: { login: 'alguem-de-fora', is_bot: false } };
    const k = avisarEm({ abertas: [estranho] });
    certo(k.accoes.length === 0, 'uma issue «Publicação parada» aberta por outra pessoa: numa corrida verde, não a fecha', k.accoes.join('|'));
    const l = avisarEm({ construir: 'failure', publicar: 'skipped', abertas: [estranho] });
    certo(l.accoes.length === 2 && /^issue create/.test(l.accoes[0]) && !l.accoes.some((x) => /^issue comment 9/.test(x)), '   e numa falhada não a comenta: abre a do bot', l.accoes.join('|'));
    const m = avisarEm({ abertas: [{ number: 7, title: 'Publicação parada', author: BOT }], falha: 'issue close' });
    certo(m.status === 0 && /^::warning title=Aviso da publicação::Não consegui fechar a issue/m.test(m.out), 'o gh falha ao fechar a issue (502): o passo sai com 0 e deixa um aviso na corrida', `${m.status} ${m.out.slice(-200)}`);
    const n2 = avisarEm({ construir: 'failure', publicar: 'skipped', falha: 'issue create' });
    certo(n2.status === 0 && /Não consegui abrir a issue/.test(n2.out), '   e ao abrir: idem', `${n2.status} ${n2.out.slice(-200)}`);
    const o = avisarEm({ construir: 'cancelled', publicar: 'skipped', abertas: [{ number: 7, title: 'Publicação parada', author: BOT }] });
    const o2 = avisarEm({ construir: 'success', publicar: 'cancelled' });
    certo(o.status === 0 && o.log.length === 0 && o2.log.length === 0 && /cancelada/.test(o.out), 'uma corrida cancelada (o dono gravou outra vez): não abre, não comenta nem fecha — nem pergunta', o.log.join('|') + o2.log.join('|'));
    const h = avisarEm({ ensaio: 'true' });
    certo(h.accoes.length === 2 && /^issue create --title Publicação parada — ensaio do aviso --body-file ensaio\.md$/.test(h.accoes[0]) && /^issue close 42 --comment Ensaio terminado/.test(h.accoes[1]), 'ensaiar_aviso: abre e fecha uma issue de ensaio, à parte', h.accoes.join('|'));
  }

  /* ================================================================== */
  secao('de ponta a ponta: o job «construir», passo a passo, num repositório de ensaio com uma origem');
  {
    const temPillow = spawnSync(PY, ['-c', 'import PIL'], { encoding: 'utf8' }).status === 0;
    certo(temPillow, `há um python com Pillow (${PY}) — no Mac: PYTHON=<venv com Pillow> node .github/test-guardas.mjs`);
    if (temPillow) {
      const base = mkdtempSync(join(TMP, 'ponta-'));
      const semente = join(base, 'semente');
      const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      // 1. Um repositório como o verdadeiro, sem as fotografias (que são 700 MB) e com viaturas de ensaio.
      for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
        if (/^(assets\/(veiculos|fotos)|data\/viaturas|_fonte)\//.test(f)) continue;
        mkdirSync(dirname(join(semente, f)), { recursive: true }); copyFileSync(join(RAIZ, f), join(semente, f));
      }
      const fotografias = (pares) => execFileSync(PY, ['-c', `
import sys
from PIL import Image
for i in range(1, len(sys.argv), 2):
    Image.new('RGB', (640, 480), sys.argv[i + 1]).save(sys.argv[i], 'JPEG', quality=80)`, ...pares]);
      const viatura = (marca, slug, fotos, extra = {}) => ({ marca, modelo: 'Teste', versao: '1.0', tipo: 'carro', preco: 9990, publicado: true, estado: 'disponivel', destaque: false, ordem: 1, fotos: fotos.map((f) => (f.includes('/') ? f : `assets/veiculos/${slug}/${f}`)), ano: 2020, km: 1000, garantia: '18 meses', ...extra });
      mkdirSync(join(semente, 'data', 'viaturas', 'vendidas'), { recursive: true });
      for (const s of ['carro-bom', 'foto-de-fora', 'sem-marca', 'vendida-sem-marca']) mkdirSync(join(semente, 'assets', 'veiculos', s), { recursive: true });
      fotografias([join(semente, 'assets/veiculos/carro-bom/01.jpg'), 'red', join(semente, 'assets/veiculos/foto-de-fora/01.jpg'), 'blue',
        join(semente, 'assets/veiculos/sem-marca/01.jpg'), 'green', join(semente, 'assets/veiculos/vendida-sem-marca/01.jpg'), 'yellow']);
      const escreverV = (dir, pasta, slug, v) => writeFileSync(join(dir, R.ficheiroDaViatura(pasta, slug)), R.serializar(v, ''));
      escreverV(semente, 'viaturas', 'carro-bom', viatura('Audi', 'carro-bom', ['01.jpg']));
      escreverV(semente, 'viaturas', 'foto-de-fora', viatura('BMW', 'foto-de-fora', ['01.jpg']));
      escreverV(semente, 'viaturas', 'sem-marca', viatura('Citroën', 'sem-marca', ['01.jpg']));
      escreverV(semente, 'viaturas', 'vendida-sem-marca', viatura('Dacia', 'vendida-sem-marca', ['01.jpg']));
      // A publicação anterior: as variantes e os cartões já preparados.
      const prep = correr(PY, ['scripts/otimizar-imagens.py', '--varrer'], { cwd: semente });
      certo(prep.status === 0, '   (a semente: fotografias preparadas como numa publicação anterior)', prep.err.slice(-300));
      sh(semente, 'init', '-q', '-b', 'main');
      sh(semente, 'add', '-A');
      sh(semente, '-c', 'user.name=Renato', '-c', 'user.email=renato@exemplo.pt', 'commit', '-q', '-m', 'semente');
      const origem = join(base, 'origem.git');
      execFileSync('git', ['clone', '-q', '--bare', semente, origem]);
      const ws = join(base, 'trabalho');
      execFileSync('git', ['clone', '-q', origem, ws]);
      // 2. O que o dono grava (um commit no main, como o Pages CMS ou o painel):
      const vendidaSemMarca = viatura('Dacia', 'vendida-sem-marca', ['01.jpg'], { estado: 'vendido' }); delete vendidaSemMarca.marca;
      const semMarca = viatura('Citroën', 'sem-marca', ['01.jpg']); delete semMarca.marca;   // sem a chave: o gerador escrevia «undefined» na faixa das marcas
      const fotoDeFora = viatura('BMW', 'foto-de-fora', ['01.jpg', 'assets/img/og.jpg']);
      const carroBom = viatura('Audi', 'carro-bom', ['01.jpg', '02.jpg']);
      fotografias([join(ws, 'assets/veiculos/carro-bom/02.jpg'), 'purple']);
      escreverV(ws, 'viaturas', 'vendida-sem-marca', vendidaSemMarca);   // vendida e sem marca: muda de pasta e fica escondida
      escreverV(ws, 'viaturas', 'sem-marca', semMarca);                   // à venda e sem marca: escondida
      escreverV(ws, 'viaturas', 'foto-de-fora', fotoDeFora);              // uma fotografia fora da biblioteca
      escreverV(ws, 'viaturas', 'carro-bom', carroBom);                   // uma fotografia nova, ainda sem variantes
      sh(ws, 'add', '-A');
      sh(ws, '-c', 'user.name=Dono', '-c', 'user.email=dono@exemplo.pt', 'commit', '-q', '-m', 'Gravações do dono');
      sh(ws, 'push', '-q', 'origin', 'HEAD:main');
      const doDono = sh(ws, 'rev-parse', 'HEAD').trim();
      const textoDoDono = (rel) => sh(ws, 'show', `${doDono}:${rel}`);
      // 3. O job «construir», passo a passo, tal como está no YAML.
      const rt = join(base, 'runner-temp'); mkdirSync(rt);
      const bin = join(base, 'bin'); mkdirSync(bin);
      writeFileSync(join(bin, 'python3'), `#!/bin/sh\nexec "${PY}" "$@"\n`, { mode: 0o755 });
      const resumoF = join(rt, 'resumo.md'); writeFileSync(resumoF, '');
      const envCI = { RUNNER_TEMP: rt, PATH: `${bin}:${process.env.PATH}`, GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: resumoF };
      const correrNoCI = passos.filter((n) => !/^actions\/|^Instalar o Pillow$/.test(n));
      const saidas = [];
      for (const nome of correrNoCI) {
        const r = correrPasso(nome, ws, { ...envCI, ...envDoPasso(nome) });
        saidas.push([nome, r]);
        if (r.status !== 0) break;
      }
      const falhados = saidas.filter(([, r]) => r.status !== 0);
      certo(falhados.length === 0 && saidas.length === correrNoCI.length, `os ${correrNoCI.length} passos do construir correm e passam (${correrNoCI.join(' → ')}), com três viaturas partidas`, falhados.map(([n, r]) => `${n}: ${(r.out + r.err).slice(-600)}`).join(' | '));
      // 4. O que foi para o repositório: o commit de volta, na origem.
      const naOrigem = (rel) => { try { return execFileSync('git', ['-C', origem, 'show', `main:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
      const ultimo = execFileSync('git', ['-C', origem, 'log', '-1', '--format=%an|%s', 'main'], { encoding: 'utf8' }).trim();
      const mudados = execFileSync('git', ['-C', origem, 'show', '--name-status', '--format=', 'main'], { encoding: 'utf8' }).trim().split('\n');
      certo(/^github-actions\[bot\]\|Arrumar vendidas e guardar fotografias preparadas \(\d+ ficheiros\) \[skip ci\]$/.test(ultimo), 'o «Guardar…» fez o commit de volta para a origem', ultimo);
      certo(naOrigem('data/viaturas/vendidas/vendida-sem-marca.json') === textoDoDono('data/viaturas/vendida-sem-marca.json') && naOrigem('data/viaturas/vendida-sem-marca.json') === null,
        'a vendida mudou de pasta no commit, TAL COMO O DONO A ESCREVEU (sem a cópia neutralizada: continua sem «Publicado: não»)');
      certo([480, 960, 1600].every((w) => mudados.includes(`A\tassets/fotos/carro-bom/02-${w}.webp`)), 'e levou as variantes da fotografia nova', mudados.join(' '));
      certo(!mudados.some((l) => /data\/viaturas\/(sem-marca|foto-de-fora|carro-bom)\.json$/.test(l)) && ['sem-marca', 'foto-de-fora', 'carro-bom'].every((s) => naOrigem(`data/viaturas/${s}.json`) === textoDoDono(`data/viaturas/${s}.json`)),
        'as viaturas neutralizadas ficaram na origem como o dono as gravou (a cópia nunca entrou no commit)', mudados.join(' '));
      // 5. O que o gerador leu, e o que publicou.
      const local = (rel) => readFileSync(join(ws, rel), 'utf8');
      certo(JSON.parse(local('data/viaturas/sem-marca.json')).publicado === false && JSON.parse(local('data/viaturas/vendidas/vendida-sem-marca.json')).publicado === false && !JSON.parse(local('data/viaturas/foto-de-fora.json')).fotos.includes('assets/img/og.jpg'),
        'na máquina do CI, a cópia que o gerador leu estava neutralizada');
      const estado = sh(ws, 'status', '--porcelain', 'data/').trim().split('\n').map((l) => l.trim()).sort();
      certo(JSON.stringify(estado) === JSON.stringify(['M data/viaturas/foto-de-fora.json', 'M data/viaturas/sem-marca.json', 'M data/viaturas/vendidas/vendida-sem-marca.json']), '   e só lá: são alterações por gravar, que ficam na máquina', estado.join(' | '));
      const site = (rel) => (existsSync(join(ws, '_site', rel)) ? readFileSync(join(ws, '_site', rel), 'utf8') : null);
      certo(site('viaturas/carro-bom/index.html') !== null && site('viaturas/foto-de-fora/index.html') !== null && site('viaturas/sem-marca/index.html') === null && site('viaturas/vendida-sem-marca/index.html') === null,
        'no _site: as duas viaturas sem marca não aparecem (nem a página, nem o reencaminhamento da vendida); as outras sim');
      certo(!/assets\/img\/og\.jpg/.test(site('viaturas/foto-de-fora/index.html').match(/id="fotos-json">([^<]*)</)[1]) && /foto-de-fora\/01-1600\.webp/.test(site('viaturas/foto-de-fora/index.html')), '   e a galeria da «foto-de-fora» só tem a fotografia da biblioteca');
      certo(!/undefined/.test(site('index.html')) && !/undefined/.test(site('viaturas/index.html')), '   e nenhuma página diz «undefined» (o que a falta da marca fazia na faixa das marcas)');
      const rel = JSON.parse(readFileSync(join(rt, 'relatorio.json'), 'utf8'));
      certo(rel.bloqueia === 0 && rel.neutralizados.map((e) => `${e.slug}:${e.efeitos.join('+')}`).sort().join(' ') === 'foto-de-fora:sem_fotografia sem-marca:esconder vendida-sem-marca:esconder',
        'o relatório (que vai para a issue) diz quais e como', JSON.stringify(rel.neutralizados.map((e) => [e.slug, e.efeitos])));
      const resumo = readFileSync(resumoF, 'utf8');
      certo(/## Guarda do conteúdo/.test(resumo) && /### A cópia que o gerador lê/.test(resumo) && /3 ficheiro\(s\) de viaturas mudados SÓ nesta cópia/.test(resumo), 'o resumo da corrida tem a guarda e a cópia');
      certo(!existsSync(join(ws, '_site', 'relatorio.json')) && !existsSync(join(ws, '_site', '.github')) && !existsSync(join(ws, '_site', 'data')), 'nem o relatório nem os dados foram publicados');
      rmSync(base, { recursive: true, force: true });
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
