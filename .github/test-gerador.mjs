#!/usr/bin/env node
/* A BATERIA DO GERADOR (scripts/gerar.mjs).
 *
 *     node .github/test-gerador.mjs
 *
 * Corre o gerador VERDADEIRO, com o env: do passo «Gerar o site» do
 * publicar.yml (o BASE e o SITE da produção), numa cópia leve do repositório —
 * tudo o que o git conhece menos as fotografias (centenas de MB) e os dados —
 * com os dados de cada caso, e lê o HTML que ele escreveu. Cada corrida leva
 * uma décima de segundo. Prova:
 *   · o horário do JSON-LD sai dos dados: hoje, o mesmo, byte a byte, que estava
 *     escrito à mão; mudá-lo muda o que o Google lê; uma linha que não se
 *     percebe fica de fora e as outras vão;
 *   · um fixo leva «rede fixa» e um telemóvel «rede móvel», em todo o lado onde
 *     há um número; sem o telefone 2, nenhuma linha nem ligação vazia;
 *   · nada do que vem dos dados sai do sítio onde é escrito (texto, atributo,
 *     endereço tel:/wa.me/mailto, JSON dentro de <script>), mesmo os valores que
 *     as regras recusam — o gerador defende-se sozinho de um commit à mão;
 *   · os dados que o gerador ignorava chegam ao site: o email, a sede social, a
 *     forma jurídica, o capital, o CAE, «Onde estamos», a localidade, o ano de
 *     construção;
 *   · os marcadores das páginas legais: um que não existe, ou um obrigatório
 *     vazio, param a construção sem tocar no _site; um opcional vazio tira a
 *     linha;
 *   · apagar cada chave do definicoes.json e de duas viaturas (é o que o
 *     backoffice faz a um campo que fica vazio): ou as regras param a
 *     publicação, ou o site sai sem «undefined», ligações vazias nem linhas em
 *     branco.
 *
 * A PROVA AO CONTRÁRIO: com --gerador-de <commit>, o gerador e os conteudo/*.md
 * vêm desse commit (o resto da cópia é o de agora). Contra o main, a bateria
 * tem de falhar nos defeitos que este ramo corrige — senão não prova nada. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import * as R from './regras.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'lr-gerador-'));
const YAML = readFileSync(join(RAIZ, '.github', 'workflows', 'publicar.yml'), 'utf8');

let passou = 0; let falhou = 0;
const certo = (c, d, extra = '') => {
  if (c) { passou++; console.log(`  ✓ ${d}`); } else { falhou++; console.log(`  ✗ ${d}${extra ? `  — ${String(extra).slice(0, 1500)}` : ''}`); }
};
const secao = (t) => console.log(`\n— ${t}`);
const clonar = (x) => JSON.parse(JSON.stringify(x));

/* O env: do passo «Gerar o site», tal como está escrito no publicar.yml. */
function envDoGerar() {
  const linhas = YAML.split('\n');
  const i0 = linhas.findIndex((l) => l.trim() === '- name: Gerar o site');
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
const ENV = envDoGerar();
const DE = process.argv.includes('--gerador-de') ? process.argv[process.argv.indexOf('--gerador-de') + 1] : null;
const SITE = ENV.SITE;

/* A cópia leve do repositório. */
const BASE_REPO = join(TMP, 'base');
for (const f of execFileSync('git', ['-C', RAIZ, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)) {
  if (/^(assets\/(veiculos|fotos)|_fonte|data)\//.test(f)) continue;
  mkdirSync(dirname(join(BASE_REPO, f)), { recursive: true });
  writeFileSync(join(BASE_REPO, f), readFileSync(join(RAIZ, f)));
}
if (DE) {
  for (const f of ['scripts/gerar.mjs', ...['privacidade', 'termos', 'garantia', 'resolucao-de-litigios'].map((n) => `conteudo/${n}.md`)]) {
    writeFileSync(join(BASE_REPO, f), execFileSync('git', ['-C', RAIZ, 'show', `${DE}:${f}`], { encoding: 'utf8' }));
  }
  console.log(`(o gerador e os conteudo/*.md de ${DE})`);
}
const lerJson = (rel) => JSON.parse(readFileSync(join(RAIZ, rel), 'utf8'));
const lerPasta = (rel) => Object.fromEntries(readdirSync(join(RAIZ, rel)).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), lerJson(`${rel}/${f}`)]));
const DEF = lerJson('data/definicoes.json');
const VIATURAS = lerPasta('data/viaturas');
const VENDIDAS = lerPasta('data/viaturas/vendidas');
const J = 'jaguar-xf-2-2-d-premium-luxury';   // à venda, com preço
const P = 'ford-puma-titanium';               // brevemente, sem preço

/* Gera o site de um caso: os dados (por omissão, os de hoje), mais ficheiros
   soltos (fotografias de ensaio, um conteúdo/ mudado). */
