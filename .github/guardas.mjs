#!/usr/bin/env node
/* A GUARDA DO CONTEÚDO, NO CI (job «construir»; não precisa de segredos).
 *
 * Lê os JSON de data/ e corre as regras de .github/regras.mjs — as MESMAS que o
 * painel mostra por baixo dos campos e que o Worker do painel confere ao gravar.
 *
 * O PRINCÍPIO: um problema de UMA viatura nunca pára a publicação das outras.
 * Só pára o que não se pode publicar sem inventar um valor ou partir o site
 * inteiro (classe «bloqueia»: a estrutura e os dados legais). O resto vai para o
 * resumo da corrida e, quando muda alguma coisa no site, para a issue
 * «Publicação parada» (job «avisar» do publicar.yml).
 *
 *   node .github/guardas.mjs [--raiz <pasta>] [--relatorio-em <ficheiro>]
 *       Confere. Sai com 1 só se houver um «bloqueia». No máximo 9 ::error, 9
 *       ::warning e 9 ::notice (os lembretes), cada um com «e mais N» — o GitHub
 *       guarda 10 de cada por passo, e uma lista cortada não pode passar por
 *       completa. A lista INTEIRA vai para o resumo da corrida
 *       ($GITHUB_STEP_SUMMARY) e para o relatório (que o job «avisar» põe na
 *       issue).
 *
 *   node .github/guardas.mjs --neutralizar <pasta> [--relatorio-em <ficheiro>]
 *       Confere outra vez e escreve, em <pasta>/data/, a CÓPIA QUE O GERADOR LÊ:
 *       as viaturas sem marca ou sem modelo escondidas, as fotografias que não
 *       são da biblioteca fora da lista. SÓ os ficheiros que mudam, e só quando
 *       há alguma coisa a neutralizar: sem nada, os ficheiros nem se tocam.
 *       ESCREVE NOS FICHEIROS DE DADOS, e por isso:
 *         · no publicar.yml corre DEPOIS do passo «Guardar as mudanças de pasta
 *           e as fotografias preparadas», que faz commit de data/viaturas de
 *           volta para o repositório — a cópia neutralizada nunca entra num
 *           commit (o .github/test-guardas.mjs prova-o de ponta a ponta, com um
 *           repositório de origem de ensaio);
 *         · fora do CI (sem GITHUB_ACTIONS=true) recusa-se a escrever no próprio
 *           repositório: só numa cópia.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FICHEIROS, PASTAS, problemas, neutralizar, descreverEfeitos } from './regras.mjs';
import { umaLinha } from './consola.mjs';

const RAIZ_DO_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_ANOTACOES = 9;

/* ------------------------------------------------------------------ */
/* Ler o repositório                                                    */
/* ------------------------------------------------------------------ */

/* Os dados como o gerador os lê: o definicoes.json e cada *.json do primeiro
   nível das duas pastas. Um «.json» que não é um ficheiro normal (uma pasta, uma
   ligação simbólica) partia o gerador ou fazia-o ler outra coisa: pára aqui,
   com o nome dele. Os mapas são sem protótipo: um ficheiro chamado
   «__proto__.json» é só um nome. */
export function lerDados(raiz) {
  const estrutura = [];
  const pararNoFicheiro = (rel, ecra) => estrutura.push({
    classe: 'bloqueia', chave: `estrutura:${rel}`, ficheiro: rel, ecra,
    mensagem: `${rel} não é um ficheiro normal (é uma pasta ou uma ligação): o site não se consegue gerar assim. Só o Renato o pode corrigir.`,
  });
  const dados = { viaturas: Object.create(null), vendidas: Object.create(null), definicoes: null };
  const pDef = join(raiz, FICHEIROS.definicoes);
  let def = null;
  try { def = lstatSync(pDef); } catch { def = null; }
  if (def && !def.isFile()) pararNoFicheiro(FICHEIROS.definicoes, 'Dados do stand');
  else if (def) dados.definicoes = readFileSync(pDef, 'utf8');
  for (const [pasta, rel] of Object.entries(PASTAS)) {
    let entradas = [];
    try { entradas = readdirSync(join(raiz, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      if (!e.name.endsWith('.json')) continue;
      if (!e.isFile()) { pararNoFicheiro(`${rel}/${e.name}`, pasta === 'vendidas' ? 'Vendidas' : 'Viaturas'); continue; }
      dados[pasta][e.name.slice(0, -'.json'.length)] = readFileSync(join(raiz, rel, e.name), 'utf8');
    }
  }
  return { dados, estrutura };
}

/* O que está numa pasta, como o gerador o vê (ficheirosDe: existsSync +
   readdirSync, ficheiros e pastas). É com isto que regras.fotografiaExiste()
   faz a MESMA conta do gerador. */
export function listarPastaEm(raiz) {
  /* Cada pasta lê-se uma vez por corrida: há viaturas com 30 fotografias na
     mesma pasta. */
  const lidas = new Map();
  return (pasta) => {
    if (!lidas.has(pasta)) {
      let nomes = [];
      try { nomes = readdirSync(join(raiz, pasta)); } catch { nomes = []; }
      lidas.set(pasta, nomes);
    }
    return lidas.get(pasta);
  };
}

const ORDEM = { bloqueia: 0, neutraliza: 1, avisa: 2 };
/* Os lembretes vão para o fim: não podem tapar, nas 9 anotações, um aviso que
   pede alguma coisa. */
export const ordenar = (lista) => lista.sort((a, b) => ORDEM[a.classe] - ORDEM[b.classe] || (a.lembrete ? 1 : 0) - (b.lembrete ? 1 : 0));

export function conferir(raiz, { hoje } = {}) {
  const { dados, estrutura } = lerDados(raiz);
  const lista = ordenar([...estrutura, ...problemas(dados, { listarPasta: listarPastaEm(raiz), hoje })]);
  const n = neutralizar(dados, lista);
  const efeitos = n.efeitos.map((e) => ({ ...e, descricao: descreverEfeitos(e) }));
  return { dados, lista, efeitos, ficheiros: n.ficheiros, mudou: n.mudou };
}

/* ------------------------------------------------------------------ */
/* As saídas                                                            */
/* ------------------------------------------------------------------ */

/* Os comandos do GitHub: %, \r e \n escapam-se na mensagem; nas
   propriedades, também : e , */
const escMsg = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escMsg(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function anotacoes(lista) {
  const linhas = [];
  const grupos = [
    ['error', lista.filter((p) => p.classe === 'bloqueia')],
    ['warning', lista.filter((p) => p.classe !== 'bloqueia' && !p.lembrete)],
    ['notice', lista.filter((p) => p.lembrete)],
  ];
  for (const [tipo, grupo] of grupos) {
    for (const p of grupo.slice(0, MAX_ANOTACOES)) {
      const prefixo = p.classe === 'neutraliza' ? 'Muda no site: ' : p.lembrete ? 'Lembrete: ' : '';
      linhas.push(`::${tipo} file=${escProp(p.ficheiro || '')},title=${escProp(p.ecra || 'Guarda do conteúdo')}::${escMsg(prefixo + p.mensagem)}`);
    }
    if (grupo.length > MAX_ANOTACOES) {
      linhas.push(`::${tipo} title=Guarda do conteúdo::${escMsg(`e mais ${grupo.length - MAX_ANOTACOES} — veja o resumo desta corrida`)}`);
    }
  }
  return linhas;
}

/* UM VALOR DOS DADOS NO RESUMO DA CORRIDA, que é público e que o GitHub lê em
   Markdown. Vai entre crases, e dentro de um código o GitHub não interpreta
   nada: nem uma ligação («[Ver os detalhes](https://…)», que passava nas regras
   e saía clicável), nem uma imagem, nem HTML, nem ênfase, nem os endereços
   soltos que ele transforma sozinho em ligação — este último caso não se
   resolvia a escapar a pontuação um a um.
   · a cerca é mais comprida do que a maior fila de crases do texto (assim o
     texto não a fecha) e leva um espaço de cada lado, que o Markdown tira;
   · numa tabela, a barra vai como «\|»: o GitHub parte a linha nas barras
     antes de ler as crases, e mostra «|» dentro do código;
   · o controlo e as mudanças de linha passam a espaço (uma mudança de linha
     acabava a linha da tabela a meio). */
const emCodigo = (s, { tabela = false } = {}) => {
  let t = String(s ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ');
  if (tabela) t = t.replace(/\|/g, '\\|');
  const cerca = '`'.repeat((t.match(/`+/g) || []).reduce((m, x) => Math.max(m, x.length), 0) + 1);
  return `${cerca} ${t} ${cerca}`;
};
const MAX_RESUMO = 900 * 1024;   // o GitHub aceita até 1 MiB por passo
const contas = (lista) => ({
  bloqueia: lista.filter((p) => p.classe === 'bloqueia').length,
  neutraliza: lista.filter((p) => p.classe === 'neutraliza').length,
  avisa: lista.filter((p) => p.classe === 'avisa' && !p.lembrete).length,
  lembretes: lista.filter((p) => p.lembrete).length,
});

export function resumo(lista, efeitos) {
  const n = contas(lista);
  const l = ['## Guarda do conteúdo', ''];
  if (n.bloqueia) l.push(`**A publicação parou**: ${n.bloqueia} problema(s) que não se podem contornar. O site continua como estava.`);
  else l.push('A publicação segue.');
  if (efeitos.length) {
    l.push('', `**${efeitos.length} viatura(s) mudam no site** por terem dados com problemas (o ficheiro do repositório não muda; corrige-se no backoffice):`, '',
      ...efeitos.map((e) => `- ${emCodigo(e.nome)}: **${emCodigo(e.descricao)}** — ${emCodigo(e.motivos.join(' '))}`));
  }
  l.push('', `Problemas: ${n.bloqueia} que param · ${n.neutraliza} que mudam o site · ${n.avisa} avisos · ${n.lembretes} lembretes.`);
  if (lista.length) {
    l.push('', '| | Onde se corrige | O quê |', '|---|---|---|');
    const nome = (p) => (p.classe === 'bloqueia' ? 'PÁRA' : p.classe === 'neutraliza' ? 'no site' : p.lembrete ? 'lembrete' : 'aviso');
    for (const p of lista) l.push(`| ${nome(p)} | ${emCodigo(p.ecra, { tabela: true })} | ${emCodigo(p.mensagem, { tabela: true })} |`);
  }
  const bytes = (s) => new TextEncoder().encode(s).length;
  if (bytes(`${l.join('\n')}\n`) <= MAX_RESUMO) return `${l.join('\n')}\n`;
  /* Grande de mais: corta-se em LINHAS INTEIRAS. Cada valor dos dados abre e
     fecha o seu código na mesma linha, e um corte a meio de uma linha deixava
     a cerca aberta — o resto do valor voltava a ler-se como Markdown. */
  const cabem = []; let n2 = 0;
  for (const linha of l) { n2 += bytes(`${linha}\n`); if (n2 > MAX_RESUMO / 2) break; cabem.push(linha); }
  return `${cabem.join('\n')}\n\n… (o resto está no relatório desta corrida)\n`;
}

export function relatorio(lista, efeitos) {
  return { versao: 1, ...contas(lista), problemas: lista, neutralizados: efeitos };
}

const NOME_NA_CONSOLA = (p) => (p.classe === 'bloqueia' ? 'PÁRA    ' : p.classe === 'neutraliza' ? 'NO SITE ' : p.lembrete ? 'LEMBRETE' : 'AVISO   ');

/* A listagem para quem lê a corrida. Leva os dados tal e qual (o ecrã tem o
   nome da viatura; a mensagem, o caminho de uma fotografia ou o texto da
   garantia), por isso cada linha passa pelo umaLinha(): o runner lê comandos no
   que aqui se escreve — ver .github/consola.mjs. As anotações, logo acima, já
   vão escapadas (escMsg/escProp). */
const listar = (texto) => console.log(umaLinha(texto));

function escreverSaidas(lista, efeitos, relatorioEm) {
  for (const linha of anotacoes(lista)) console.log(linha);
  console.log('');
  for (const p of lista) listar(`  ${NOME_NA_CONSOLA(p)} ${p.ecra} — ${p.mensagem}`);
  for (const e of efeitos) listar(`  MUDA NO SITE: ${e.nome} — ${e.descricao}`);
  const n = contas(lista);
  console.log(`\nGuarda do conteúdo: ${n.bloqueia} que param, ${n.neutraliza} que mudam o site (${efeitos.length} viatura(s)), ${n.avisa} avisos, ${n.lembretes} lembretes.`);
  if (relatorioEm) writeFileSync(relatorioEm, JSON.stringify(relatorio(lista, efeitos), null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo(lista, efeitos));
  return n.bloqueia;
}

/* ------------------------------------------------------------------ */
/* Os dois modos                                                       */
/* ------------------------------------------------------------------ */

function modoConferir(raiz, relatorioEm) {
  const { lista, efeitos } = conferir(raiz);
  return escreverSaidas(lista, efeitos, relatorioEm) ? 1 : 0;
}

function modoNeutralizar(raiz, relatorioEm) {
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  if (real(raiz) === real(RAIZ_DO_REPOSITORIO) && process.env.GITHUB_ACTIONS !== 'true') {
    console.error('--neutralizar escreve nos ficheiros de data/: fora do CI, só numa cópia do repositório (aqui mudava os dados de verdade).');
    return 2;
  }
  const { lista, efeitos, ficheiros, mudou } = conferir(raiz);
  /* Uma cópia com um «bloqueia» não se gera. Normalmente o passo «Conferir o
     conteúdo» já parou antes; aqui só chega se o «Guardar…» trouxe commits
     novos do main (git pull --rebase). */
  if (lista.some((p) => p.classe === 'bloqueia')) { escreverSaidas(lista, efeitos, relatorioEm); return 1; }
  if (mudou) {
    for (const [rel, texto] of Object.entries(ficheiros)) writeFileSync(join(raiz, rel), texto);
    for (const e of efeitos) listar(`    no site: ${e.nome} — ${e.descricao}`);
    // A prova: a cópia escrita já não tem nada a mudar.
    if (conferir(raiz).mudou) { console.error('ERRO: a cópia neutralizada ainda tem viaturas a neutralizar'); return 1; }
  } else {
    console.log('    nada a neutralizar: o gerador lê os ficheiros do repositório tal e qual');
    for (const e of efeitos) listar(`    no site: ${e.nome} — ${e.descricao}`);
  }
  if (relatorioEm) writeFileSync(relatorioEm, JSON.stringify(relatorio(lista, efeitos), null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### A cópia que o gerador lê\n\n${mudou
      ? `${Object.keys(ficheiros).length} ficheiro(s) de viaturas mudados SÓ nesta cópia (o repositório não muda): ${Object.keys(ficheiros).map((f) => emCodigo(f)).join(', ')}.`
      : 'Nada a neutralizar: o gerador lê os ficheiros do repositório tal e qual.'}\n`);
  }
  return 0;
}

export function principal(args) {
  const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
  for (const nome of ['--raiz', '--relatorio-em', '--neutralizar']) {
    if (args.includes(nome) && !opcao(nome)) { console.error(`${nome} precisa de um valor`); return 2; }
  }
  const relatorioEm = opcao('--relatorio-em');
  const copia = opcao('--neutralizar');
  if (copia) return modoNeutralizar(resolve(copia), relatorioEm);
  const raiz = resolve(opcao('--raiz') || RAIZ_DO_REPOSITORIO);
  if (!existsSync(raiz)) { console.error(`a pasta ${raiz} não existe`); return 2; }
  return modoConferir(raiz, relatorioEm);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