function gerar({ definicoes = DEF, viaturas = VIATURAS, vendidas = VENDIDAS, ficheiros = {} } = {}) {
  const dir = mkdtempSync(join(TMP, 'caso-'));
  cpSync(BASE_REPO, dir, { recursive: true });
  mkdirSync(join(dir, 'data', 'viaturas', 'vendidas'), { recursive: true });
  writeFileSync(join(dir, 'data', 'definicoes.json'), typeof definicoes === 'string' ? definicoes : `${JSON.stringify(definicoes, null, 2)}\n`);
  for (const [pasta, mapa] of [['viaturas', viaturas], ['vendidas', vendidas]]) {
    for (const [nome, v] of Object.entries(mapa)) writeFileSync(join(dir, R.ficheiroDaViatura(pasta, nome)), JSON.stringify(v, null, 2));
  }
  for (const [rel, t] of Object.entries(ficheiros)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), t); }
  const r = spawnSync('node', ['scripts/gerar.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ENV } });
  const ler = (rel) => (existsSync(join(dir, '_site', rel)) ? readFileSync(join(dir, '_site', rel), 'utf8') : null);
  const paginas = () => {
    const out = [];
    const andar = (rel) => {
      for (const e of readdirSync(join(dir, '_site', rel), { withFileTypes: true })) {
        const r2 = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (r2 !== 'assets' && r2 !== 'fotos') andar(r2); } else if (e.name.endsWith('.html')) out.push(r2);
      }
    };
    if (existsSync(join(dir, '_site'))) andar('');
    return out;
  };
  return { status: r.status, out: r.stdout, err: r.stderr, ler, paginas, dir, apagar: () => rmSync(dir, { recursive: true, force: true }) };
}

/* Os blocos JSON-LD de uma página: o texto cru e o objecto. */
/* Um bloco que não se lê (um «</script» que o fechou a meio) dá obj null. */
const lerOuNull = (t) => { try { return JSON.parse(t); } catch { return null; } };
const jsonLD = (html) => [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => ({ cru: m[1], obj: lerOuNull(m[1]) }));
const dealer = (html) => jsonLD(html).map((b) => b.obj).find((o) => o && o['@type'] === 'AutoDealer') || null;
/* Os valores de um atributo, já descodificados como o browser os lê. */
const desc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const atributos = (html, nome) => [...String(html).matchAll(new RegExp(`\\s${nome}="([^"]*)"`, 'g'))].map((m) => desc(m[1]));
const contar = (html, re) => (String(html).match(re) || []).length;
/* O que nunca pode aparecer num site gerado: um valor que não existia, uma
   ligação vazia, um separador ou uma vírgula soltos, uma linha do horário em
   branco. */
const LIXO = /undefined|\bNaN\b|\[object Object\]|>null<|href=""|href="tel:\+351"|href="mailto:"|wa\.me\/(?:"|\?)|<li><span><\/span><span><\/span><\/li>|<li data-dias=""><span><\/span><span><\/span><\/li>|, <\/|· <\/|> · |Stand em ,/;
const lixoEm = (g) => g.paginas().flatMap((p) => { const m = g.ler(p).match(LIXO); return m ? [`${p}: «${g.ler(p).slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, ' ')}»`] : []; });

try {
  /* ================================================================== */
  secao('os dados de hoje');
  const hoje = gerar();
  certo(hoje.status === 0, 'o gerador corre com os dados de hoje', hoje.err.slice(-500));
  const aMao = [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '19:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '13:00' },
  ];
  const paginasComDealer = hoje.paginas().filter((p) => dealer(hoje.ler(p)));
  certo(paginasComDealer.length >= 15 && paginasComDealer.every((p) => JSON.stringify(dealer(hoje.ler(p)).openingHoursSpecification) === JSON.stringify(aMao)),
    `o horário do JSON-LD sai dos dados e é, nas ${paginasComDealer.length} páginas com o stand, o que estava escrito à mão (segunda a sexta 9-19, sábado 9-13, o domingo fechado não vai)`);
  certo(lixoEm(hoje).length === 0, `nenhuma das ${hoje.paginas().length} páginas tem «undefined», ligações vazias, separadores soltos ou linhas em branco`, lixoEm(hoje).slice(0, 5).join(' | '));
  const inicio = hoje.ler('index.html');
  certo(contar(inicio, /\(Chamada para a rede móvel nacional\)/g) === 5 && contar(inicio, /rede fixa/g) === 0, 'a página inicial tem a nota «rede móvel» nos 5 sítios onde há número (cabeçalho, menu, rodapé ×2, «Venha ver ao vivo») e nenhuma «rede fixa»');
  hoje.apagar();

  /* ================================================================== */
  secao('o horário: o dono muda-o, e o Google também');
  {
    const d = clonar(DEF);
    d.horario = [
      { dias: 'Segunda a sexta', horas: '9h-12h30 e 14h-19h' },
      { dias: 'Sábado', horas: '9:00 - 13:00' },
      { dias: 'Feriados', horas: 'Por marcação' },
      { dias: 'Domingo', horas: '10h às 12h' },
      { dias: '', horas: '' },
    ];
    const g = gerar({ definicoes: d });
    const ld = (dealer(g.ler('index.html')) || {}).openingHoursSpecification;
    certo(g.status === 0 && JSON.stringify(ld) === JSON.stringify([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '12:30' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '14:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '13:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '10:00', closes: '12:00' },
    ]), 'o JSON-LD segue o horário novo: dois intervalos à semana, o sábado, o domingo; a linha «Feriados · Por marcação» fica de fora', JSON.stringify(ld));
    const lista = g.ler('contactos/index.html').match(/<ul class="horario horario--visita" id="horario-contactos">([\s\S]*?)<\/ul>/)[1];
    certo(contar(lista, /<li /g) === 4 && lista.includes('<span>Feriados</span><span>Por marcação</span>'), 'no site, a lista mostra as 4 linhas escritas — a que o Google não percebe também — e não a linha toda vazia');
    certo(R.problemas({ definicoes: d }).some((p) => p.chave === 'definicoes:horario.3:google' && p.lembrete) && R.problemas({ definicoes: d }).some((p) => p.chave === 'definicoes:horario.5:vazia'),
      '   e as regras lembram a linha que ficou de fora do Google, e avisam da linha vazia');
    g.apagar();
    const nada = clonar(DEF); nada.horario = [{ dias: 'Por marcação', horas: 'Ligue-nos' }];
    const g2 = gerar({ definicoes: nada });
    certo(g2.status === 0 && dealer(g2.ler('index.html')) && !('openingHoursSpecification' in dealer(g2.ler('index.html'))), 'nenhuma linha que se perceba: o JSON-LD não leva horário nenhum (melhor nada do que um errado)');
    g2.apagar();
  }

  /* ================================================================== */
  secao('telefones: um fixo diz «rede fixa», em todo o lado');
  {
    const d = clonar(DEF);
    d.contactos.telefone_1 = '253123456'; d.contactos.telefone_1_texto = '253 123 456';
    const g = gerar({ definicoes: d });
    certo(g.status === 0, 'um fixo no telefone 1 e um telemóvel no 2: o gerador corre', g.err.slice(-300));
    const FIXA = '(Chamada para a rede fixa nacional)'; const MOVEL = '(Chamada para a rede móvel nacional)';
    const pag = (p) => g.ler(p);
    const notasDe = (html) => [...html.matchAll(/253 123 456[\s\S]{0,260}?\(Chamada para a rede (fixa|móvel) nacional\)/g)].map((m) => m[1]);
    const inicio = pag('index.html');
    certo(contar(inicio, /\(Chamada para a rede fixa nacional\)/g) === 4 && contar(inicio, /\(Chamada para a rede móvel nacional\)/g) === 1,
      'página inicial: 4 notas «rede fixa» (cabeçalho, menu, rodapé, «Venha ver ao vivo») e 1 «rede móvel» (o telemóvel do rodapé)');
    const topo = inicio.match(/<span class="topo__tel">[\s\S]*?<\/span><\/span>/)[0];
    const menu = inicio.match(/<p class="nota-chamada">[^<]*<\/p>/)[0];
    const rodape = inicio.match(/<h3>Contactos<\/h3>[\s\S]*?<\/ul>/)[0];
    certo(topo.includes('href="tel:+351253123456">253 123 456</a>') && topo.includes(FIXA) && menu === `<p class="nota-chamada">253 123 456 · ${FIXA}</p>`,
      '   o cabeçalho e o menu: o número fixo, a ligar para ele, com a nota dele', topo + menu);
    const linhasRodape = [...rodape.matchAll(/<li class="rodape__contacto">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    certo(linhasRodape.length === 2 && linhasRodape[0].includes('253 123 456') && linhasRodape[0].includes(FIXA) && linhasRodape[1].includes('916 228 513') && linhasRodape[1].includes(MOVEL),
      '   o rodapé: cada número com a nota da rede dele', rodape);
    const contactos = pag('contactos/index.html');
    const factos = contactos.match(/<ul class="visita__factos">([\s\S]*?)<\/ul>/)[1];
    const linhasTel = [...factos.matchAll(/<li>(?:(?!<\/li>)[\s\S])*?href="tel:[\s\S]*?<\/li>/g)].map((m) => m[0]);
    certo(linhasTel.length === 2 && linhasTel[0].includes('253 123 456') && linhasTel[0].includes(FIXA) && !linhasTel[0].includes('916') && linhasTel[1].includes('916 228 513') && linhasTel[1].includes(MOVEL),
      '   Contactos: um fixo e um telemóvel não partilham a nota — uma linha cada, cada uma com a sua', linhasTel.join(' ‖ '));
    certo(contactos.includes(`<p class="nota-chamada">${FIXA}</p>`) && !contactos.includes(`<p class="nota-chamada">${MOVEL}</p>`), '   e a nota debaixo de «Ligar agora» (que liga para o telefone 1) é a do fixo');
    const viatura = pag(`viaturas/${J}/index.html`);
    certo(/href="tel:\+351253123456">[\s\S]{0,1000}?253 123 456<\/a>\s*<p class="nota-chamada">\(Chamada para a rede fixa nacional\)<\/p>/.test(viatura), '   a ficha da viatura: o botão com o número, e a nota dele por baixo');
    const termos = pag('termos/index.html');
    certo(termos.includes(`<li>Telefones: 253 123 456 ${FIXA} e 916 228 513 ${MOVEL}</li>`), '   os Termos: «Telefones: 253 123 456 (… rede fixa …) e 916 228 513 (… rede móvel …)»', termos.match(/<li>Telefone[^<]*<\/li>/));
    certo(pag('privacidade/index.html').includes(`pelo telefone 253 123 456 ${FIXA}`) && pag('garantia/index.html').includes(`<strong>253 123 456</strong> ${FIXA}`), '   a Política de privacidade e a Garantia: o telefone 1, com a nota do fixo');
    const todas = g.paginas().map(pag);
    certo(todas.every((h) => notasDe(h).every((n) => n === 'fixa')), `   em nenhuma das ${todas.length} páginas o fixo aparece com «rede móvel»`);
    certo((dealer(inicio) || {}).telephone === '+351253123456' && (dealer(inicio) || {}).department?.telephone === '+351253123456', '   o JSON-LD leva o número novo');
    g.apagar();
    const dois = clonar(DEF);
    dois.contactos.telefone_1 = '253123456'; dois.contactos.telefone_1_texto = '253 123 456'; dois.contactos.telefone_2 = '221234567'; dois.contactos.telefone_2_texto = '22 123 4567';
    const g2 = gerar({ definicoes: dois });
    const f2 = g2.ler('contactos/index.html').match(/<ul class="visita__factos">([\s\S]*?)<\/ul>/)[1];
    certo(g2.status === 0 && contar(f2, /href="tel:/g) === 2 && contar(f2, /\(Chamada para a rede fixa nacional\)/g) === 1 && !f2.includes('móvel')
      && g2.ler('termos/index.html').includes(`<li>Telefones: 253 123 456 e 22 123 4567 ${FIXA}</li>`), 'dois fixos: partilham a nota, como os dois telemóveis de hoje');
    g2.apagar();
  }

  /* ================================================================== */
  secao('sem o telefone 2: nenhuma linha vazia');
  {
    const d = clonar(DEF); delete d.contactos.telefone_2; delete d.contactos.telefone_2_texto;
    const g = gerar({ definicoes: d });
    certo(g.status === 0, 'sem os dois campos do telefone 2: o gerador corre', g.err.slice(-300));
    const rodape = g.ler('index.html').match(/<h3>Contactos<\/h3>[\s\S]*?<\/ul>/)[0];
    certo(contar(rodape, /<li class="rodape__contacto">/g) === 1 && rodape.includes('961 053 363'), 'o rodapé tem uma linha de telefone, a do 1 (antes eram duas, uma vazia a ligar para «tel:+351»)', rodape);
    const contactos = g.ler('contactos/index.html');
    const factos = contactos.match(/<ul class="visita__factos">([\s\S]*?)<\/ul>/)[1];
    certo(contar(factos, /href="tel:/g) === 1 && !/·\s*<a/.test(factos) && !/·\s*<\/b>/.test(factos), 'Contactos: só o telefone 1, sem «·» solto', factos);
    certo(/<meta name="description" content="[^"]*Telefone 961 053 363\. Horário e mapa\.">/.test(contactos), 'a descrição da página de Contactos diz «Telefone 961 053 363.» (era «Telefones 961 053 363 e .»)', contactos.match(/<meta name="description"[^>]*>/));
    certo(g.ler('termos/index.html').includes('<li>Telefone: 961 053 363 (Chamada para a rede móvel nacional)</li>'), 'os Termos: «Telefone: 961 053 363 (…)», no singular');
    const vazios = g.paginas().filter((p) => /href="tel:\+351"|<a href="tel:[^"]*"><\/a>/.test(g.ler(p)));
    certo(vazios.length === 0 && lixoEm(g).length === 0, `em nenhuma das ${g.paginas().length} páginas há ligação de telefone vazia, nem outro lixo`, [...vazios, ...lixoEm(g)].slice(0, 5).join(' | '));
    g.apagar();
  }

  /* ================================================================== */
  secao('um telefone que não se pode publicar pára a construção, sem tocar no _site');
  for (const [desc, mudar] of [
    ['telefone 1 com HTML («961053363"><script>»)', (c) => { c.telefone_1 = '961053363"><script>alert(1)</script>'; }],
    ['telefone 2 de um 800 (que nota se punha?)', (c) => { c.telefone_2 = '800123456'; c.telefone_2_texto = '800 123 456'; }],
    ['telefone 1 em falta', (c) => { delete c.telefone_1; }],
    ['telefone 2 sem o «como aparece»', (c) => { c.telefone_2_texto = ''; }],
  ]) {
    const d = clonar(DEF); mudar(d.contactos);
    const g = gerar({ definicoes: d, ficheiros: { '_site/marca.txt': 'o _site de antes' } });
    certo(g.status === 1 && /ERRO: o telefone [12] \(Dados do stand › Contactos\)/.test(g.err) && g.ler('marca.txt') === 'o _site de antes' && !existsSync(join(g.dir, '_site', 'index.html')),
      `${desc}: sai com 1, diz qual e onde se corrige, e o _site fica como estava`, `${g.status} ${g.err.slice(-300)}`);
    g.apagar();
  }

  /* ================================================================== */
  secao('valores hostis nos dados do stand (mesmo os que as regras recusam)');
  {
    const d = clonar(DEF);
    const XSS = '</script><script>alert(1)</script><!--';
    const LS = String.fromCharCode(0x2028);
    d.empresa.denominacao_social = 'Luís & Ricardo **Motors** [clique](javascript:alert(2)), Lda';
    d.empresa.nome_comercial = '<i>LR</i> "Motors"';
    d.empresa.capital_social = '20.000,00 € $& $1 $$';
    d.empresa.cae = '{{empresa.nif}} — `código`';
    d.empresa.forma_juridica = `Sociedade${LS}por quotas </script>`;
    d.stand.morada = 'Rua 1 <b>negrito</b> & "aspas"';
    d.stand.latitude = '41.6469" onmouseover="alert(3)';
    d.stand.mapa = 'javascript:alert(4)';
    d.redes.instagram = 'javascript:alert(5)';
    d.redes.facebook = 'https://exemplo.pt/"><script>alert(6)</script>';
    d.contactos.whatsapp = '351961053363"><script>alert(7)</script>';
    d.contactos.email = '"><script>alert(8)</script>@x.pt';
    d.textos.reclamo = XSS;
    d.textos.hero_titulo = '<img src=x onerror=alert(9)>';
    d.textos.sobre_texto = `Vendemos ${XSS} desde 2015`;
    d.textos.aviso_visita = 'Em **Vila do Conde** <script>alert(10)</script>';
    d.textos.locais = 'Vila Verde <b>&</b> Braga';
    d.horario[0].dias = `Segunda a sexta ${XSS}`;
    d.horario[2].horas = '"><img src=x onerror=alert(11)>';
    const g = gerar({ definicoes: d });
    certo(g.status === 0, 'o gerador corre (as regras parariam isto antes; aqui prova-se que o gerador não precisa delas para não partir)', g.err.slice(-300));
    const pags = g.paginas();
    const execucao = /<script>alert|<img src=x|<i>LR|<b>negrito|<b>&|onmouseover="alert|<!--(?! )/;
    const comExecucao = pags.filter((p) => execucao.test(g.ler(p).replace(/<!--\s[\s\S]*?-->/g, '')));
    certo(comExecucao.length === 0, `em nenhuma das ${pags.length} páginas um valor hostil vira marcação (<script>, <img>, <b>, atributos, um «<!--» a abrir comentário)`, comExecucao.slice(0, 5).join(', '));
    /* Um «</script» por escapar FECHA o bloco a meio: o que se apanha até ao
       primeiro «</script>» já não o tem, mas deixa de ser JSON. Por isso a
       prova é que todos os blocos se lêem — e a ida e volta, logo a seguir. */
    const blocos = pags.flatMap((p) => jsonLD(g.ler(p)).map((b) => ({ p, ...b })));
    certo(blocos.length > 30 && blocos.every((b) => b.obj !== null && !/<!--/.test(b.cru)), `os ${blocos.length} blocos JSON-LD lêem-se todos como JSON, sem um «<!--» por escapar (um «</script» de um texto partia-os a meio)`,
      blocos.filter((b) => b.obj === null).slice(0, 3).map((b) => `${b.p}: ${b.cru.slice(-80)}`).join(' | '));
    const ld = dealer(g.ler('index.html')) || {};
    certo(ld.legalName === d.empresa.denominacao_social && ld.name === d.empresa.nome_comercial && (ld.address || {}).streetAddress === d.stand.morada,
      '   e lidos como JSON, os valores são exactamente os que o dono escreveu (o escape não muda o texto)', JSON.stringify([ld.legalName, ld.name, (ld.address || {}).streetAddress]));
    certo(!('geo' in ld) && JSON.stringify(ld.sameAs) === '[]' && !('email' in ld), '   o JSON-LD não leva coordenadas que não são números, redes que não são https://, nem um email que não é email');
    const hrefs = pags.flatMap((p) => [...atributos(g.ler(p), 'href'), ...atributos(g.ler(p), 'src')]);
    const maus = hrefs.filter((h) => /^\s*javascript:/i.test(h) || /["<>]/.test(h));
    certo(hrefs.length > 500 && maus.length === 0, `nenhum dos ${hrefs.length} endereços (href, src) é «javascript:» ou tem aspas ou «<>» por codificar`, maus.slice(0, 5).join(' | '));
    const inicio = g.ler('index.html');
    certo(!/rodape__rede" href="[^"]*" target="_blank" rel="noopener me" aria-label="(Instagram|Facebook)"/.test(inicio), '   as redes que não são https:// não aparecem no rodapé');
    const zap = atributos(inicio, 'href').filter((h) => h.startsWith('https://wa.me/'));
    certo(zap.length >= 3 && zap.every((h) => h === `https://wa.me/${encodeURIComponent(d.contactos.whatsapp)}`), '   o WhatsApp vai codificado no endereço (wa.me), em todos os botões', zap[0]);
    certo(atributos(inicio, 'href').some((h) => h === `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${d.stand.morada}, ${d.stand.codigo_postal} ${d.stand.localidade}`)}`), '   sem coordenadas que sejam números, o «Como chegar» leva à morada');
    certo(atributos(inicio, 'href').some((h) => h === `https://www.google.com/maps?q=${encodeURIComponent(`${d.stand.morada}, ${d.stand.codigo_postal} ${d.stand.localidade}`)}`) && !inicio.includes('javascript:alert(4)'), '   e o link do mapa que não é https:// passa a um feito da morada');
    const termos = g.ler('termos/index.html');
    certo(termos.includes('Luís &amp; Ricardo **Motors** [clique](javascript:alert(2)), Lda') && !/<a href="javascript/.test(termos), 'nos Termos, os asteriscos e o «[x](…)» de um dado ficam texto: nem negrito, nem ligação');
    certo(termos.includes('capital social de 20.000,00 € $&amp; $1 $$') && termos.includes('<li>CAE {{empresa.nif}} — `código`</li>'), '   «$&», «$1» e «$$» chegam como estão (não são padrões de substituição), e um «{{…}}» num dado não se volta a preencher');
    const rodape = inicio.match(/<p class="rodape__texto">([\s\S]*?)<\/p>/)[1];
    certo(rodape === `${'&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;!--'}. Stand em Vila Verde &lt;b&gt;&amp;&lt;/b&gt; Braga, com oficina própria.`, '   a frase do rodapé: a frase da marca e «Onde estamos», escapadas', rodape);
    g.apagar();
  }

  /* ================================================================== */
  secao('valores hostis numa viatura e nos nomes dos ficheiros (o gerador sem a cópia neutralizada)');
  {
    const SLUG = "carro&x'y";
    const PASTA = `assets/veiculos/${SLUG}`;
    const v = {
      marca: '<img src=x onerror=alert(1)>', modelo: 'Modelo "aspas"', versao: "1.0 'plica' </script>", tipo: 'carro', carrocaria: 'SUV',
      preco: '"><b>caro</b>', estado: 'disponivel" onmouseover="alert(2)', publicado: true, destaque: true, ordem: 1,
      ano: '2020"><i>', km: '<i>9</i>', combustivel: 'Gasolina', caixa: 'Manual', potencia: 100,
      descricao: 'Bom **carro**.</script><script>alert(3)</script><!-- fim',
      equipamento: ['<b>Ar</b>', 'GPS "novo"'], garantia: '<u>18</u> meses',
      fotos: [`${PASTA}/a"b.jpg`, `${PASTA}/c<d>.jpg`, `${PASTA}/e&f'g.jpg`],
    };
    const ficheiros = { [`${PASTA}/a"b.jpg`]: 'x', [`${PASTA}/c<d>.jpg`]: 'x', [`${PASTA}/e&f'g.jpg`]: 'x' };
    for (const w of [480, 960, 1600]) ficheiros[`assets/fotos/${SLUG}/e&f'g-${w}.webp`] = 'x';
    const vendida = { ...clonar(VENDIDAS['volvo-v60-24-d6-r-design-phev']), estado: 'vendido' };
    const g = gerar({ viaturas: { [SLUG]: v, [J]: VIATURAS[J] }, vendidas: { 'v"w': vendida }, ficheiros });
    certo(g.status === 0, 'o gerador corre com a viatura hostil e com nomes de ficheiro com aspas, «<>», «&» e plicas', g.err.slice(-400));
    const pagina = g.ler(`viaturas/${SLUG}/index.html`);
    const lista = g.ler('viaturas/index.html');
    const inicio = g.ler('index.html');
    const todas = g.paginas().map((p) => [p, g.ler(p)]);
    const marc = todas.filter(([, h]) => /<img src=x|<script>alert|<b>caro|<i>9|<b>Ar|<u>18|onmouseover="alert/.test(h.replace(/<!--\s[\s\S]*?-->/g, ''))).map(([p]) => p);
    certo(pagina && marc.length === 0, `em nenhuma das ${todas.length} páginas um valor da viatura vira marcação`, marc.join(', '));
    certo(!/NaN/.test(pagina + lista + inicio), '   e uns quilómetros que não são número não aparecem como «NaN km»');
    const cartao = (lista.match(/<article class="cartao [^>]*>/g) || []).find((a) => a.includes('data-km="&lt;i&gt;9')) || '';
    certo(/^<article class="cartao cartao--disponivel"/.test(cartao) && cartao.includes('data-preco="&quot;&gt;&lt;b&gt;caro&lt;/b&gt;"') && cartao.includes('data-ano="2020&quot;&gt;&lt;i&gt;"') && cartao.includes('data-km="&lt;i&gt;9&lt;/i&gt;"'),
      'o cartão: a classe é um dos quatro estados, e o preço, o ano e os quilómetros vão escapados nos data-', cartao);
    const fotos = lerOuNull((pagina.match(/<script type="application\/json" id="fotos-json">([\s\S]*?)<\/script>/) || [])[1]) || [];
    certo(fotos.length === 3 && fotos.some((f) => f.src.includes('a"b.jpg')) && fotos.some((f) => f.src.includes('c<d>.jpg')) && !/<\/script/i.test((pagina.match(/id="fotos-json">([\s\S]*?)<\/script>/) || ['', ''])[1]),
      'a lista das fotografias da galeria (JSON num <script>) lê-se com os nomes tal e qual, e sem nada a fechar o <script>', JSON.stringify(fotos));
    const srcs = [...atributos(pagina, 'src'), ...atributos(pagina, 'srcset'), ...atributos(inicio, 'src'), ...atributos(inicio, 'srcset')].filter((s) => s.includes(SLUG));
    certo(srcs.length >= 5 && srcs.some((s) => s.includes('a"b.jpg')) && srcs.some((s) => s.includes('c<d>.jpg')) && srcs.some((s) => s.includes("e&f'g-960.webp")),
      `os ${srcs.length} src/srcset destas fotografias lêem-se, descodificados, com o nome certo (as aspas e o «<» escapados no atributo)`, srcs.slice(0, 4).join(' | '));
    const ld = jsonLD(pagina).map((b) => b.obj).find((o) => o && o['@type'] === 'Product');
    certo(ld && ld.description === v.descricao && ld.brand.name === v.marca, 'o JSON-LD da viatura, lido, tem a descrição e a marca exactamente como estão no ficheiro', JSON.stringify(ld && [ld.description, ld.brand]));
    const href = `/viaturas/${SLUG}/`;
    certo(atributos(lista, 'href').includes(href) && atributos(inicio, 'href').includes(href)
      && g.ler('sitemap.xml').includes(`<loc>${SITE}/viaturas/carro&amp;x&#39;y/</loc>`) && !/&(?!amp;|quot;|#39;|lt;|gt;)/.test(g.ler('sitemap.xml')),
      'um endereço com «&» e plica: as ligações lêem-se certas e o sitemap continua XML (todos os «&» escapados)', g.ler('sitemap.xml').match(/<loc>[^<]*carro[^<]*<\/loc>/));
    const stub = g.ler('viaturas/v"w/index.html');
    certo(stub && stub.includes('<meta http-equiv="refresh" content="0; url=/viaturas/#v-v&quot;w">') && stub.includes('<a href="/viaturas/#v-v&quot;w">') && lista.includes('id="v-v&quot;w"'),
      'o reencaminhamento de uma vendida com aspas no nome: o refresh e a ligação escapados, e a âncora é a do cartão', stub && stub.match(/<meta http-equiv[^>]*>/));
    g.apagar();
  }

  /* ================================================================== */
  secao('os dados que o gerador ignorava chegam ao site');
  {
    const d = clonar(DEF);
    d.contactos.email = 'geral@lrmotorsautomoveis.pt';
    d.sede_social = { morada: 'Rua Dom Egas Pais 837', codigo_postal: '4730-531', localidade: 'São Miguel Carreiras', distrito: 'Braga' };
    d.empresa.capital_social = '50.000,00 €';
    d.empresa.forma_juridica = 'Sociedade Unipessoal por Quotas';
    d.empresa.cae = '45200 — Manutenção e reparação de veículos automóveis';
    d.textos.locais = 'Vila Verde e Vila do Conde';
    d.stand.localidade = 'Prado';
    const vs = clonar(VIATURAS); vs[J].ano_construcao = 2012;
    const g = gerar({ definicoes: d, viaturas: vs });
    certo(g.status === 0, 'o gerador corre com os dados novos', g.err.slice(-300));
    const termos = g.ler('termos/index.html');
    certo(termos.includes('<li>Sociedade Unipessoal por Quotas, capital social de 50.000,00 €</li>') && termos.includes('<li>CAE 45200 — Manutenção e reparação de veículos automóveis</li>'),
      'os Termos: a forma jurídica, o capital e o CAE saem dos Dados legais da empresa (estavam escritos à mão)');
    certo(termos.includes('<li>Sede: Rua Dom Egas Pais 837, 4730-531 São Miguel Carreiras, Braga</li>') && termos.includes('<li>Stand: Rua 1, Lugar de Febros 52, 4730-251 Prado, Braga</li>') && !termos.includes('Sede e stand'),
      '   com a sede social preenchida, «Sede» e «Stand» em linhas separadas (sem ela: «Sede e stand», como hoje)');
    certo(termos.includes('<li>Email: geral@lrmotorsautomoveis.pt</li>'), '   e o email, quando há (DL 7/2004: o endereço electrónico é parte da identificação)');
    certo(g.ler('privacidade/index.html').includes('Sociedade Unipessoal por Quotas com sede na Rua Dom Egas Pais 837, 4730-531 São Miguel Carreiras, pessoa colectiva n.º 517541904'),
      'a Política de privacidade: o responsável com a sede social e a forma jurídica dos dados');
    const contactos = g.ler('contactos/index.html');
    certo(contactos.includes('<a href="mailto:geral@lrmotorsautomoveis.pt">geral@lrmotorsautomoveis.pt</a>') && /<h3>Contactos<\/h3>[\s\S]*?mailto:geral@lrmotorsautomoveis\.pt[\s\S]*?<\/ul>/.test(g.ler('index.html'))
      && (dealer(g.ler('index.html')) || {}).email === 'geral@lrmotorsautomoveis.pt', 'o email aparece nos Contactos, no rodapé de todas as páginas e no JSON-LD');
    const inicio = g.ler('index.html');
    certo(inicio.includes('Stand em Vila Verde e Vila do Conde, com oficina própria.') && inicio.includes('<h2 class="h-secao">Estamos em Prado</h2>') && inicio.includes('LR Motors · Prado</p>'),
      '«Onde estamos» vai para a frase do rodapé, e a localidade do stand para o «Estamos em …» da página inicial (os dois estavam escritos à mão)');
    const prod = jsonLD(g.ler(`viaturas/${J}/index.html`)).map((b) => b.obj).find((o) => o && o['@type'] === 'Product') || {};
    certo(prod.productionDate === '2012', 'o ano de construção, quando há, é o productionDate do JSON-LD (era sempre o da matrícula)', prod.productionDate);
    g.apagar();
    const semDistrito = clonar(DEF); delete semDistrito.stand.distrito; delete semDistrito.textos.locais; semDistrito.textos.reclamo = 'Os melhores usados!';
    const g2 = gerar({ definicoes: semDistrito });
    const i2 = g2.ler('index.html');
    certo(g2.status === 0 && i2.includes('<br>4730-251 Vila Verde</a>') && i2.includes('<br>4730-251 Vila Verde</span>') && !/Vila Verde, </.test(i2) && i2.includes('<p class="rodape__texto">Os melhores usados! Stand em Vila Verde, com oficina própria.</p>'),
      'sem distrito, a morada não fica com uma vírgula solta; sem «Onde estamos», a frase do rodapé usa a localidade; uma frase da marca com «!» não leva outro ponto');
    g2.apagar();
  }

  /* ================================================================== */
  secao('os marcadores das páginas legais');
  {
    const termos = readFileSync(join(RAIZ, 'conteudo', 'termos.md'), 'utf8');
    const g = gerar({ ficheiros: { 'conteudo/termos.md': termos.replace('{{empresa.nif}}', '{{empresa.nipc}}'), '_site/marca.txt': 'antes' } });
    certo(g.status === 1 && /conteudo\/termos\.md: o marcador «\{\{empresa\.nipc\}\}» não existe\. Os que existem: empresa\.denominacao_social, /.test(g.err) && g.ler('marca.txt') === 'antes',
      'um marcador que não existe pára a construção, com o ficheiro e a lista dos que existem, e o _site fica como estava', g.err.slice(-300));
    g.apagar();
    const d = clonar(DEF); d.empresa.capital_social = '';
    const g2 = gerar({ definicoes: d });
    certo(g2.status === 1 && /«\{\{empresa\.capital_social\}\}» está vazio — preencha «Dados legais da empresa › Capital social»/.test(g2.err), 'um obrigatório vazio pára, e diz que campo preencher', g2.err.slice(-300));
    g2.apagar();
    const d3 = clonar(DEF); delete d3.empresa.cae;
    const g3 = gerar({ definicoes: d3 });
    certo(g3.status === 0 && !/<li>CAE/.test(g3.ler('termos/index.html')) && g3.ler('termos/index.html').includes('<li>Pessoa colectiva e matrícula n.º 517541904</li><li>Telefones:'), 'sem CAE, a linha do CAE sai inteira (não fica «CAE » sozinho)');
    g3.apagar();
    const resto = ['privacidade.md', 'termos.md', 'garantia.md', 'resolucao-de-litigios.md'].map((f) => readFileSync(join(RAIZ, 'conteudo', f), 'utf8'));
    certo(resto.every((t) => !/961|916|517541904|Febros|20\.000/.test(t)), 'nos conteudo/*.md já não há telefone, NIF, morada nem capital escritos à mão');
  }

  /* ================================================================== */
  secao('o caminho do backoffice: apagar cada chave, uma a uma');
  {
    const caminhos = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => { const c = pre ? `${pre}.${k}` : k; return v && typeof v === 'object' ? [c, ...caminhos(v, c)] : [c]; });
    const apagar = (o, c) => { const partes = c.split('.'); const ult = partes.pop(); let x = o; for (const p of partes) x = x[p]; if (Array.isArray(x)) x.splice(Number(ult), 1); else delete x[ult]; };
    let n = 0; let param = 0; const f = [];
    for (const c of caminhos(DEF)) {
      const d = clonar(DEF); apagar(d, c); n++;
      if (R.problemas({ definicoes: d }).some((p) => p.classe === 'bloqueia')) { param++; continue; }   // o CI pára antes de gerar
      const g = gerar({ definicoes: d });
      if (g.status !== 0) f.push(`${c}: o gerador saiu com ${g.status} (${g.err.trim().split('\n').pop()})`);
      else f.push(...lixoEm(g).map((x) => `${c}: ${x}`));
      g.apagar();
    }
    certo(f.length === 0 && n > 40, `definicoes.json: ${n} chaves apagadas; ${param} param a publicação nas regras, e com cada uma das outras ${n - param} o site sai limpo`, f.slice(0, 6).join(' | '));
    let nv = 0; const fv = [];
    for (const nome of [J, P]) {
      for (const k of Object.keys(VIATURAS[nome])) {
        const vs = clonar(VIATURAS); delete vs[nome][k]; nv++;
        /* A cópia que o CI dá ao gerador (as regras neutralizam: sem marca ou
           sem modelo, a viatura fica escondida). */
        const dados = { viaturas: Object.fromEntries(Object.entries(vs).map(([x, v]) => [x, JSON.stringify(v, null, 2)])) };
        const neut = R.neutralizar(dados, R.problemas(dados));
        for (const [fich, t] of Object.entries(neut.ficheiros)) vs[fich.split('/').pop().slice(0, -5)] = JSON.parse(t);
        const g = gerar({ viaturas: vs });
        if (g.status !== 0) fv.push(`${nome} sem ${k}: saiu com ${g.status}`);
        else fv.push(...lixoEm(g).map((x) => `${nome} sem ${k}: ${x}`));
        g.apagar();
      }
    }
    certo(fv.length === 0 && nv > 30, `viaturas: ${nv} chaves apagadas (o Jaguar e o Puma), com a cópia que o CI dá ao gerador — o site sai sempre limpo`, fv.slice(0, 6).join(' | '));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
