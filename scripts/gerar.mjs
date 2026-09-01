/* ==========================================================================
   LR MOTORS — gerador do site
   --------------------------------------------------------------------------
   Lê data/viaturas.json + data/definicoes.json e escreve HTML já pronto.

   Porquê um gerador e não desenhar os anúncios em JavaScript no browser:
   as páginas que valem dinheiro num stand são as de cada viatura ("BMW i4
   usado Braga"). Conteúdo que só existe depois de o JavaScript correr entra
   na segunda vaga de indexação do Google e, em sites novos, pode nunca lá
   chegar. Aqui cada viatura sai do build com <title>, meta description,
   canónico, Open Graph e JSON-LD no código-fonte.

   Porquê sem dependências: um stand não tem quem faça manutenção. Não há
   npm install, não há árvore de dependências a apodrecer, e daqui a três
   anos isto compila na mesma.

   Correr:  node scripts/gerar.mjs
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SAIDA = join(RAIZ, '_site');

const def = JSON.parse(readFileSync(join(RAIZ, 'data/definicoes.json'), 'utf8'));
/* Um ficheiro JSON por viatura, em data/viaturas/. É assim que o backoffice as
   trata — cada anúncio é uma entrada própria, cria-se e apaga-se sozinha, e dois
   anúncios editados ao mesmo tempo não colidem no mesmo ficheiro. */
const PASTA_VIATURAS = join(RAIZ, 'data/viaturas');
/* E as vendidas numa subpasta, para não estarem no caminho de quem trata do
   stock. Quem as move para lá é a publicação (.github/workflows/publicar.yml),
   a olhar para o campo `estado` — o backoffice não deixa arrastar ficheiros
   entre pastas. Aqui lêem-se as duas na mesma, porque para o site uma vendida
   continua a ser uma viatura: aparece na página, na lista e no mapa do site. */
const PASTA_VENDIDAS = join(PASTA_VIATURAS, 'vendidas');
/* Espaços a mais fora, à entrada e num sítio só.
   ---------------------------------------------------------------------------
   O cliente escreve estes campos à mão, ou cola-os do Standvirtual, e vêm com
   espaços atrás — «Land Rover », «Smart », «Polaris », «18 meses - Iva
   dedutível ». Nenhum deles se vê no ecrã, e todos contam:

   - a MARCA é o que agrupa a faixa «Escolha pela marca» e o filtro. «Land
     Rover » e «Land Rover» são duas marcas diferentes para o código: bastava
     ele escrever a segunda viatura sem o espaço para aparecerem dois cartões
     da mesma marca e duas opções iguais no filtro;
   - a etiqueta da garantia e o nome do modelo saíam com o espaço no meio do
     HTML, o que dá espaçamentos estranhos ao lado da pontuação.

   Limpa-se na leitura e não em cada uso: são vinte sítios a mostrar estes
   campos, e a próxima vez que alguém acrescentar um esquecia-se. */
function limparCampos(v) {
  const limpo = {};
  for (const [k, val] of Object.entries(v)) {
    /* U+2028 e U+2029 são separadores de linha do Unicode e vêm em texto colado
       de outros programas — há um na descrição do Corsa. Não são `\n`, por isso
       escapavam à divisão em parágrafos, e a mesma descrição vai também para a
       meta e para o JSON-LD, onde nada os trata. Normalizam-se aqui, à entrada,
       e não em cada sítio que os pudesse encontrar. */
    if (typeof val === 'string') limpo[k] = val.replace(/[\u2028\u2029]/g, '\n').trim();
    else if (Array.isArray(val)) {
      limpo[k] = val.map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x !== '');
    } else limpo[k] = val;
  }
  return limpo;
}

/* O ENDEREÇO DA PÁGINA VEM DO NOME DO FICHEIRO, e não de um campo.
   ---------------------------------------------------------------------------
   Havia um campo `slug` que o cliente tinha de preencher à mão — «Endereço da
   página (referência)», com um parágrafo a explicar que só podia levar
   minúsculas e hífens e que NUNCA mais podia ser mudado. Era o campo mais
   técnico do backoffice inteiro, num formulário para o dono de um stand, e um
   erro nele partia o endereço de uma página já partilhada.

   Agora não existe. O Pages CMS já dá nome ao ficheiro a partir da marca, do
   modelo e da versão (passa-os pelo slugify dele), e é esse nome que manda —
   é a identidade do ficheiro de qualquer maneira, não há duas fontes de
   verdade que possam divergir. Os 16 ficheiros que já existiam tinham nome
   igual ao slug, por isso nenhum endereço mexeu.

   Normaliza-se, porque o nome gerado pode trazer hífens a mais: se a versão
   estiver vazia sai «renault-captur-.json», e o endereço não tem que herdar o
   traço solto. */
const slugDoFicheiro = (nomeDoFicheiro) =>
  nomeDoFicheiro.replace(/\.json$/, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

const lerPasta = (pasta) =>
  (existsSync(pasta) ? readdirSync(pasta) : [])
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      ficheiro: join(pasta, f),
      v: { ...limparCampos(JSON.parse(readFileSync(join(pasta, f), 'utf8'))), slug: slugDoFicheiro(f) },
    }));

const ficheiros = [...lerPasta(PASTA_VIATURAS), ...lerPasta(PASTA_VENDIDAS)];

/* Duas pastas, um só site: dois ficheiros com o mesmo `slug` escreviam a mesma
   página um por cima do outro e ganhava o último a ser gerado, em silêncio. É
   o que aconteceria se a mudança de pasta falhasse a meio — o ficheiro copiado
   e o original ainda lá — ou se alguém criasse a viatura à mão nas Vendidas.
   Mata-se a construção: publicar meia venda é pior do que não publicar. */
const porSlug = new Map();
for (const { ficheiro, v } of ficheiros) {
  const anterior = porSlug.get(v.slug);
  if (anterior) {
    console.error(`\nERRO: duas viaturas com o mesmo endereço "${v.slug}":`);
    console.error(`  ${relative(RAIZ, anterior)}`);
    console.error(`  ${relative(RAIZ, ficheiro)}`);
    console.error('Apague uma delas — provavelmente a que está fora da pasta certa.\n');
    process.exit(1);
  }
  porSlug.set(v.slug, ficheiro);
}

const todas = ficheiros
  .map(({ v }) => v)
  .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));

/* O site vive em renatovalente5.github.io/LR_Motors/ enquanto não houver
   domínio próprio. Todos os caminhos passam por u() — escrever "/assets/..."
   à mão parte o site publicado e funciona em local, que é a pior combinação. */
const BASE = (process.env.BASE ?? '/LR_Motors').replace(/\/$/, '');
const SITE = process.env.SITE ?? `https://renatovalente5.github.io${BASE}`;
const u = (p = '') => (BASE + '/' + String(p).replace(/^\//, '')).replace(/\/{2,}/g, '/');
const abs = (p = '') => SITE.replace(/\/$/, '') + '/' + String(p).replace(/^\//, '');

/* O backoffice (Pages CMS) vive fora do site, e o endereço leva o nome do
   repositório em minúsculas — é assim que o Pages CMS o escreve. */
const GH_REPO = process.env.GH_REPO ?? 'renatovalente5/lr_motors';

/* Sufixo de versão nos ficheiros que mudam. Sem isto, o browser de quem já
   visitou fica com o CSS antigo depois de o cliente publicar uma alteração —
   e a página aparece meio partida sem ninguém perceber porquê. */
function versao(caminho) {
  try {
    const h = createHash('sha1').update(readFileSync(join(RAIZ, caminho))).digest('hex').slice(0, 8);
    return u(caminho) + '?v=' + h;
  } catch { return u(caminho); }
}

/* ------------------------------------------------------------- utilitários */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nEuro = (n) => new Intl.NumberFormat('pt-PT').format(n) + ' €';
/* Sem preço publicado não se inventa nem se escreve 0: diz-se que é sob
   consulta. Quando há preço, ele é final e com impostos incluídos — é o que
   o DL 138/90 exige a quem anuncia preços. */
const temPreco = (v) => typeof v.preco === 'number' && v.preco > 0;
const precoTexto = (v) => temPreco(v) ? nEuro(v.preco) : 'Sob consulta';

const nKm = (n) => new Intl.NumberFormat('pt-PT').format(n) + ' km';

/* Texto que o cliente escreve num campo de várias linhas do backoffice.
   ---------------------------------------------------------------------------
   Estava a ser posto dentro de um único <p>, e em HTML uma mudança de linha
   não passa de um espaço: uma descrição escrita com parágrafos e uma lista de
   extras — como as que o cliente copia do Standvirtual — saía toda seguida,
   num bloco de texto de dez linhas sem uma pausa. Foi o que ele reportou.

   Aqui: uma linha em branco separa parágrafos, uma mudança de linha simples
   fica <br>, e o que estiver entre dois asteriscos aparece a negrito (o mesmo
   que já se faz no aviso da visita).

   A ordem importa. Escapa-se PRIMEIRO — senão um `<` escrito pelo cliente
   passaria a marcação — e só depois se acrescenta o HTML que queremos. */
function textoRico(bruto) {
  /* Os separadores de linha do Unicode já vêm normalizados de limparCampos();
     aqui trata-se só do `\r` do Windows. */
  const s = String(bruto ?? '').replace(/\r\n?/g, '\n').trim();
  if (!s) return '';
  return s.split(/\n{2,}/).map((paragrafo) => `<p>${
    esc(paragrafo)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
  }</p>`).join('');
}

/* OS QUATRO ESTADOS DE UMA VIATURA, num sítio só.
   ---------------------------------------------------------------------------
   A reserva já foi um interruptor à parte do estado, e isso permitia estados
   impossíveis: um carro reservado E vendido ao mesmo tempo. Havia uma regra
   escrita a dizer qual mandava. Agora são quatro valores de UMA lista, e a
   contradição deixou de se poder exprimir.

   `brevemente` é uma viatura que ainda não chegou: aparece na listagem, com
   etiqueta, mas não se anuncia como disponível — ao Google vai `PreOrder`, que
   é o que schema.org tem para isto. */
const ESTADOS = {
  disponivel: { rotulo: 'À venda', schema: 'InStock' },
  reservado: { rotulo: 'Reservado', schema: 'LimitedAvailability' },
  brevemente: { rotulo: 'Brevemente', schema: 'PreOrder' },
  vendido: { rotulo: 'Vendido', schema: 'SoldOut' },
};
/* Um estado que não esteja na lista conta como à venda: é o que menos estraga
   se alguém escrever à mão no ficheiro uma palavra que o backoffice não oferece. */
/* Um estado que o site não conhece vale «à venda» — é o que menos estraga: a
   viatura aparece na listagem como qualquer outra em vez de desaparecer. Mas
   passa a avisar. O backoffice só deixa escolher da lista, por isso isto só
   acontece se alguém editar o JSON à mão ou se um estado for renomeado aqui e
   os dados ficarem para trás; nesse caso o site continuaria a publicar como
   disponível uma viatura vendida, e ninguém dava por ela. */
const estadoDe = (v) => (ESTADOS[v.estado] ? v.estado : 'disponivel');
for (const v of todas) {
  if (v.estado != null && v.estado !== '' && !ESTADOS[v.estado]) {
    console.warn(`  !! "${v.marca} ${v.modelo}" tem estado "${v.estado}", que não existe — fica à venda`);
  }
}
const estaVendida = (v) => estadoDe(v) === 'vendido';
const estaReservada = (v) => estadoDe(v) === 'reservado';
const eBrevemente = (v) => estadoDe(v) === 'brevemente';

const publicadas = todas.filter((v) => v.publicado !== false);
const aVenda = publicadas.filter((v) => !estaVendida(v));

/* Os tipos que existem mesmo em stock, para o rodapé não oferecer categorias
   vazias. O rótulo é o plural por que se lhes chama na navegação. */
/* Aviso de visita noutro local — o stand mostra viaturas em Vila do Conde com
   marcação. Sai das definições e aparece nos três sítios onde alguém pensa
   «isso é longe»: a secção de visitar, a página de contactos e a ficha da
   viatura, ao pé dos botões. Vazio, não aparece em lado nenhum. */

const avisoVisita = (def.textos.aviso_visita || '').trim();
/* O texto aceita **negrito**, e é a única forma honesta de o cliente realçar o
   local sem eu fixar «Vila do Conde» no código — amanhã pode ser outro sítio.
   Escapa-se PRIMEIRO e só depois se converte, senão um `<` escrito no
   backoffice passava a marcação. */
const notaVisita = (classe = '') => avisoVisita
  ? `<p class="nota-visita ${classe}">${ic.pin}<span>${
      esc(avisoVisita).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    }</span></p>` : '';

const ROTULO_TIPO = { carro: 'Carros', mota: 'Motos', 'off-road': 'Off-road' };
const tiposEmStock = [...new Set(aVenda.map((v) => v.tipo).filter(Boolean))]
  .map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] || t }))
  .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt'));
const vendidas = publicadas.filter((v) => estaVendida(v));

const titulo = (v) => [v.marca, v.modelo].filter(Boolean).join(' ');
const tituloLongo = (v) => [v.marca, v.modelo, v.versao].filter(Boolean).join(' ');

/* Constrói o srcset a partir das variantes que EXISTEM em disco. O pipeline de
   imagens gera -480/-960/-1600; se um dia faltar uma, o site não parte. */
function fotos(v) {
  const dir = `assets/veiculos/${v.slug}`;
  const pasta = join(RAIZ, dir);
  const existentes = existsSync(pasta) ? readdirSync(pasta) : [];

  /* A lista vem do JSON (é a ordem que o cliente definiu no backoffice). Se
     ainda não houver lista, cai para o que estiver na pasta, por nome. */
  /* Sem lista, o og.jpg tem de ser excluído à mão: é o cartão de partilha,
     1200x630 cortado ao centro, e entrava na galeria como se fosse mais uma
     fotografia do carro — sem variantes, servido em tamanho grande. */
  let caminhos = Array.isArray(v.fotos) && v.fotos.length
    ? v.fotos
    : [...new Set(existentes.filter((f) => f !== 'og.jpg')
        .map((f) => f.replace(/-(?:480|960|1600)\.webp$/, '')))]
        .sort().map((b) => `${dir}/${b}`);

  /* Uma foto apagada na biblioteca do backoffice deixa a lista do JSON a
     apontar para um ficheiro que já não existe, e o site passa a servir uma
     imagem partida. Aconteceu: o cliente apagou as variantes da quinta foto do
     Peugeot 2008 enquanto experimentava a biblioteca.

     Salta-se em vez de falhar a construção de propósito. Falhar deixaria o
     cliente sem publicar nada por causa de uma fotografia; assim o site fica
     certo, com menos uma foto, e o aviso fica no registo da Action. */
  caminhos = caminhos.filter((c) => {
    const limpo = String(c).replace(/^\/+/, '');
    const nome = limpo.split('/').pop();
    const pastaRel = limpo.includes('/') ? limpo.slice(0, limpo.lastIndexOf('/')) : dir;
    const base = nome.replace(/\.[a-z0-9]+$/i, '').replace(/-(?:480|960|1600)$/, '');
    const vizinhos = existsSync(join(RAIZ, pastaRel)) ? readdirSync(join(RAIZ, pastaRel)) : [];
    const ha = vizinhos.some((f) => f === nome || f.startsWith(base + '-'));
    if (!ha) console.warn(`  !! ${v.slug}: a foto ${limpo} está na lista mas não existe — ignorada`);
    return ha;
  });

  return caminhos.map((c) => {
    const limpo = String(c).replace(/^\/+/, '');
    const nome = limpo.split('/').pop();
    /* As variantes vivem ao lado do ficheiro, seja qual for a pasta em que o
       backoffice o tenha gravado — não se assume a pasta da viatura. */
    const pastaRel = limpo.includes('/') ? limpo.slice(0, limpo.lastIndexOf('/')) : dir;
    const vizinhos = existsSync(join(RAIZ, pastaRel)) ? readdirSync(join(RAIZ, pastaRel)) : [];
    /* Tira a extensão e um eventual sufixo de largura: tanto serve
       "01-1600.webp" como "IMG_4821.jpg" acabado de carregar pelo cliente. */
    const base = nome.replace(/\.[a-z0-9]+$/i, '').replace(/-(?:480|960|1600)$/, '');
    const larguras = [480, 960, 1600].filter((w) => vizinhos.includes(`${base}-${w}.webp`));
    if (!larguras.length) {
      /* Sem variantes geradas ainda: serve-se o ficheiro tal como está, para a
         foto aparecer à mesma enquanto a Action não corre. */
      const url = u(limpo.startsWith('assets/') ? limpo : `${dir}/${nome}`);
      return { src: url, srcset: '', srcCartao: url, srcsetCartao: '' };
    }
    const url = (w) => u(`${pastaRel}/${base}-${w}.webp`);
    return {
      src: url(larguras.at(-1)),
      srcset: larguras.map((w) => `${url(w)} ${w}w`).join(', '),
      srcsetCartao: larguras.filter((w) => w <= 960).map((w) => `${url(w)} ${w}w`).join(', '),
      srcCartao: url(larguras.includes(960) ? 960 : larguras[0]),
    };
  });
}


/* ----------------------------------------------------------------- ícones */
const ic = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  km: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 12l4-3M12 7v1"/></svg>',
  gota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.7S5.5 9.4 5.5 14a6.5 6.5 0 0 0 13 0C18.5 9.4 12 2.7 12 2.7Z"/></svg>',
  caixa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v16M12 4v16M18 4v16M4 8h16"/></svg>',
  raio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  foto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="M8 5l1.5-2h5L16 5"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.25.69-1.45 1.32-2 1.4-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.63-2.98-1.29-4.92-4.28-5.07-4.48-.15-.2-1.21-1.61-1.21-3.07S6.76 7.1 7.02 6.8c.26-.29.56-.36.75-.36l.54.01c.17.01.41-.7.64.49.24.58.81 2.03.88 2.18.07.15.12.32.02.52-.1.2-.15.32-.29.49l-.44.51c-.15.15-.3.31-.13.61.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.7.17-.2.73-.85.92-1.14.2-.29.39-.24.66-.15.27.1 1.71.81 2 .95.29.15.49.22.56.34.07.12.07.69-.18 1.38Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10.5c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10.3" r="3"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-3.4 8-9.6V5.3l-8-3-8 3v7.1C4 18.6 12 22 12 22Z"/><path d="m9 12 2 2 4-4"/></svg>',
  chave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.8 12.2 8-8M17 4l3 3M14.5 6.5l2.5 2.5"/></svg>',
  ferramenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9l-8.4 8.4a2.6 2.6 0 0 1-3.7-3.7Z"/><path d="m18 2 4 4-2.5 2.5-4-4Z"/></svg>',
  cartao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>',
  troca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  cima: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8Z"/></svg>',
  fb: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.24 10.44 22v-7.02H7.9v-2.92h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.92h-2.34V22C18.34 21.24 22 17.08 22 12.06Z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32Zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.02a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0Z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.8a5 5 0 0 1-1.4-3.3h-3.2v13a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V9.7a5.9 5.9 0 0 0-.78-.05 5.85 5.85 0 1 0 5.85 5.85V8.9a8.2 8.2 0 0 0 4.75 1.52V7.2a4.9 4.9 0 0 1-3.4-1.4Z"/></svg>',
};

/* ================================================================= partes */
const logoSVG = readFileSync(join(RAIZ, 'assets/img/logo.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>\s*/, '').trim();

/* Logótipos dos fabricantes, embutidos no HTML a partir de assets/img/marcas/.
   Embutidos e não em <img> de propósito: só assim é que o `currentColor` os
   deixa herdar a cor do CSS, e a faixa fica monocromática em vez de uma colecção
   de logos coloridos com qualidades diferentes.

   No backoffice a marca é TEXTO LIVRE — o cliente pode escrever "Citroën",
   "citroen" ou uma marca que nunca vimos. Daí a normalização, e daí haver
   sempre um recurso: quem não tiver ficheiro aparece com o nome em forma de
   letra. Ver assets/img/marcas/PROVENIENCIA.md. */
const chaveMarca = (nome) => String(nome)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') /* Citroën -> Citroen */
  .toLowerCase().replace(/[^a-z0-9]/g, '');         /* Mercedes-Benz -> mercedesbenz */

/* Guarda-se o viewBox e o interior de cada ficheiro em separado, para os
   logótipos irem uma única vez para a página, dentro de um sprite de
   <symbol>, e os cartões só os referenciarem com <use>. Sem isto o desenho do
   leão da Peugeot sozinho tem 10 KB e a faixa repete cada marca quatro vezes. */
const logosMarcas = (() => {
  const dir = join(RAIZ, 'assets/img/marcas');
  const mapa = {};
  if (!existsSync(dir)) return mapa;
  readdirSync(dir).filter((f) => f.endsWith('.svg')).forEach((f) => {
    const cru = readFileSync(join(dir, f), 'utf8').replace(/<\?xml[^>]*\?>\s*/, '').trim();
    const vb = /viewBox="([^"]+)"/.exec(cru);
    const dentro = cru.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
    if (!vb || !dentro) return;
    mapa[chaveMarca(f.replace(/\.svg$/, ''))] = { viewBox: vb[1], dentro };
  });
  return mapa;
})();

function logoMarca(nome) {
  return logosMarcas[chaveMarca(nome)] || null;
}

/* O sprite só leva as marcas que estão de facto em stock. */
function spriteMarcas(marcas) {
  const usados = marcas.map((m) => [chaveMarca(m), logoMarca(m)]).filter(([, l]) => l);
  if (!usados.length) return '';
  const vistos = new Set();
  const simbolos = usados.filter(([k]) => !vistos.has(k) && vistos.add(k))
    .map(([k, l]) => `<symbol id="m-${k}" viewBox="${l.viewBox}" fill="currentColor">${l.dentro}</symbol>`)
    .join('');
  return `<svg class="sprite-marcas" aria-hidden="true" focusable="false">${simbolos}</svg>`;
}

/* Primeira letra da marca, para o monograma de quem não tem logótipo. */
const inicial = (nome) => (String(nome).trim()[0] || '?').toUpperCase();

/* Tamanho de cada logótipo na faixa, normalizado por ÁREA e não por altura.
   Emblemas e wordmarks têm proporções muito diferentes — do 1:1 do Audi ao 5,8:1
   do «JAGUAR» — e nenhuma das duas normalizações óbvias funciona: dar-lhes a
   mesma ALTURA deixa os wordmarks enormes ao lado dos emblemas, e dar-lhes a
   mesma LARGURA esmaga-os a três ou quatro píxeis de altura.

   Área igual (a de um quadrado de 32 px) resolve: cada logótipo ocupa a mesma
   mancha visual, seja qual for a forma. Para uma razão r, w = √(A·r) e
   h = √(A/r). O tecto de largura evita que o mais largo de todos passe do dobro
   de um emblema, à custa de perder um pouco de área. */
const AREA_LOGO = 32 * 32;
const LARG_MAX_LOGO = 64;
function medidaLogo(viewBox) {
  const [, , w, h] = String(viewBox).split(/\s+/).map(Number);
  const r = (w && h) ? w / h : 1;
  let lw = Math.sqrt(AREA_LOGO * r);
  let lh = Math.sqrt(AREA_LOGO / r);
  if (lw > LARG_MAX_LOGO) { lw = LARG_MAX_LOGO; lh = LARG_MAX_LOGO / r; }
  return { w: Math.round(lw * 10) / 10, h: Math.round(lh * 10) / 10 };
}

/* Faixa de marcas que desfila sozinha, com o conteúdo a correr para a esquerda.
   O movimento é uma animação de CSS sobre a pista, não JavaScript: fica mais
   suave, não gasta um temporizador e o browser trava-a sozinho quando o
   separador está escondido. O único JavaScript é o botão de parar.

   O truque do ciclo sem costura: a pista leva a MESMA fila duas vezes e
   desloca-se exactamente -50%, ou seja a largura de uma fila. Quando a animação
   dá a volta, o que está no ecrã é indistinguível do início. */
function fitaMarcas(marcas) {
  if (!marcas.length) return '';
  /* A fila TEM de ser pelo menos tão larga como o ecrã. A pista leva duas filas
     e desloca-se a largura de uma; no instante do laço, o que fica à direita é a
     segunda fila, e se ela acabar antes da margem do ecrã abre-se um buraco.
     Medido: com 12 marcas a fila tinha 2050 px e num ecrã de 2400 px sobravam
     350 px vazios. Cada cartão ocupa ~171 px, logo 24 cartões dão ~4100 px e
     cobrem até 4K. Repetir custa pouco porque os logótipos vivem num sprite. */
  const POR_FILA = 24;
  const repeticoes = Math.max(1, Math.ceil(POR_FILA / marcas.length));

  /* Cada marca conta UMA vez para o leitor de ecrã e para o teclado. Todas as
     outras cópias — as repetições dentro da fila e a fila inteira do fim — são
     decoração: levam `aria-hidden` e saem da ordem de tabulação. Sem isto, com
     12 marcas e duas repetições, o teclado passava 48 vezes por 12 marcas. */
  /* Quantas voltas ficam à vista no telemóvel.
     ---------------------------------------------------------------------------
     A faixa anda sozinha também em ecrã táctil, e para o laço fechar sem buraco
     a fila tem de ser mais larga do que o ecrã — as duas filas são iguais e
     recua-se uma largura inteira ao passar dela.

     As quatro voltas que servem um monitor largo são de mais num telemóvel: a
     arrastar via-se a mesma marca quatro vezes seguidas. Mas cortar para uma só
     deixava a fila mais estreita do que um tablet ao alto. Nove cartões (uns
     1500 px) passam qualquer ecrã táctil com folga, e com sete marcas em stock
     dá duas voltas — repete-se de sete em sete, que já não salta à vista. */
  const VOLTAS_TACTIL = Math.max(1, Math.ceil(9 / marcas.length));

  const item = (m, deco, extra) => {
    const logo = logoMarca(m);
    /* Sem logótipo vai um monograma, não o nome escrito: o nome já está na
       linha de baixo, escrevê-lo duas vezes ficava redundante — e
       «MERCEDES-BENZ» partia em duas linhas e desalinhava o cartão todo. */
    /* A medida vai no próprio elemento, calculada pelo gerador: o CSS não sabe
       fazer raízes quadradas, e é isso que a normalização por área precisa. */
    const md = logo ? medidaLogo(logo.viewBox) : null;
    const marca = logo
      ? `<span class="marca-cartao__logo"><svg viewBox="${logo.viewBox}" width="${md.w}" height="${md.h}" aria-hidden="true" focusable="false"><use href="#m-${chaveMarca(m)}"/></svg></span>`
      : `<span class="marca-cartao__logo marca-cartao__logo--sigla" aria-hidden="true">${esc(inicial(m))}</span>`;
    return `<li class="fita__item${extra ? ' fita__item--extra' : ''}"${deco ? ' aria-hidden="true"' : ''}><a class="marca-cartao" href="${u('viaturas/?marca=' + encodeURIComponent(m))}"${deco ? ' tabindex="-1"' : ''}>
        ${marca}
        <span class="marca-cartao__nome">${esc(m)}</span>
      </a></li>`;
  };

  /* A primeira passagem da primeira fila é a única real. */
  const fila = (primeira) => {
    const itens = [];
    for (let i = 0; i < repeticoes; i++) {
      marcas.forEach((m) => itens.push(item(m, !(primeira && i === 0), i >= VOLTAS_TACTIL)));
    }
    return `<ul class="fita__fila">${itens.join('')}</ul>`;
  };
  const porFila = repeticoes * marcas.length;

  /* 3 s por cartão mantém a velocidade igual (~57 px/s) quer haja 5 marcas quer
     haja 30 — se a duração fosse fixa, poucas marcas passavam a correr. */
  return `${spriteMarcas(marcas)}<div class="fita" id="fita-marcas" style="--fita-dur:${porFila * 3}s">
    <div class="fita__pista">${fila(true)}${fila(false)}</div>
  </div>`;
}

function cabecalho(pag) {
  const links = [
    ['', 'Início'], ['viaturas/', 'Viaturas'], ['servicos/', 'Serviços'],
    ['sobre/', 'Sobre nós'], ['contactos/', 'Contactos'],
  ];
  /* Dois estados diferentes, e a distinção é semântica, não decorativa:
     `page` é ESTA página, `true` é "estás dentro desta secção". Sem o segundo,
     nas fichas de cada viatura não ficava nada marcado e perdia-se a noção de
     onde se está. Não se usa `page` nessas, porque seria falso — não são a
     página da listagem. O href vazio (Início) fica de fora da regra da secção,
     senão casava com tudo. */
  const nav = (cls) => links.map(([href, txt]) => {
    let activo = '';
    if (pag === href) activo = ' aria-current="page"';
    else if (href && pag.startsWith(href)) activo = ' aria-current="true"';
    const extra = cls === 'menu__link' ? ic.seta : '';
    return `<a class="${cls}" href="${u(href)}"${activo}>${txt}${extra}</a>`;
  }).join('');

  const c = def.contactos;
  /* Barra flutuante e arredondada, destacada das margens: logótipo à esquerda,
     navegação a seguir e o contacto à direita.

     Diferenças propositadas em relação ao stand que serviu de referência: lá o
     logótipo fica ao centro e só aparece depois de se descer na página, aqui
     está sempre à esquerda e encolhe ao descer; e o menu do telemóvel lá é uma
     gaveta de dois terços do ecrã, aqui ocupa o ecrã todo. Tudo a pedido.

     O número aparece à vista, e por isso vem com o custo da chamada colado a
     ele: onde há número tem de haver aviso (DL 59/2021). */
  return `<a class="saltar" href="#principal">Saltar para o conteúdo</a>
<header class="topo" id="topo">
  <div class="topo__barra">
    <a class="marca" href="${u('')}" aria-label="LR Motors — página inicial">${logoSVG}</a>
    <nav class="topo__nav" aria-label="Principal">${nav('topo__link')}</nav>
    <div class="topo__dir">
      <span class="topo__tel">${ic.tel}
        <span><a href="tel:+351${c.telefone_1}">${c.telefone_1_texto}</a>
        <small>(Chamada para a rede móvel nacional)</small></span></span>
      <a class="topo__zap" href="https://wa.me/${c.whatsapp}" rel="noopener" aria-label="WhatsApp">${ic.zap}</a>
    </div>
    <button class="hamburger" type="button" id="btn-menu" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu"><span></span></button>
  </div>
</header>
<div class="menu" id="menu" hidden>
  <div></div>
  <nav class="menu__corpo" aria-label="Menu">${nav('menu__link')}</nav>
  <div class="menu__pe">
    <p class="menu__rotulo">Fale connosco</p>
    <div class="menu__contactos">
      <a class="menu__acao" href="tel:+351${c.telefone_1}">${ic.tel}<span>Ligar</span></a>
      <a class="menu__acao" href="https://wa.me/${c.whatsapp}" rel="noopener">${ic.zap}<span>WhatsApp</span></a>
      <a class="menu__acao" href="${u('contactos/')}">${ic.pin}<span>Onde estamos</span></a>
    </div>
    <p class="nota-chamada">${c.telefone_1_texto} · (Chamada para a rede móvel nacional)</p>
  </div>
</div>`;
}

function rodape() {
  const s = def.stand, e = def.empresa;
  const rede = (href, svg, nome) => href
    ? `<a class="rodape__rede" href="${esc(href)}" target="_blank" rel="noopener me" aria-label="${nome}">${svg}</a>` : '';
  /* O custo da chamada tem de aparecer junto de CADA número, com a mesma
     visibilidade — art. 3.º do DL 59/2021. Vai entre parênteses. */
  const numero = (tel, texto) => `<li class="rodape__contacto">${ic.tel}
      <span><a href="tel:+351${tel}">${texto}</a>
      <small>(Chamada para a rede móvel nacional)</small></span></li>`;
  return `<footer class="rodape">
  <div class="envolve">
    <div class="rodape__grelha">
      <div>
        <div class="rodape__marca">${logoSVG}</div>
        <p class="rodape__texto">${esc(def.textos.reclamo)}. Stand em Vila Verde, Braga, com oficina própria.</p>
        <div class="rodape__redes">
          ${rede(def.redes.instagram, ic.ig, 'Instagram')}
          ${rede(def.redes.facebook, ic.fb, 'Facebook')}
          ${rede(def.redes.tiktok, ic.tiktok, 'TikTok')}
          <a class="rodape__rede" href="https://wa.me/${def.contactos.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic.zap}</a>
        </div>
      </div>
      <div>
        <h3>Navegar</h3>
        <ul class="rodape__lista">
          <li><a href="${u('viaturas/')}">Todas as viaturas</a></li>
          <!-- Os tipos saem do stock e não estão escritos à mão. Estavam:
               «Carros» e «Off-road» fixos, e ao passar o stock para os anúncios
               reais — onze carros e nenhum todo-o-terreno — o link de off-road
               passou a levar a uma lista vazia. Um link do rodapé que não
               devolve nada é pior do que não existir. -->
          ${tiposEmStock.map((t) => `<li><a href="${u('viaturas/?tipo=' + encodeURIComponent(t.valor))}">${esc(t.rotulo)}</a></li>`).join('\n          ')}
          <li><a href="${u('servicos/')}">Serviços</a></li>
          <li><a href="${u('sobre/')}">Sobre nós</a></li>
        </ul>
      </div>
      <div>
        <h3>Contactos</h3>
        <ul class="rodape__lista rodape__lista--icones">
          ${numero(def.contactos.telefone_1, def.contactos.telefone_1_texto)}
          ${numero(def.contactos.telefone_2, def.contactos.telefone_2_texto)}
          <!-- Sem a linha do «Enviar mensagem»: o WhatsApp já está no ícone das
               redes, logo abaixo, e a lista fica só com os números. -->
        </ul>
      </div>
      <div>
        <h3>Onde estamos</h3>
        <ul class="rodape__lista rodape__lista--icones">
          <li class="rodape__contacto">${ic.pin}
            <span><a href="${esc(s.mapa)}" target="_blank" rel="noopener">${esc(s.morada)}<br>${esc(s.codigo_postal)} ${esc(s.localidade)}, ${esc(s.distrito)}</a></span></li>
          <li class="rodape__contacto">${ic.relogio}
            <span><ul class="horario">
              ${def.horario.map((h) => `<li><span>${esc(h.dias)}</span><span>${esc(h.horas)}</span></li>`).join('')}
            </ul></span></li>
        </ul>
      </div>
    </div>

    <div class="rodape__legal">
      <p class="rodape__copy">&copy; ${new Date().getFullYear()} ${esc(e.nome_comercial)}</p>
      <ul class="rodape__links">
        <li><a href="${u('privacidade/')}">Política de privacidade</a></li>
        <li><a href="${u('termos/')}">Termos e condições</a></li>
        <li><a href="${u('garantia/')}">Garantia</a></li>
        <li><a href="https://www.livroreclamacoes.pt/inicio" target="_blank" rel="noopener">Livro de Reclamações</a></li>
        <li><a href="${u('resolucao-de-litigios/')}">Resolução de litígios</a></li>
        <!-- A barra só aparece uma vez. Sem isto, quem recusasse o mapa não tinha
             por onde voltar atrás, e a política de privacidade promete que se pode
             mudar de ideias. É um <button> e não um <a> porque não navega para
             lado nenhum — abre o painel aqui mesmo. -->
        <li><button class="rodape__botao" type="button" data-cc-abrir>Preferências</button></li>
        <!-- Entrada do backoffice. Fica à vista porque é onde o pessoal do stand
             a vai procurar; quem não tiver acesso não passa da autenticação do
             Pages CMS. Leva rel=nofollow para os motores de busca não a
             indexarem como se fosse conteúdo do site. -->
        <li><a class="rodape__gestao" href="https://app.pagescms.org/${GH_REPO}/main/collection/viaturas"
               target="_blank" rel="noopener nofollow">Gestão</a></li>
      </ul>
    </div>
  </div>
</footer>`;
}

/* --------------------------------------------------------------- esqueleto */
function pagina({ pag = '', titulo: t, descricao, corpo, jsonld = [], og, classe = '' }) {
  const url = abs(pag);
  /* Sem `og` próprio, a partilha leva o cartão com o logótipo — branco sobre o
     navy da marca, como a tabuleta do stand. As páginas de viatura passam a
     fotografia do carro, que é o que faz sentido quando se partilha um anúncio.

     O logótipo cabe dentro do quadrado central de 630×630 de propósito: o
     WhatsApp mostra ora a pré-visualização larga, ora uma miniatura quadrada
     cortada aos lados, e assim sobrevive às duas. */
  const imagem = og ?? abs('assets/img/og.jpg');
  /* Largura e altura declaradas porque o WhatsApp precisa delas para decidir
     mostrar a pré-visualização GRANDE. Sem elas arrisca-se a miniatura pequena
     ao lado do texto, que é onde o logótipo se perde. São as do og.jpg; quando
     a imagem é a de uma viatura, as fotografias são todas 1600×1200. */
  const [larguraOg, alturaOg] = [1200, 630];
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LR Motors">
<meta property="og:locale" content="pt_PT">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(imagem)}">
<meta property="og:image:width" content="${larguraOg}">
<meta property="og:image:height" content="${alturaOg}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${esc(og ? t : 'LR Motors — carros, motos e off-road, em Vila Verde')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#004AAD">
<link rel="icon" href="${u('assets/img/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${u('assets/img/apple-touch-icon.png')}">
<link rel="stylesheet" href="${versao('assets/css/estilo.css')}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body class="${classe}">
${cabecalho(pag)}
<main id="principal">
${corpo}
</main>
${rodape()}

<!-- Voltar ao topo. Só aparece depois de se ter descido um ecrã inteiro — antes
     disso não serve para nada e só ocupa canto. Sai do caminho enquanto o aviso
     de cookies estiver em baixo, para não empilhar dois flutuantes no mesmo
     sítio. -->
<button class="subir" id="subir" type="button" aria-label="Voltar ao topo da página">${ic.cima}</button>

<!-- Aviso de primeira visita.
     ISTO ERA MAIOR E FOI ENCOLHIDO DE PROPÓSITO. Tinha três botões, um painel
     modal com dois interruptores, uma caixa de «mais informações» e um botão de
     fechar — maquinaria para uma decisão que é binária: carregar o mapa do
     Google, ou não. Não há mais nada para consentir, porque o site não instala
     cookie nenhum: não tem analítica, publicidade, tipos de letra externos nem
     embeds além do mapa.

     Ficaram dois botões e nada mais. Quem quiser mudar de ideias carrega em
     «Preferências» no rodapé, que faz reaparecer esta mesma barra — em vez de
     abrir um segundo sítio, com outro desenho, para dizer a mesma coisa. -->
<div class="cc-barra" id="cc-barra" role="dialog" aria-labelledby="cc-t" aria-describedby="cc-d" hidden>
  <div class="cc-barra__corpo">
    <div class="cc-barra__texto">
      <p class="cc-barra__titulo" id="cc-t">Utilizamos cookies</p>
      <p class="cc-barra__desc" id="cc-d">Usamos cookies para melhorar a sua experiência.</p>
    </div>
    <div class="cc-barra__acoes">
      <button class="cc-btn cc-btn--principal" type="button" id="cc-aceitar">Aceitar</button>
      <button class="cc-btn" type="button" id="cc-recusar">Recusar</button>
    </div>
  </div>
</div>

<script src="${versao('assets/js/site.js')}" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------ dados JSON-LD */
const standLD = {
  '@context': 'https://schema.org',
  '@type': 'AutoDealer',
  '@id': abs('#stand'),
  name: def.empresa.nome_comercial,
  /* As outras formas por que o nome é escrito e procurado. «LRMotors» numa
     palavra é a que aparece no Instagram e a que muita gente escreve na busca;
     sem isto o Google não tem como saber que é a mesma entidade. */
  alternateName: ['LRMotors', 'LR Motors Vila Verde', def.empresa.denominacao_social],
  legalName: def.empresa.denominacao_social,
  vatID: 'PT' + def.empresa.nif,
  url: abs(''),
  image: abs('assets/img/stand-960.webp'),
  logo: abs('assets/img/logo.svg'),
  telephone: '+351' + def.contactos.telefone_1,
  address: {
    '@type': 'PostalAddress',
    streetAddress: def.stand.morada,
    postalCode: def.stand.codigo_postal,
    addressLocality: def.stand.localidade,
    addressRegion: def.stand.distrito,
    addressCountry: 'PT',
  },
  geo: { '@type': 'GeoCoordinates', latitude: def.stand.latitude, longitude: def.stand.longitude },
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '19:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '13:00' },
  ],
  sameAs: [def.redes.instagram, def.redes.facebook, def.redes.tiktok].filter(Boolean),
  department: {
    '@type': 'AutoRepair',
    name: 'Oficina LR Motors',
    telephone: '+351' + def.contactos.telefone_1,
    address: {
      '@type': 'PostalAddress',
      streetAddress: def.stand.morada, postalCode: def.stand.codigo_postal,
      addressLocality: def.stand.localidade, addressCountry: 'PT',
    },
  },
};

/* Migalhas para o Google.
   ---------------------------------------------------------------------------
   O `item` é OBRIGATÓRIO em todas as migalhas menos a última — é o que a
   Search Console reclamou: «Campo "item" em falta (em "itemListElement")».

   A causa era `it.href ? …`. A página inicial é passada com `href: ''`, que em
   JavaScript é FALSO, e por isso a primeira migalha — «Início», a que existe em
   todas as páginas do site — saía sem `item`. Um endereço vazio é um endereço
   válido: é a raiz. Testa-se a PRESENÇA do campo e não se ele é verdadeiro.

   A última fica sem `item` de propósito: é a página onde já se está, e o Google
   pede que se omita. */
const migalhasLD = (itens) => {
  itens.forEach((it, i) => {
    if (i < itens.length - 1 && it.href == null) {
      console.warn(`  !! migalha "${it.nome}" sem href e não é a última — o Google recusa`);
    }
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.nome,
      ...(it.href != null ? { item: abs(it.href) } : {}),
    })),
  };
};

/* ============================================================== componentes */
function cartao(v, { prioridade = false } = {}) {
  const f = fotos(v)[0];
  const img = f
    ? `<img src="${f.srcCartao}" srcset="${f.srcsetCartao}"
         sizes="(max-width: 620px) 100vw, (max-width: 1000px) 46vw, 30vw"
         alt="${esc(tituloLongo(v))}" width="960" height="720"
         ${prioridade ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : '<div style="display:grid;place-items:center;height:100%;color:var(--tinta-3)">Sem foto</div>';

  const selos = [];
  /* Uma etiqueta de estado, nunca duas: os quatro estados excluem-se. «À venda»
     não leva etiqueta nenhuma — é o normal, e uma etiqueta em todos os cartões
     não distingue nada. */
  const est = estadoDe(v);
  if (est !== 'disponivel') {
    selos.push(`<span class="selo selo--${est}">${ESTADOS[est].rotulo}</span>`);
  }
  /* Sem etiqueta «Destaque». O campo continua a existir e é ele que escolhe as
     viaturas do carrossel lá em cima — mas dizer no cartão que a viatura é um
     destaque não informa quem compra de nada, e ficava a competir com as
     etiquetas que informam: reservado, vendido, eléctrico. */
  if (/Elétrico/i.test(v.combustivel)) selos.push(`<span class="selo selo--eletrico">100% elétrico</span>`);

  const spec = (icone, txt) => txt ? `<span class="cartao__spec">${icone}${esc(txt)}</span>` : '';
  const nf = fotos(v).length;

  /* Uma vendida não abre nada: não tem página de detalhe (ver a escrita das
     páginas, lá em baixo) e por isso o cartão não é um link. Fica visível na
     secção «Já vendidas» — o cliente quer o histórico à vista — mas deixa de
     prometer um clique que não leva a lado nenhum.

     O `<a>` era `display: contents`, ou seja não desenhava caixa nenhuma; tirá-lo
     não mexe um pixel no desenho. O que TEM de sair com ele é o resto da
     promessa: o cursor de mão e o hover que levanta o cartão (esse sai no CSS,
     em `.cartao--vendido`). Um cartão que se levanta ao rato e não abre nada é
     pior do que um cartão parado.

     E sai o RODAPÉ inteiro — preço e «Ver →». Chegou a dizer «Vendida» no lugar
     do preço, mas a etiqueta VENDIDO já está por cima da fotografia: era a mesma
     informação duas vezes no mesmo cartão, uma delas debaixo de uma risca de
     separação que não separava nada. Sem rodapé, o cartão acaba na ficha
     técnica, que é o que resta de útil num carro que já saiu. */
  const corpo = `    <div class="cartao__foto">
      ${img}
      ${selos.length ? `<div class="cartao__selos">${selos.join('')}</div>` : ''}
      ${nf > 1 && !estaVendida(v) ? `<span class="cartao__nfotos">${ic.foto}${nf}</span>` : ''}
    </div>
    <div class="cartao__corpo">
      <h3 class="cartao__titulo">${esc(titulo(v))}${v.versao ? `<span class="cartao__versao">${esc(v.versao)}</span>` : ''}</h3>
      <div class="cartao__specs">
        ${spec(ic.cal, v.ano)}
        ${spec(ic.km, v.km != null ? nKm(v.km) : '')}
        ${spec(ic.gota, v.combustivel)}
        ${spec(ic.caixa, v.caixa)}
        ${spec(ic.raio, v.potencia ? v.potencia + ' cv' : '')}
      </div>
      ${estaVendida(v) ? '' : `<div class="cartao__pe">
        <span class="cartao__preco${temPreco(v) ? '' : ' cartao__preco--consulta'}">${esc(precoTexto(v))}</span>
        <span class="cartao__ver">Ver ${ic.seta}</span>
      </div>`}
    </div>`;

  /* Um `id` só nas vendidas, e serve uma coisa concreta: é para aqui que o
     reencaminhamento do endereço antigo aponta. Sem ele, quem clicasse num link
     antigo de um carro caía no cabeçalho «Já vendidas» e tinha de o procurar
     numa lista que só cresce. Com ele, cai em cima do carro dele.

     O `tabindex="-1"` não põe o cartão na ordem de tabulação (é o que o -1
     faz): serve para o browser poder pôr o FOCO aqui quando a página abre no
     fragmento. Sem isso, quem chega por um link antigo com leitor de ecrã ou
     teclado aterra com o foco no princípio do documento, e a página parece não
     ter ido a lado nenhum. */
  return `<article class="cartao cartao--${v.estado}"${estaVendida(v) ? ` id="v-${esc(v.slug)}" tabindex="-1"` : ''}
    data-tipo="${esc(v.tipo)}" data-marca="${esc(v.marca)}" data-combustivel="${esc(v.combustivel)}"
    data-caixa="${esc(v.caixa)}" data-preco="${v.preco ?? ''}" data-ano="${v.ano ?? ''}"
    data-km="${v.km ?? ''}" data-estado="${esc(v.estado)}"
    data-procura="${esc([tituloLongo(v), v.carrocaria, v.combustivel].filter(Boolean).join(' ').toLowerCase())}">
${estaVendida(v) ? corpo : `  <a href="${u('viaturas/' + v.slug + '/')}" style="display:contents" aria-label="Ver ${esc(tituloLongo(v))}">
${corpo}
  </a>`}
</article>`;
}

const opcoes = (vals, rot) =>
  `<option value="">${rot}</option>` + [...new Set(vals.filter(Boolean))].sort()
    .map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');

/* --------------------------------------------------------------- vitrine --- */
/* A secção dos destaques. O que a manda no desenho não é gosto, é o material:
   das seis viaturas em destaque, QUATRO só têm uma fotografia. Qualquer solução
   que dependa de várias fotos por carro — tiras de miniaturas, trocar a foto ao
   passar o rato — apareceria quebrada na maioria delas.

   Daí a hierarquia: a primeira viatura leva um painel grande, onde uma só foto
   tem espaço para respirar, e as outras ficam numa lista compacta ao lado. Isso
   dá à secção uma leitura editorial em vez de uma fila de cartões todos iguais,
   e resolve o problema de ter pouca matéria-prima por carro.

   O fundo é escuro de propósito: destaca as fotografias, separa esta secção do
   stock completo que vem em branco mais abaixo, e ecoa o hero.

   Aguenta qualquer número de destaques, porque é o cliente que os escolhe no
   backoffice: com um, o painel ocupa tudo; com muitos, a lista rola. */
function vitrine(lista) {
  if (!lista.length) return '';

  /* A ordem dentro do cartão veio da secção «Viaturas em destaque» do SoDrive,
     medida no browser e não copiada de olho: nome e preço na mesma linha de base
     no TOPO, versão abaixo em tom apagado, uma fila de etiquetas de confiança, e
     só depois a fotografia. As especificações ficam por baixo, numa grelha de
     três colunas por duas linhas com o valor em cima e a etiqueta pequena por
     baixo (eles: 06/2023 sobre «Mês/Ano», 36 900 km sobre «Quilómetros»).

     Isto resolve de vez o problema que o cliente apontou — texto sobreposto
     tapava o carro. O cabeçalho ocupa a superfície do cartão, não a foto, e a
     foto fica completamente limpa.

     O que NÃO se trouxe de lá: a pontuação de «Procura elevada» (94/100). É uma
     métrica inventada e não temos dado nenhum que a sustente.

     A grelha leva os SEIS primeiros factos que a viatura tiver, de uma lista
     ordenada por interesse para quem compra. Assim nunca fica um vão vazio numa
     viatura a que falte a potência ou a caixa — e falta numa das catorze.

     A fila de etiquetas sai SEMPRE, mesmo vazia, e o CSS reserva-lhe a altura.
     Sem isso, os cartões sem garantia nem motor eléctrico subiam a fotografia e
     a grelha, e as filas de cada cartão deixavam de bater umas com as outras —
     visto no ecrã, com o Patrol GR e o 3008 desalinhados dos vizinhos. O SoDrive
     não tem este problema porque inventa etiquetas para todos os carros.

     A proporção fica em 4:3 de propósito: as fotos originais são ~4:3 e um corte
     para 16:9 decapita os carros mal enquadrados. */
  const cartao = (v, i) => {
    const f = fotos(v)[0];
    const nf = fotos(v).length;

    const g = String(v.garantia || '').trim();
    const garantia = !g ? '' : /^\d+$/.test(g) ? `Garantia ${g} meses`
      : (/garantia/i.test(g) ? g : `Garantia ${g}`);

    const selos = [];
    const est = estadoDe(v);
    if (est !== 'disponivel') {
      selos.push(`<span class="vit-selo vit-selo--${est}">${ESTADOS[est].rotulo}</span>`);
    }
    if (/el[éeê]ctric|el[éeê]tric/i.test(v.combustivel || '')) selos.push('<span class="vit-selo vit-selo--eletrico">100% elétrico</span>');
    if (garantia) selos.push(`<span class="vit-selo vit-selo--garantia">${esc(garantia)}</span>`);
    if (v.iva_dedutivel) selos.push('<span class="vit-selo vit-selo--iva">IVA dedutível</span>');

    const specs = [
      ['Ano', v.ano],
      ['Quilómetros', v.km != null ? nKm(v.km) : null],
      ['Combustível', v.combustivel],
      ['Transmissão', v.caixa],
      ['Potência', v.potencia ? v.potencia + ' cv' : null],
      ['Carroçaria', v.carrocaria],
      ['Lugares', v.lugares],
      ['Cor', v.cor],
      /* QUATRO e não seis. Com a pista contida na coluna de conteúdo o cartão
         passou a 328 px, e a três colunas sobravam 91 px por célula: «Todo-o-
         terreno» e «Híbrido Plug-in» quebravam em duas linhas, empurravam a
         segunda fila para baixo e desalinhavam os cartões uns dos outros.
         Quatro factos em 2×2 cabem inteiros — e são os que se procuram
         primeiro. Os outros estão todos na página da viatura. */
    ].filter(p => p[1] != null && String(p[1]).trim() !== '').slice(0, 4);

    /* `<div>` a envolver cada par dentro do `<dl>` é HTML válido e é o que
       permite pôr o par todo numa célula da grelha. A etiqueta vem primeiro no
       código — o leitor de ecrã diz «Ano, 2018» — e o CSS inverte só a ordem
       visual, para o valor ficar em cima. */
    const grelha = specs.map(([k, val]) =>
      `<div><dt>${esc(k)}</dt><dd>${esc(String(val))}</dd></div>`).join('');

    return `<li class="vit-item"><article class="vit-cartao">
      <a class="vit-cartao__link" href="${u('viaturas/' + v.slug + '/')}">
        <div class="vit-cartao__cabeca">
          <h3 class="vit-cartao__linha">
            <span class="vit-cartao__nome">${esc([v.marca, v.modelo].filter(Boolean).join(' '))}</span>
            <span class="vit-cartao__preco">${precoTexto(v)}</span>
          </h3>
          <p class="vit-cartao__versao">${esc(v.versao || v.carrocaria || '')}</p>
          <p class="vit-cartao__selos">${selos.join('')}</p>
        </div>
        <div class="vit-cartao__foto">
          ${f ? `<img src="${f.src}" srcset="${f.srcset}" sizes="(max-width: 700px) 78vw, 400px"
               alt="${esc(tituloLongo(v))}" width="1600" height="1200"
               ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
            : '<div class="vit-cartao__semfoto">Sem fotografia</div>'}
          ${nf > 1 ? `<span class="vit-cartao__nfotos">${ic.foto}${nf}</span>` : ''}
        </div>
        <dl class="vit-cartao__grelha">${grelha}</dl>
      </a>
    </article></li>`;
  };

  /* As setas só aparecem se houver mais de um cartão, e o JS esconde-as se a
     pista couber toda no ecrã. Os pontos são construídos pelo JS a partir dos
     cartões (o SoDrive também os tem, numerados): sem JS a pista arrasta-se
     igual, por isso não faz sentido deixar marcação morta no HTML. */
  const setas = lista.length > 1 ? `<div class="vitrine__setas" id="vitrine-setas">
      <button class="vitrine__seta" type="button" data-passo="-1" aria-label="Viaturas anteriores">${ic.esq}</button>
      <button class="vitrine__seta" type="button" data-passo="1" aria-label="Viaturas seguintes">${ic.dir}</button>
    </div>` : '';

  return `<section class="vitrine" aria-labelledby="vitrine-t">
  <div class="envolve vitrine__topo">
    <div>
      <p class="sobretitulo">A nossa selecção</p>
      <h2 class="h-secao" id="vitrine-t">Viaturas em destaque</h2>
    </div>
    ${setas}
  </div>
  <!-- Sem tabindex na pista. Tinha-o para se poder percorrer com as setas do
       teclado, mas um contentor focável de bordo a bordo desenha o anel de foco
       de um lado ao outro do ecrã, e lia-se como uma moldura azul à volta da
       secção. O Chrome acende-o mesmo depois de um clique de rato, logo que se
       toque numa tecla — foi assim que apareceu. Não se perde acesso: cada
       cartão é um link, o Tab arrasta a pista atrás do foco, e as setas e os
       pontos fazem o resto. -->
  <ol class="vitrine__pista" id="vitrine-pista"
      aria-label="Viaturas em destaque — arraste para o lado para ver mais">
    ${lista.map(cartao).join('')}
  </ol>
  <div class="envolve"><div class="vitrine__pontos" id="vitrine-pontos" hidden></div></div>
</section>`;
}

/* =================================================================== páginas */
function paginaInicial() {
  const destaque = aVenda.filter((v) => v.destaque);
  const lista = destaque.length ? destaque : aVenda.slice(0, 8);
  const marcas = aVenda.map((v) => v.marca);

  /* A grelha do stock deixa de fora o que o carrossel já mostrou logo acima.
     Antes repetia-se: das oito primeiras por ordem, quatro eram destaques e
     apareciam duas vezes no mesmo ecrã. Compara-se com a lista REAL do
     carrossel e não com o campo `destaque`, porque quando não há nenhum
     destaque marcado o carrossel mostra as oito primeiras — e aí a comparação
     pelo campo não excluía nada e a repetição voltava inteira.

     Se o cliente marcar quase tudo como destaque, sobra pouco para esta grelha;
     abaixo de quatro viaturas volta a mostrar o stock todo, que é melhor do que
     uma secção com dois carros perdidos. */
  const naVitrine = new Set(lista.map((v) => v.slug));
  const restantes = aVenda.filter((v) => !naVitrine.has(v.slug));
  /* Seis e não oito: a grelha da página tem 1160 px úteis e colunas de 288 no
     mínimo, o que dá TRÊS colunas — medido, não suposto. Com oito, a última fila
     ficava com dois cartões e um vão à direita. Seis fecha as filas certinhas a
     três, a duas e a uma coluna, que são as três larguras que a grelha assume. */
  const baseStock = restantes.length >= 4 ? restantes : aVenda;
  const stock = baseStock.slice(0, 6);
  /* O botão aparece sempre que a grelha não estiver a mostrar o stock todo —
     seja por causa do limite, seja por causa das que foram para o carrossel. */
  const haMaisStock = stock.length < aVenda.length;

  /* Uma marca por cartão, com a contagem — dá para escolher pela marca sem
     abrir os filtros, que é como muita gente começa a procurar carro. */
  const contaMarcas = {};
  aVenda.forEach((v) => { contaMarcas[v.marca] = (contaMarcas[v.marca] || 0) + 1; });
  const marcasOrdenadas = Object.keys(contaMarcas).sort((a, b) =>
    contaMarcas[b] - contaMarcas[a] || a.localeCompare(b, 'pt'));

  const corpo = `
<section class="hero hero--curto">
  <div class="hero__fundo">
    <img src="${u('assets/img/hero-2000.webp')}" srcset="${u('assets/img/hero-1200.webp')} 1200w, ${u('assets/img/hero-2000.webp')} 2000w"
         sizes="100vw" alt="" width="2000" height="1000" fetchpriority="high" decoding="async">
  </div>
  <div class="hero__corpo">
    <!-- A linha de cima leva o NOME e o sítio. É a única forma de o nome da
         marca aparecer como texto visível na página inicial: o logótipo é um
         SVG e o h1 passou a ser uma frase sem marca. Para quem procura «lr
         motors», isto ajuda; para quem chega, diz logo onde é o stand.

         Sai das definições e não escrito à mão, para não divergir se o nome ou
         a localidade mudarem. O campo reclamo fica como estava: alimenta também
         o texto do rodapé, e lá faz sentido a frase e não o nome.

         (Sem crases neste comentário. Ele vive dentro de um template literal, e
         uma crase aqui abre um literal aninhado — já parti o gerador três vezes
         com isto.) -->
    <p class="sobretitulo sobretitulo--claro">${esc(def.empresa.nome_comercial)} · ${esc(def.stand.localidade)}</p>
    <h1 class="hero__titulo">${esc(def.textos.hero_titulo)}</h1>
    <p class="hero__texto">${esc(def.textos.hero_texto)}</p>
  </div>
</section>

<!-- No telemóvel os quatro campos empilhados ocupavam meio ecrã antes de se ver
     um único carro, por isso dobra-se.

     Começou por ser um <details> e teve de deixar de ser. Com o <details>, o
     estado «fechado» vive no elemento, e acima dos 620 px o resumo tem
     display none — quem fechasse no telemóvel e alargasse a janela ficava com
     um painel vazio de 34 px e nada em que carregar. Tentei remendar com o
     evento resize, com ResizeObserver e com matchMedia, e a lição foi outra: se a
     correcção depende de um evento disparar, há sempre um caso em que não
     dispara.

     Agora quem manda é o CSS. A regra que esconde os campos só existe dentro da
     media query do telemóvel, portanto acima dos 620 px os campos estão SEMPRE
     visíveis, não interessa em que estado o JavaScript os deixou — o caso
     partido deixou de ser possível de exprimir. E o estado por omissão é
     ABERTO: sem JavaScript o painel fica como sempre esteve. -->
<div class="procura-rapida">
  <form action="${u('viaturas/')}" method="get">
    <div class="procura-rapida__caixa" id="procura-rapida">
      <button class="procura-rapida__resumo" type="button" id="procura-alternar"
              aria-expanded="true" aria-controls="procura-campos">
        <span class="procura-rapida__rotulo">${ic.filtro} Procurar viatura</span>
        ${ic.dir}
      </button>
      <div class="procura-rapida__campos" id="procura-campos">
        <div class="campo"><label class="campo__rot" for="q-tipo">Tipo</label>
          <select id="q-tipo" name="tipo">${opcoes(aVenda.map((v) => v.tipo), 'Todos')}</select></div>
        <div class="campo"><label class="campo__rot" for="q-marca">Marca</label>
          <select id="q-marca" name="marca">${opcoes(marcas, 'Todas')}</select></div>
        <div class="campo"><label class="campo__rot" for="q-comb">Combustível</label>
          <select id="q-comb" name="combustivel">${opcoes(aVenda.map((v) => v.combustivel), 'Todos')}</select></div>
        <div class="campo"><label class="campo__rot" for="q-max">Preço até</label>
          <select id="q-max" name="precoMax">
            <option value="">Sem limite</option>
            ${[10000, 15000, 20000, 25000, 30000, 40000, 60000].map((pr) => `<option value="${pr}">${nEuro(pr)}</option>`).join('')}
          </select></div>
        <div class="campo"><span class="campo__rot" aria-hidden="true">&nbsp;</span>
          <button class="btn btn--principal" type="submit">Procurar</button></div>
      </div>
    </div>
  </form>
</div>

${vitrine(lista)}

<section class="secao secao--tenue">
  <div class="envolve">
    <p class="sobretitulo">As nossas marcas</p>
    <h2 class="h-secao" style="margin-bottom:1.4rem">Escolha pela marca</h2>
  </div>
  ${fitaMarcas(marcasOrdenadas)}
</section>

<section class="secao" id="stock">
  <div class="envolve">
    <div class="secao__topo">
      <div>
        <p class="sobretitulo">Em stock</p>
        <h2 class="h-secao">As viaturas que temos agora</h2>
      </div>
      <a class="btn btn--contorno" href="${u('viaturas/')}">Procurar com filtros ${ic.seta}</a>
    </div>
    <div class="grelha">${stock.map((v) => cartao(v)).join('')}</div>
    <!-- Havia aqui um segundo botão que ia para a mesma página que o de cima e
         dizia praticamente o mesmo. Ficou um só, e agora tem uma função
         diferente da do canto: aquele é filtrar, este é ver o resto. -->
    ${haMaisStock ? `<div class="secao__mais">
      <a class="btn btn--principal" href="${u('viaturas/')}">Ver mais viaturas ${ic.seta}</a>
    </div>` : ''}
  </div>
</section>

<section class="secao secao--escura">
  <div class="envolve">
    <p class="sobretitulo sobretitulo--claro">Porquê a LR Motors</p>
    <h2 class="h-secao h-secao--claro" style="margin-bottom:2rem">${esc(def.textos.sobre_titulo)}</h2>
    <div class="cartas">
      <div class="carta carta--escura"><div class="carta__icone">${ic.escudo}</div>
        <h3>Garantia incluída</h3><p>Em todas as viaturas, com o prazo escrito no contrato.</p></div>
      <div class="carta carta--escura"><div class="carta__icone">${ic.ferramenta}</div>
        <h3>Oficina própria</h3><p>Mecânica em casa. Sai revista e pronta a andar.</p></div>
      <div class="carta carta--escura"><div class="carta__icone">${ic.troca}</div>
        <h3>Retoma</h3><p>Avaliamos o seu carro e abatemos no preço.</p></div>
      <div class="carta carta--escura"><div class="carta__icone">${ic.cartao}</div>
        <h3>Financiamento</h3><p>Simulação sem compromisso, resposta no próprio dia.</p></div>
    </div>
  </div>
</section>

<!-- Um painel só, com o mapa encostado ao bordo em vez de duas caixas lado a
     lado com um vale no meio. O texto encolheu ao osso: quem chega aqui quer a
     morada, o horário de hoje e um caminho — não um parágrafo. -->
<section class="secao secao--tenue" id="visitar">
  <div class="envolve">
    <div class="visita">
      <div class="visita__info">
        <p class="sobretitulo">Venha ver ao vivo</p>
        <h2 class="h-secao">Estamos em Vila Verde</h2>
        <p class="visita__lead">Passe pelo stand sem marcação.</p>
        <ul class="visita__factos">
          <li>${ic.pin}<span><b>${esc(def.stand.morada)}</b><br>${esc(def.stand.codigo_postal)} ${esc(def.stand.localidade)}, ${esc(def.stand.distrito)}</span></li>
          <li>${ic.tel}<span><b><a href="tel:+351${def.contactos.telefone_1}">${def.contactos.telefone_1_texto}</a></b>
            <small>(Chamada para a rede móvel nacional)</small></span></li>
        </ul>
        <!-- O dia de hoje é marcado pelo JS, não pelo gerador: o site é
             estático e o HTML de segunda-feira ficaria a dizer «hoje» no
             sábado. Sem JS, a lista aparece inteira e certa na mesma. -->
        <ul class="horario horario--visita" id="horario-inicio">
          ${def.horario.map((h) => `<li data-dias="${esc(h.dias)}"><span>${esc(h.dias)}</span><span>${esc(h.horas)}</span></li>`).join('')}
        </ul>
        ${notaVisita()}
        <div class="visita__acoes">
          <!-- Os mesmos dois botões da página de Contactos, pela mesma ordem. -->
          <a class="btn btn--principal" href="tel:+351${def.contactos.telefone_1}">${ic.tel} Ligar agora</a>
          <a class="btn btn--contorno" href="https://www.google.com/maps/dir/?api=1&amp;destination=${def.stand.latitude},${def.stand.longitude}"
             target="_blank" rel="noopener">${ic.pin} Como chegar</a>
        </div>
      </div>
      <div class="visita__mapa">${mapa()}</div>
    </div>
  </div>
</section>`;

  return pagina({
    pag: '',
    titulo: 'LR Motors — Carros usados em Vila Verde, Braga | Carros, motos e off-road',
    descricao: `Stand de automóveis em Vila Verde, Braga. ${aVenda.length} viaturas usadas com garantia, retoma e financiamento. Oficina de mecânica própria.`,
    corpo,
    jsonld: [standLD, {
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: def.empresa.nome_comercial, alternateName: 'LRMotors', url: abs(''),
      inLanguage: 'pt-PT', publisher: { '@id': abs('#stand') },
    }, {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: 'Viaturas em stock na LR Motors', numberOfItems: aVenda.length,
      itemListElement: aVenda.map((v, i) => ({
        '@type': 'ListItem', position: i + 1,
        url: abs('viaturas/' + v.slug + '/'), name: tituloLongo(v),
      })),
    }],
  });
}

/* O mapa é o mesmo componente na inicial e nos contactos. Só carrega depois de
   consentimento: o embed do Google instala cookies antes de qualquer
   interacção, e o consentimento tem de ser prévio (art. 5.º da Lei 41/2004). */
function mapa() {
  const s = def.stand;
  const q = encodeURIComponent(`${s.morada}, ${s.codigo_postal} ${s.localidade}`);
  return `<div class="mapa" id="mapa" data-mapa="https://www.google.com/maps?q=${q}&output=embed">
    <!-- O texto diz agora que isto é o mapa E porque é que aparece. Motivo: com
         o aviso de cookies a falar só de cookies, quem carrega em «Apenas
         necessários» dá a escolha por feita e depois estranha o mapa a pedir
         outra vez. O mapa é de terceiros, portanto «apenas necessários» tem
         mesmo de o deixar de fora — o que faltava era dizê-lo aqui. -->
    <div class="mapa__consentimento" id="mapa-consentimento">
      ${ic.pin}
      <p><b>Mapa do Google</b><br>
         Fica por carregar até o autorizar, porque vem dos servidores do Google e pode
         instalar cookies. Se escolheu «Apenas necessários» no aviso de cookies, é por isso.</p>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center">
        <button class="btn btn--principal" type="button" id="btn-mapa">Carregar o mapa</button>
        <a class="btn btn--contorno" href="${esc(s.mapa)}" target="_blank" rel="noopener">Abrir no Google Maps</a>
      </div>
    </div>
  </div>`;
}

function paginaViaturas() {
  const marcas = aVenda.map((v) => v.marca);
  const corpo = `
<section class="secao" style="padding-top:2rem">
  <div class="envolve">
    <nav class="migalhas" aria-label="Migalhas">
      <a href="${u('')}">Início</a> <span>›</span> <span aria-current="page">Viaturas</span>
    </nav>
    <div class="secao__topo">
      <div>
        <p class="sobretitulo">Stock actual</p>
        <h1 class="h-secao">Viaturas disponíveis</h1>
      </div>
    </div>

    <div class="filtros-movel">
      <button class="btn btn--contorno" type="button" id="btn-filtros" style="width:100%">${ic.filtro} Filtrar viaturas</button>
    </div>

    <form class="filtros" id="filtros">
      <div class="filtros__grelha">
        <div class="campo"><label class="campo__rot" for="f-q">Pesquisar</label>
          <input id="f-q" name="q" type="search" placeholder="Marca, modelo…" autocomplete="off"></div>
        <div class="campo"><label class="campo__rot" for="f-tipo">Tipo</label>
          <select id="f-tipo" name="tipo">${opcoes(aVenda.map((v) => v.tipo), 'Todos')}</select></div>
        <div class="campo"><label class="campo__rot" for="f-marca">Marca</label>
          <select id="f-marca" name="marca">${opcoes(marcas, 'Todas')}</select></div>
        <div class="campo"><label class="campo__rot" for="f-comb">Combustível</label>
          <select id="f-comb" name="combustivel">${opcoes(aVenda.map((v) => v.combustivel), 'Todos')}</select></div>
        <div class="campo"><label class="campo__rot" for="f-caixa">Caixa</label>
          <select id="f-caixa" name="caixa">${opcoes(aVenda.map((v) => v.caixa), 'Todas')}</select></div>
        <div class="campo"><label class="campo__rot" for="f-max">Preço até</label>
          <select id="f-max" name="precoMax"><option value="">Sem limite</option>
            ${[10000, 15000, 20000, 25000, 30000].map((p) => `<option value="${p}">${nEuro(p)}</option>`).join('')}</select></div>
        <div class="campo"><label class="campo__rot" for="f-ano">A partir de</label>
          <select id="f-ano" name="anoMin"><option value="">Qualquer ano</option>
            ${[2015, 2018, 2020, 2022, 2024].map((a) => `<option value="${a}">${a}</option>`).join('')}</select></div>
        <div class="campo"><label class="campo__rot" for="f-ordem">Ordenar</label>
          <select id="f-ordem" name="ordem">
            <option value="recentes">Mais recentes</option>
            <option value="preco-asc">Preço: menor primeiro</option>
            <option value="preco-desc">Preço: maior primeiro</option>
            <option value="km-asc">Menos quilómetros</option>
          </select></div>
      </div>
      <div class="filtros__pe">
        <p class="filtros__contagem" id="contagem" role="status"><b>${aVenda.length}</b> viaturas</p>
        <button class="limpar" type="button" id="btn-limpar">Limpar filtros</button>
      </div>
      <div class="filtros__fechar" style="display:none">
        <button class="btn btn--principal" type="button" id="btn-ver" style="width:100%">Ver resultados</button>
      </div>
    </form>

    <div class="grelha" id="grelha">${aVenda.map((v, i) => cartao(v, { prioridade: i < 3 })).join('')}</div>
    <div class="vazio" id="vazio" hidden>
      <h3>Nenhuma viatura com estes filtros</h3>
      <p>Experimente alargar a pesquisa — ou diga-nos o que procura e nós encontramos.</p>
      <a class="btn btn--principal" href="https://wa.me/${def.contactos.whatsapp}" rel="noopener">${ic.zap} Dizer o que procuro</a>
    </div>

    ${vendidas.length && def.opcoes.mostrar_vendidos ? `
    <div class="secao__topo" id="vendidas" style="margin-top:3rem">
      <div><p class="sobretitulo">Histórico</p><h2 class="h-secao">Já vendidas</h2></div>
    </div>
    <div class="grelha">${vendidas.map((v) => cartao(v)).join('')}</div>` : ''}
  </div>
</section>`;

  return pagina({
    pag: 'viaturas/',
    titulo: `Viaturas usadas em Vila Verde, Braga — ${aVenda.length} em stock | LR Motors`,
    descricao: `Todas as viaturas disponíveis na LR Motors, em Vila Verde. Carros, motos e off-road com garantia, retoma e financiamento. Filtre por marca, preço, combustível e ano.`,
    corpo,
    jsonld: [
      migalhasLD([{ nome: 'Início', href: '' }, { nome: 'Viaturas' }]),
      {
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: 'Viaturas em stock na LR Motors',
        numberOfItems: aVenda.length,
        itemListElement: aVenda.map((v, i) => ({
          '@type': 'ListItem', position: i + 1,
          url: abs('viaturas/' + v.slug + '/'), name: tituloLongo(v),
        })),
      },
    ],
  });
}

function paginaViatura(v) {
  /* Só as que estão à venda chegam aqui — as vendidas ficaram sem ficha e o seu
     endereço passou a ser um reencaminhamento. Isto não é uma verificação de
     segurança, é o contrato escrito: se alguém voltar a passar-lhe uma vendida,
     a construção pára aqui em vez de publicar uma ficha com preço de um carro
     que já saiu. */
  if (estaVendida(v)) {
    throw new Error(`paginaViatura() recebeu uma viatura vendida (${v.slug}). As vendidas não têm ficha — veja os stubs em main().`);
  }
  const fs_ = fotos(v);
  const nome = tituloLongo(v);
  const disp = `https://schema.org/${ESTADOS[estadoDe(v)].schema}`;

  /* Mês e ano na mesma linha, como se lê num livrete: 03 / 2025.
     ---------------------------------------------------------------------------
     Esta linha já foi de três maneiras, e esta é a que o cliente escolheu. O mês
     esteve numa linha «Data da matrícula» à parte, e esteve por baixo do ano em
     letra pequena — que obrigava a célula do ano a ter duas linhas e, com a
     grelha de duas colunas, arrastava a dos quilómetros com ela.

     Duas peças, e não um texto só: o mês vai mais pequeno e sem o negrito do
     ano, que é o que se procura nesta linha. E são duas peças escapadas pelo
     gerador, não marcação vinda dos dados — o backoffice não tem por aqui
     maneira de meter HTML numa ficha técnica.

     Os espaços à volta da barra são NÃO SEPARÁVEIS (U+00A0): a célula é estreita
     e alinhada à direita, e com espaços normais «03 /» podia ficar numa linha e
     «2025» na seguinte. Uma data partida em duas lê-se como duas coisas.

     O mês é guardado por NOME no backoffice, escolhido de uma lista, porque é
     assim que o cliente o reconhece; a conversão para número é aqui. Com zero à
     frente, senão «3 / 2025» ao lado de «03 / 2025» ficava desalinhado. */
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const nMes = MESES.indexOf(String(v.mes || '').trim()) + 1;
  const matricula = v.ano
    ? (nMes
        ? { antes: `${String(nMes).padStart(2, '0')}\u00A0/\u00A0`, valor: String(v.ano) }
        : String(v.ano))
    : null;

  const specs = [
    /* «Ano», por decisão do cliente. Eu tinha posto «1.ª matrícula» quando o
       mês entrou na célula, por achar que «Ano: 03/2024» dizia uma coisa e
       mostrava outra; ele preferiu «Ano», e o mês vai mais pequeno e sem
       negrito precisamente para o ano continuar a ser o que se lê. Fica escrito
       para ninguém «corrigir» isto outra vez. */
    ['Ano', matricula], ['Quilómetros', v.km != null ? nKm(v.km) : null],
    ['Combustível', v.combustivel], ['Caixa', v.caixa],
    ['Potência', v.potencia ? v.potencia + ' cv' : null],
    ['Carroçaria', v.carrocaria], ['Cor', v.cor],
    ['Lugares', v.lugares], ['Portas', v.portas], ['Origem', v.origem],
    /* Informação que o DL 74/93 obriga a prestar na venda de veículos usados.
       Só aparece quando o stand a preencher — não se inventa. */
    ['Matrícula', v.matricula],
    ['Ano de construção', v.ano_construcao],
    ['Proprietários anteriores', v.registos_anteriores],
    ['Cilindrada', v.cilindrada ? v.cilindrada + ' cm³' : null],
  ].filter(([, val]) => val !== null && val !== undefined && val !== '');

  const galeria = fs_.length ? `
<div class="galeria">
  <div class="galeria__principal">
    <img id="foto-principal" src="${fs_[0].src}" srcset="${fs_[0].srcset}"
         sizes="(max-width: 980px) 100vw, 62vw" alt="${esc(nome)}"
         width="1600" height="1200" fetchpriority="high" decoding="async">
    ${fs_.length > 1 ? `
    <button class="galeria__nav galeria__nav--ant" type="button" data-passo="-1" aria-label="Foto anterior">${ic.esq}</button>
    <button class="galeria__nav galeria__nav--seg" type="button" data-passo="1" aria-label="Foto seguinte">${ic.dir}</button>
    <span class="galeria__contador"><span id="foto-n">1</span>/${fs_.length}</span>` : ''}
  </div>
  ${fs_.length > 1 ? `<div class="galeria__tiras" role="tablist" aria-label="Fotografias">
    ${fs_.map((f, i) => `<button class="tira" type="button" role="tab" data-i="${i}" aria-current="${i === 0}"
      aria-label="Fotografia ${i + 1}"><img src="${f.srcCartao}" alt="" width="96" height="72" loading="lazy" decoding="async"></button>`).join('')}
  </div>` : ''}
</div>
<dialog class="lightbox" id="lightbox">
  <div class="lightbox__corpo">
    <img id="lb-img" src="" alt="">
    <button class="lightbox__x" type="button" id="lb-x" aria-label="Fechar">${ic.x}</button>
    ${fs_.length > 1 ? `<button class="lightbox__nav lightbox__nav--ant" type="button" data-passo="-1" aria-label="Anterior">${ic.esq}</button>
    <button class="lightbox__nav lightbox__nav--seg" type="button" data-passo="1" aria-label="Seguinte">${ic.dir}</button>
    <span class="lightbox__contador"><span id="lb-n">1</span> de ${fs_.length}</span>` : ''}
  </div>
</dialog>
<script type="application/json" id="fotos-json">${JSON.stringify(fs_.map((f) => ({ src: f.src, srcset: f.srcset })))}</script>`
    : '<div class="galeria__principal" style="display:grid;place-items:center;color:var(--tinta-3)">Sem fotografias</div>';

  /* Linhas vazias e espaços em volta fora: o campo é uma lista escrita à mão
     no backoffice, e um Enter a mais deixava um marcador sozinho na página. */
  const equipamento = (Array.isArray(v.equipamento) ? v.equipamento : [])
    .map((x) => String(x ?? '').trim()).filter(Boolean);

  /* Não há aviso de «vendido» porque não há página de vendido: desde que as
     vendidas deixaram de ter ficha, esta função só corre para as que estão à
     venda. Quem chega a um endereço antigo de uma vendida é reencaminhado
     (ver os stubs, no fim do ficheiro) e o texto do aviso vive lá. */
  const AVISOS = {
    reservado: 'Viatura reservada. Fale connosco para saber se volta a ficar disponível.',
    brevemente: 'Esta viatura chega em breve. Fale connosco para a reservar antes de entrar no stand.',
  };
  const aviso = AVISOS[estadoDe(v)]
    ? `<p class="painel__aviso painel__aviso--${estadoDe(v)}">${AVISOS[estadoDe(v)]}</p>` : '';

  /* Etiquetas do cabeçalho — as mesmas do carrossel da inicial, para a viatura
     se ler igual onde quer que apareça. */
  const g = String(v.garantia || '').trim();
  const garantiaTxt = !g ? '' : /^\d+$/.test(g) ? `Garantia ${g} meses`
    : (/garantia/i.test(g) ? g : `Garantia ${g}`);
  const selosFicha = [];
  if (estadoDe(v) !== 'disponivel') {
    selosFicha.push(`<span class="vit-selo vit-selo--${estadoDe(v)}">${ESTADOS[estadoDe(v)].rotulo}</span>`);
  }
  if (/el[\u00e9e\u00ea]ctric|el[\u00e9e\u00ea]tric/i.test(v.combustivel || '')) selosFicha.push('<span class="vit-selo vit-selo--eletrico">100% elétrico</span>');
  if (garantiaTxt) selosFicha.push(`<span class="vit-selo vit-selo--garantia">${esc(garantiaTxt)}</span>`);
  /* IVA DEDUTÍVEL é um campo próprio desde que se percebeu que o cliente o
     andava a escrever à mão no campo da GARANTIA — «18 meses - Iva dedutível»,
     em duas viaturas. É a segunda vez que ele usa um campo de texto como
     depósito do que falta (a primeira foi o «BREVEMENTE», no mesmo sítio), e
     das duas vezes o que estava escrito era um pedido de funcionalidade.
     Interessa a quem compra em nome de uma empresa, e é dos primeiros filtros
     de quem o faz — por isso é etiqueta, e não uma linha perdida no texto. */
  if (v.iva_dedutivel) selosFicha.push('<span class="vit-selo vit-selo--iva">IVA dedutível</span>');

  const corpo = `
<section class="ficha">
  <div class="envolve">
    <nav class="migalhas" aria-label="Migalhas">
      <a href="${u('')}">Início</a> <span>›</span>
      <a href="${u('viaturas/')}">Viaturas</a> <span>›</span>
      <span aria-current="page">${esc(nome)}</span>
    </nav>

    <!-- O título saiu do painel lateral para aqui, a toda a largura. Estava
         dentro da caixa do preço, o que dava à página um h1 encaixado numa
         barra lateral de 391 px enquanto a fotografia mandava no ecrã. -->
    <header class="ficha__topo">
      <h1 class="ficha__titulo">${esc([v.marca, v.modelo].filter(Boolean).join(' '))}</h1>
      ${v.versao ? `<p class="ficha__versao">${esc(v.versao)}</p>` : ''}
      ${selosFicha.length ? `<p class="ficha__selos">${selosFicha.join('')}</p>` : ''}
    </header>

    <div class="ficha__disposicao">
      <div class="ficha__galeria">${galeria}</div>

      <aside class="ficha__lado">
        <div class="painel">
          <p class="painel__preco${temPreco(v) ? '' : ' painel__preco--consulta'}">${esc(precoTexto(v))}</p>
          <p class="painel__iva">${temPreco(v)
            ? (eBrevemente(v)
                ? 'Preço final, com todos os impostos incluídos. Ainda não chegou ao stand.'
                : 'Preço final, com todos os impostos incluídos.')
            : 'Contacte-nos para saber o preço e as condições desta viatura.'}${v.iva_dedutivel ? ' IVA dedutível para empresas.' : ''}</p>
          ${aviso}
          ${notaVisita('nota-visita--painel')}
          <div class="painel__acoes">
            <a class="btn btn--principal" href="tel:+351${def.contactos.telefone_1}">${ic.tel} ${def.contactos.telefone_1_texto}</a>
            <p class="nota-chamada">(Chamada para a rede móvel nacional)</p>
            <a class="btn btn--zap" href="https://wa.me/${def.contactos.whatsapp}?text=${encodeURIComponent('Olá! Tenho interesse no ' + nome + ' — ' + abs('viaturas/' + v.slug + '/'))}" rel="noopener">${ic.zap} Perguntar no WhatsApp</a>
            <a class="btn btn--contorno" href="${u('contactos/')}">${ic.pin} Como chegar ao stand</a>
          </div>
          <!-- Sem «Ref.»: o que lá estava era o slug do endereço, um
               identificador técnico que eu tinha posto a fazer de referência.
               Não é referência nenhuma do stand e não dizia nada a ninguém. -->
          <p class="painel__nota">${esc(garantiaTxt || 'Garantia legal de conformidade nos termos do DL 84/2021.')}</p>
        </div>
      </aside>
      <div class="ficha__corpo">
        <!-- A ficha técnica estava espremida na barra lateral, em quinze
             cartõezinhos com contorno de 150 px. Passou para a coluna larga e
             para a forma de uma folha de especificações: rótulo à esquerda,
             valor à direita, uma risca a separar. Lê-se de cima a baixo e
             deixou de competir com o painel do preço. -->
        <div class="bloco">
          <h2>Ficha técnica</h2>
          <dl class="specs">
            <!-- Um valor pode vir em DUAS peças, quando parte dele tem menos
                 peso do que o resto — é o caso do mês, que acompanha o ano mas
                 não é o que se procura na linha.

                 O que NÃO se faz é voltar a deixar passar marcação em cru para
                 aqui. Havia essa saída e foi tirada de propósito: quem escolhe
                 é a estrutura (duas peças ou uma), e quem escapa continua a ser
                 este sítio, sempre. Assim o backoffice não tem por onde meter
                 marcação numa ficha técnica.

                 Sem nomes de etiquetas por extenso neste comentário: ele vai no
                 HTML publicado, e uma procura por etiquetas mortas na ficha
                 dava-o como resultado. Perdi um diagnóstico com isso. -->
            ${specs.map(([r, val]) => {
              const dd = val && typeof val === 'object'
                ? `<span class="spec__antes">${esc(val.antes)}</span>${esc(val.valor)}`
                : esc(val);
              return `<div class="spec"><dt>${esc(r)}</dt><dd>${dd}</dd></div>`;
            }).join('')}
          </dl>
        </div>

        <!-- Equipamento. A ordem é a que o cliente pediu: primeiro o que o
             carro é (ficha técnica), depois o que traz, e só no fim o que o
             stand tem a dizer sobre ele.

             Esteve tempo demais fora do site: o campo existia no backoffice e
             as onze viaturas tinham dez extras cada uma, vindos do
             Standvirtual, que nunca chegaram a aparecer a ninguém. -->
        ${equipamento.length ? `<div class="bloco">
          <h2>Equipamento</h2>
          <ul class="equipa">
            ${equipamento.map((x) => `<li>${ic.check}<span>${esc(x)}</span></li>`).join('')}
          </ul>
        </div>` : ''}

        ${textoRico(v.descricao) ? `<div class="bloco">
          <h2>Descrição</h2>
          ${textoRico(v.descricao)}
        </div>` : ''}
      </div>

    </div>
  </div>
</section>

<div class="barra-contacto">
  <a class="btn btn--principal" href="tel:+351${def.contactos.telefone_1}">${ic.tel} Ligar</a>
  <a class="btn btn--zap" href="https://wa.me/${def.contactos.whatsapp}" rel="noopener">${ic.zap} WhatsApp</a>
</div>`;

  /* Product + Offer: é o tipo que ainda produz resultado enriquecido no Google.
     O `Vehicle`/`Car` foi descontinuado em Setembro de 2025 e deixou de aparecer.
     Nada aqui é marcado sem estar visível na página — é regra explícita do Google. */
  const produtoLD = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: nome,
    description: v.descricao,
    image: fs_.slice(0, 6).map((f) => abs(f.src.replace(BASE + '/', ''))),
    brand: { '@type': 'Brand', name: v.marca },
    ...(v.cor ? { color: v.cor } : {}),
    ...(v.km != null ? { mileageFromOdometer: { '@type': 'QuantitativeValue', value: v.km, unitCode: 'KMT' } } : {}),
    ...(v.caixa ? { vehicleTransmission: v.caixa } : {}),
    ...(v.combustivel ? { fuelType: v.combustivel } : {}),
    ...(v.ano ? { productionDate: String(v.ano) } : {}),
    /* Sem preço publicado, o Offer vai sem `price`: marcar um preço que não
       está visível na página é expressamente proibido pelo Google. */
    offers: {
      '@type': 'Offer',
      ...(temPreco(v) ? { price: v.preco, priceCurrency: 'EUR' } : {}),
      availability: disp,
      itemCondition: 'https://schema.org/UsedCondition',
      url: abs('viaturas/' + v.slug + '/'),
      seller: { '@id': abs('#stand') },
    },
  };

  return pagina({
    pag: 'viaturas/' + v.slug + '/',
    titulo: `${nome}${v.ano ? ' de ' + v.ano : ''} — ${precoTexto(v)} | LR Motors Vila Verde`,
    descricao: `${nome} usado à venda na LR Motors, Vila Verde (Braga). ${[v.ano, v.km != null ? nKm(v.km) : null, v.combustivel, v.caixa].filter(Boolean).join(' · ')}. ${precoTexto(v)}, com garantia.`,
    /* O cartão de partilha é o `og.jpg` que o script das imagens deixa na pasta
       da viatura, e não a fotografia em WebP que o site mostra: o WhatsApp não
       mostra WebP nas pré-visualizações de link, e este stand partilha os
       anúncios por WhatsApp. Se a pasta ainda não tiver o cartão — viatura
       acabada de carregar antes de o script correr — cai no do logótipo, que é
       melhor do que uma partilha sem imagem. */
    og: (() => {
      if (!fs_[0]) return undefined;
      const pasta = fs_[0].src.replace(BASE + '/', '').split('/').slice(0, -1).join('/');
      return existsSync(join(RAIZ, pasta, 'og.jpg')) ? abs(pasta + '/og.jpg') : undefined;
    })(),
    corpo,
    jsonld: [
      produtoLD,
      /* O Offer aponta para o vendedor por @id; sem o AutoDealer na mesma
         página, essa referência ficava pendurada. */
      standLD,
      migalhasLD([{ nome: 'Início', href: '' }, { nome: 'Viaturas', href: 'viaturas/' }, { nome: nome }]),
    ],
  });
}

function paginaContactos() {
  const s = def.stand;
  const corpo = `
<section class="secao">
  <div class="envolve">
    <nav class="migalhas" aria-label="Migalhas"><a href="${u('')}">Início</a> <span>›</span> <span aria-current="page">Contactos</span></nav>
    <!-- Mesmo painel da secção «Venha ver ao vivo» da página inicial: o mapa
         encostado ao bordo e a preencher a altura toda. Antes era uma caixa
         baixa à direita, com meia página de branco por baixo. -->
    <div class="visita">
      <div class="visita__info">
        <p class="sobretitulo">Falar connosco</p>
        <h1 class="h-secao">Contactos e localização</h1>
        <p class="visita__lead">Passe pelo stand, ligue-nos ou mande mensagem. Respondemos no próprio dia.</p>

        <ul class="visita__factos">
          <li>${ic.pin}<span><b>${esc(s.morada)}</b><br>${esc(s.codigo_postal)} ${esc(s.localidade)}, ${esc(s.distrito)}</span></li>
          <li>${ic.tel}<span><b><a href="tel:+351${def.contactos.telefone_1}">${def.contactos.telefone_1_texto}</a>
            · <a href="tel:+351${def.contactos.telefone_2}">${def.contactos.telefone_2_texto}</a></b>
            <small>(Chamada para a rede móvel nacional)</small></span></li>
          <li>${ic.zap}<span><b><a href="https://wa.me/${def.contactos.whatsapp}" rel="noopener">WhatsApp</a></b>
            <small>Mande a matrícula ou o modelo que procura</small></span></li>
        </ul>

        <ul class="horario horario--visita" id="horario-contactos">
          ${def.horario.map((h) => `<li data-dias="${esc(h.dias)}"><span>${esc(h.dias)}</span><span>${esc(h.horas)}</span></li>`).join('')}
        </ul>

        ${notaVisita()}
        <div class="visita__acoes">
          <a class="btn btn--principal" href="tel:+351${def.contactos.telefone_1}">${ic.tel} Ligar agora</a>
          <a class="btn btn--contorno" href="https://www.google.com/maps/dir/?api=1&amp;destination=${s.latitude},${s.longitude}"
             target="_blank" rel="noopener">${ic.pin} Como chegar</a>
        </div>
        <p class="nota-chamada">(Chamada para a rede móvel nacional)</p>
      </div>
      <div class="visita__mapa">${mapa()}</div>
    </div>
  </div>
</section>`;
  return pagina({
    pag: 'contactos/',
    titulo: 'Contactos — LR Motors, Vila Verde (Braga)',
    descricao: `Stand LR Motors em ${s.morada}, ${s.codigo_postal} ${s.localidade}. Telefones ${def.contactos.telefone_1_texto} e ${def.contactos.telefone_2_texto}. Horário e mapa.`,
    corpo,
    jsonld: [standLD, migalhasLD([{ nome: 'Início', href: '' }, { nome: 'Contactos' }])],
  });
}

function paginaServicos() {
  const item = (icone, t, p) => `<div class="carta"><div class="carta__icone">${icone}</div><h3>${t}</h3><p>${p}</p></div>`;
  const corpo = `
<section class="secao">
  <div class="envolve">
    <nav class="migalhas" aria-label="Migalhas"><a href="${u('')}">Início</a> <span>›</span> <span aria-current="page">Serviços</span></nav>
    <p class="sobretitulo">O que fazemos</p>
    <h1 class="h-secao">Mais do que vender carros</h1>
    <p class="lead lead--pagina">Compramos, vendemos e trocamos — e temos oficina de mecânica própria, o que
      significa que cada viatura que sai daqui passou pelas nossas mãos.</p>
    <div class="cartas cartas--tres">
      ${item(ic.chave, 'Venda de viaturas', 'Carros, motos e todo-o-terreno, nacionais e importados, verificados antes de entrar em stock.')}
      ${item(ic.troca, 'Retoma', 'Avaliamos o seu usado no momento e abatemos o valor no carro que levar.')}
      ${item(ic.cartao, 'Financiamento', 'Simulação gratuita e sem compromisso, com resposta no próprio dia.')}
      ${item(ic.ferramenta, 'Oficina de mecânica', 'Mecânica geral e manutenção, na nossa oficina. Também para quem não comprou aqui.')}
      ${item(ic.escudo, 'Garantia incluída', 'Garantia legal de conformidade em todas as viaturas, nos termos do DL 84/2021. O prazo fica escrito no contrato.')}
      ${item(ic.pin, 'Tratamos da papelada', 'Transferência de propriedade e registo tratados por nós.')}
    </div>
  </div>
</section>

<!-- Os passos. A pergunta que falta responder numa página de serviços não é «o
     que fazem» — é «o que me acontece a mim se eu for aí». Quatro passos, uma
     linha cada, numerados. -->
<section class="secao secao--tenue">
  <div class="envolve">
    <p class="sobretitulo">Do primeiro contacto às chaves</p>
    <h2 class="h-secao h-secao--espaco">Como funciona</h2>
    <ol class="passos">
      <li class="passo"><span class="passo__n">1</span>
        <h3>Escolhe</h3><p>Veja o stock no site ou passe pelo stand. Sem marcação.</p></li>
      <li class="passo"><span class="passo__n">2</span>
        <h3>Experimenta</h3><p>Prova na estrada e a viatura vista por baixo, na nossa oficina.</p></li>
      <li class="passo"><span class="passo__n">3</span>
        <h3>Fechamos as contas</h3><p>Retoma avaliada na hora e financiamento simulado sem compromisso.</p></li>
      <li class="passo"><span class="passo__n">4</span>
        <h3>Leva o carro</h3><p>Tratamos do registo e da transferência. Sai daqui com tudo em ordem.</p></li>
    </ol>
  </div>
</section>

<section class="secao">
  <div class="envolve">
    <div class="faixa-cta">
      <div>
        <h2 class="h-secao">Quer ver o que temos?</h2>
        <p>Stock actualizado. Se não estiver cá, procuramos por si.</p>
      </div>
      <div class="faixa-cta__acoes">
        <a class="btn btn--principal" href="${u('viaturas/')}">Ver as viaturas ${ic.seta}</a>
        <a class="btn btn--zap" href="https://wa.me/${def.contactos.whatsapp}" rel="noopener">${ic.zap} Dizer o que procuro</a>
      </div>
    </div>
  </div>
</section>`;
  return pagina({
    pag: 'servicos/',
    titulo: 'Serviços — venda, retoma, financiamento e oficina | LR Motors',
    descricao: 'Venda de carros, motos e off-road, retoma do seu usado, financiamento e oficina de mecânica própria em Vila Verde, Braga.',
    corpo,
    jsonld: [migalhasLD([{ nome: 'Início', href: '' }, { nome: 'Serviços' }])],
  });
}

function paginaSobre() {
  const corpo = `
<section class="secao">
  <div class="envolve">
    <nav class="migalhas" aria-label="Migalhas"><a href="${u('')}">Início</a> <span>›</span> <span aria-current="page">Sobre nós</span></nav>
    <div class="contacto contacto--sobre">
      <div>
        <p class="sobretitulo">Quem somos</p>
        <h1 class="h-secao">${esc(def.textos.sobre_titulo)}</h1>
        <p class="lead lead--pagina">${esc(def.textos.sobre_texto)}</p>
        <div class="hero__acoes">
          <a class="btn btn--principal" href="${u('viaturas/')}">Ver o stock ${ic.seta}</a>
          <a class="btn btn--contorno" href="${u('contactos/')}">Contactos</a>
        </div>
      </div>
      <div>
        <!-- As medidas TÊM de bater certo com a fotografia: o browser reserva o
             espaço pela proporção que estes atributos declaram, e a foto nova é
             4:3 deitada, não 4:5 em pé como a anterior. Com os números antigos
             a página saltava quando a imagem acabava de carregar. -->
        <img class="foto-emoldurada foto-emoldurada--media" src="${u('assets/img/stand-960.webp')}"
             srcset="${u('assets/img/stand-960.webp')} 960w, ${u('assets/img/stand-1600.webp')} 1600w"
             sizes="(max-width: 900px) 92vw, 560px"
             alt="Stand da LR Motors em Vila Verde, com viaturas em exposição e a tabuleta da marca"
             width="1600" height="1200" loading="lazy" decoding="async">
      </div>
    </div>
  </div>
</section>`;
  return pagina({
    pag: 'sobre/',
    titulo: 'Sobre a LR Motors — stand de automóveis em Vila Verde, Braga',
    descricao: 'A LR Motors vende carros em Vila Verde desde 2015. Carros, motos e off-road, com oficina de mecânica própria.',
    corpo,
    jsonld: [standLD, migalhasLD([{ nome: 'Início', href: '' }, { nome: 'Sobre nós' }])],
  });
}

/* ------------------------------------------------------------------ escrita */
/* Que ficheiros de assets/veiculos/ vão mesmo para o ar.
   ---------------------------------------------------------------------------
   Duas coisas passaram a estar publicadas sem ninguém decidir isso:

   1. O que o cliente carrega no backoffice sem abrir primeiro a pasta de uma
      viatura fica solto na raiz de assets/veiculos/. Não pertence a anúncio
      nenhum, mas o site copiava a pasta inteira e servia-o à mesma —
      aconteceu com uma fotografia do conta-quilómetros de um Peugeot, que
      esteve no ar em lrmotorsautomoveis.pt sem estar em anúncio nenhum.

   2. O ficheiro ORIGINAL, tal como saiu do telemóvel. O site nunca o usa —
      serve sempre as variantes -480/-960/-1600 — mas ele seguia na mesma:
      vários MB por fotografia, e com os metadados do telemóvel, coordenadas
      de GPS incluídas, que o Pillow deixa cair ao gerar as variantes.

   Fica tudo no repositório (a biblioteca do backoffice continua a mostrá-lo);
   o que muda é que deixa de ser copiado para o site. O original só vai quando
   ainda não tiver variantes, para uma foto acabada de carregar aparecer à
   mesma enquanto a Action não corre — é o mesmo caso que fotos() já trata. */
const LARGURA_VARIANTE = /-(?:480|960|1600)\.webp$/;
const semSufixo = (nome) => nome.replace(/\.[a-z0-9]+$/i, '').replace(/-(?:480|960|1600)$/, '');

/* Fotos que alguma viatura aponta para a RAIZ de assets/veiculos/. Normalmente
   nenhuma, mas o backoffice deixa lá gravar e fotos() aceita-o, portanto não se
   deita fora o que está mesmo a ser usado. */
const soltasEmUso = new Set(todas
  .flatMap((v) => (Array.isArray(v.fotos) ? v.fotos : []))
  .map((c) => String(c).replace(/^\/+/, ''))
  .filter((c) => /^assets\/veiculos\/[^/]+$/.test(c))
  .map((c) => semSufixo(c.split('/').pop())));

const naoPublicados = [];

function publicavel(origem) {
  const rel = relative(RAIZ, origem).split(sep).join('/');
  if (!rel.startsWith('assets/veiculos/')) return true;

  /* As PASTAS passam sempre. Dizer que não a uma pasta faz o cpSync não descer
     lá dentro, e perde-se o anúncio inteiro de uma vez — fotografias e cartão
     de partilha. Decide-se por statSync e não pelo nome: o teste anterior era
     «não tem ponto, logo é pasta», e uma pasta chamada «patrol 3.0» ou
     «carro-2.0-tdi» passava por ficheiro. Nomes assim são o normal aqui — o
     próprio backoffice dá «0.9 TCE Expression» como exemplo de versão — e o
     cliente cria as pastas à mão na biblioteca. */
  if (statSync(origem).isDirectory()) return true;

  const resto = rel.slice('assets/veiculos/'.length);
  const nome = resto.split('/').pop();
  const base = semSufixo(nome);
  const cartao = nome === 'og.jpg';

  /* Caso 1: solto na raiz de assets/veiculos/, que é onde o backoffice grava
     quando não se abre primeiro a pasta de uma viatura. O cartão de partilha
     da raiz segue a sorte das fotos que lhe deram origem: o
     otimizar-imagens.py faz um por cada pasta com variantes, raiz incluída. */
  if (!resto.includes('/')) {
    const emUso = cartao ? soltasEmUso.size > 0 : soltasEmUso.has(base);
    if (!emUso) {
      naoPublicados.push(`${rel} (não pertence a nenhuma viatura)`);
      return false;
    }
  }

  /* Caso 2: o ficheiro ORIGINAL, que o site nunca usa — serve sempre as
     variantes. Só segue quando ainda não as tiver, para uma foto acabada de
     carregar aparecer enquanto a Action não corre. Vale na raiz e dentro das
     pastas: uma foto em uso na raiz também não tem que levar para o ar os
     vários MB e os metadados do telemóvel. */
  if (cartao || LARGURA_VARIANTE.test(nome)) return true;
  const temVariantes = readdirSync(dirname(origem)).includes(`${base}-1600.webp`);
  if (temVariantes) naoPublicados.push(`${rel} (original; o site usa as variantes)`);
  return !temVariantes;
}

function escrever(caminho, html) {
  const destino = join(SAIDA, caminho);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html, 'utf8');
}

function main() {
  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });

  cpSync(join(RAIZ, 'assets'), join(SAIDA, 'assets'), { recursive: true, filter: publicavel });

  /* A ferramenta de reduzir fotografias, em lrmotorsautomoveis.pt/fotos/.
     É para o cliente usar antes de carregar fotos no backoffice; não está
     ligada a partir de lado nenhum do site nem entra no sitemap, e traz o seu
     próprio `noindex`. Ver o cabeçalho do ficheiro para o porquê. */
  const ferramenta = join(RAIZ, 'ferramentas/fotos.html');
  if (existsSync(ferramenta)) {
    /* O endereço do Worker que recebe as fotografias entra aqui, e não está no
       ficheiro-fonte, para haver um sítio só onde se muda. Vazio é um estado
       válido: a página esconde o envio e serve só para preparar as fotografias.
       Não é segredo nenhum — quem valida a senha é o Worker —, mas também não
       tem que andar escrito em dois sítios. */
    const worker = String((def.tecnico && def.tecnico.worker_fotos) || '').trim();
    mkdirSync(join(SAIDA, 'fotos'), { recursive: true });
    writeFileSync(join(SAIDA, 'fotos/index.html'),
      readFileSync(ferramenta, 'utf8').replaceAll('__WORKER_FOTOS__', worker), 'utf8');
    if (!worker) console.log('  /fotos/ sem Worker configurado — só prepara, não envia');
  }

  /* O CNAME tem de ir DENTRO do que é publicado. Com o deploy por Actions, o
     que segue para o Pages é só este directório: o domínio configurado nas
     definições aguenta-se, mas basta alguém lá mexer para o perder, e o
     ficheiro é a forma de o deixar escrito no próprio site. Está na raiz do
     repositório para quem mudar de domínio ter um sítio óbvio onde tocar. */
  if (existsSync(join(RAIZ, 'CNAME'))) {
    cpSync(join(RAIZ, 'CNAME'), join(SAIDA, 'CNAME'));
  }

  escrever('index.html', paginaInicial());
  escrever('viaturas/index.html', paginaViaturas());
  escrever('contactos/index.html', paginaContactos());
  escrever('servicos/index.html', paginaServicos());
  escrever('sobre/index.html', paginaSobre());
  /* Página de detalhe só para as que estão à venda. Uma vendida não tem para
     onde levar: sem preço e sem descrição, a página ficava a repetir o que o
     cartão já diz. O endereço antigo não fica a dar 404 — ver o stub logo a
     seguir. */
  for (const v of aVenda) escrever(`viaturas/${v.slug}/index.html`, paginaViatura(v));

  /* Os endereços das vendidas não desaparecem, reencaminham.
     -------------------------------------------------------------------------
     Estas páginas estiveram no ar e no sitemap, e o stand PARTILHA links de
     viaturas por WhatsApp — há links destes guardados em conversas e talvez
     indexados. Um 404 seco castigava quem guardou o link por uma coisa que não
     fez. Como o carro continua visível na listagem, mandá-lo para lá não é
     enganar ninguém: é levá-lo ao sítio onde a viatura ainda está, agora como
     histórico.

     Num alojamento estático não há 301, por isso é `<meta refresh>` a zero
     segundos com `rel=canonical` — que é o que o Google lê como mudança
     permanente — mais uma ligação visível para quem tenha o refresh desligado.
     Fora do sitemap, claro.

     SEM `noindex`, e é deliberado: `noindex` junto com um `canonical` é um sinal
     contraditório («não indexes isto» + «indexa aquilo em vez disto»), e o
     Google pode aplicar o noindex ao DESTINO do canonical. O destino aqui é
     /viaturas/, a página mais importante do site a seguir à inicial. O refresh
     imediato já basta para o stub não ficar nos resultados. */
  /* A âncora só existe se a secção existir. `mostrar_vendidos` é um interruptor
     do backoffice: o cliente desliga-o e a secção «Já vendidas» deixa de ser
     desenhada, e com ela desaparecem os `id` dos cartões. O `#v-<slug>` ficava a
     apontar para um id que não está na página, e quem viesse de um link antigo
     caía no topo da listagem sem perceber porquê. Com o interruptor desligado o
     reencaminhamento é para a listagem e pronto — o texto do stub já diz que a
     viatura foi vendida. */
  const haSeccaoVendidas = vendidas.length > 0 && !!def.opcoes.mostrar_vendidos;

  for (const v of vendidas) {
    /* SEM `rel=canonical`, e é escolha e não esquecimento. Um canonical declara
       que duas páginas são substancialmente o mesmo conteúdo, e quarenta
       palavras a dizer «este carro foi vendido» não são a listagem do stock.
       O `<meta refresh>` a zero segundos já é lido pelo Google como
       reencaminhamento permanente, que é o sinal de canonicalização mais forte
       que existe — o canonical por cima só acrescentava uma declaração falsa.

       O endereço absoluto fica só no `og:url`, para as pré-visualizações. O
       reencaminhamento e a ligação visível vão em caminho do site, para o stub
       funcionar onde quer que o site esteja (domínio, github.io de recurso,
       servidor local). Dei por isto a testar em local — o stub atirava o
       browser para fora do servidor de testes e eu ia a acreditar que a âncora
       estava partida. */
    const destino = abs('viaturas/');
    const comAncora = u('viaturas/') + (haSeccaoVendidas ? `#v-${v.slug}` : '');

    /* O cartão de partilha vem com o stub, e não é um extra: a razão de existir
       deste stub são os links partilhados por WhatsApp. Sem `og:image`, voltar
       a partilhar um link antigo dava uma pré-visualização vazia — pior do que
       antes de haver stub. É o mesmo `og.jpg` que a página tinha, com o mesmo
       recuo para o logótipo quando ainda não foi gerado. */
    const f0 = fotos(v)[0];
    const pastaFoto = f0 ? f0.src.replace(BASE + '/', '').split('/').slice(0, -1).join('/') : null;
    const cartao = pastaFoto && existsSync(join(RAIZ, pastaFoto, 'og.jpg'))
      ? abs(pastaFoto + '/og.jpg') : abs('assets/img/og.jpg');  // o mesmo recuo do resto do site (linha 621)
    /* «Esta viatura já foi vendida» e não «O X foi vendido»: o género do artigo
       e do particípio teria de acompanhar o modelo — «O BMW», mas «A Smart» —
       e escrevê-lo à mão dava frases erradas mal entrasse a marca seguinte.
       Concordar com «viatura» é sempre certo, e é o que o cartão já diz. */
    const legenda = 'Esta viatura já foi vendida. Veja as viaturas em stock na LR Motors, em Vila Verde.';

    escrever(`viaturas/${v.slug}/index.html`, `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(tituloLongo(v))} — vendido | LR Motors</title>
<meta name="description" content="${esc(legenda)}">
<meta http-equiv="refresh" content="0; url=${comAncora}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(tituloLongo(v))} — vendido">
<meta property="og:description" content="${esc(legenda)}">
<meta property="og:image" content="${cartao}">
<meta property="og:url" content="${destino}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center;color:#0E1726">
<p><strong>${esc(tituloLongo(v))}</strong></p>
<p>Esta viatura já foi vendida.</p>
<p><a href="${comAncora}">Ver as viaturas em stock</a></p>
</body>
</html>
`);
  }

  /* páginas legais: markdown simples convertido no build */
  for (const [ficheiro, destino] of Object.entries({
    'privacidade.md': 'privacidade/index.html',
    'termos.md': 'termos/index.html',
    'garantia.md': 'garantia/index.html',
    'resolucao-de-litigios.md': 'resolucao-de-litigios/index.html',
  })) {
    const caminho = join(RAIZ, 'conteudo', ficheiro);
    if (!existsSync(caminho)) continue;
    const bruto = readFileSync(caminho, 'utf8');
    const [, cab, md] = bruto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [null, '', bruto];
    const meta = Object.fromEntries(cab.split('\n').filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
    escrever(destino, pagina({
      pag: destino.replace('index.html', ''),
      titulo: `${meta.titulo} | LR Motors`,
      descricao: meta.descricao ?? meta.titulo,
      corpo: `<div class="envolve"><article class="texto">${marcarDown(md)}</article></div>`,
    }));
  }

  /* sitemap + robots */
  const urls = ['', 'viaturas/', 'servicos/', 'sobre/', 'contactos/',
    'privacidade/', 'termos/', 'garantia/', 'resolucao-de-litigios/',
    /* Só as que têm página a sério. No lugar das vendidas ficaram stubs de
       reencaminhamento: pô-los no sitemap era pedir ao Google que fosse buscar
       páginas cujo único conteúdo é «vai antes ali». */
    ...aVenda.map((v) => `viaturas/${v.slug}/`)];
  const hoje = new Date().toISOString().slice(0, 10);
  escrever('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${abs(p)}</loc><lastmod>${hoje}</lastmod></url>`).join('\n')}
</urlset>
`);
  /* /fotos/ é a ferramenta interna de reduzir fotografias — não é conteúdo do
     stand e não tem nada que aparecer numa pesquisa pela LR Motors. */
  escrever('robots.txt',
    `User-agent: *\nAllow: /\nDisallow: /fotos/\n\nSitemap: ${abs('sitemap.xml')}\n`);
  escrever('404.html', pagina({
    pag: '404.html', titulo: 'Página não encontrada | LR Motors',
    descricao: 'A página que procura não existe.',
    corpo: `<section class="secao"><div class="envolve vazio">
      <h3 style="font-size:1.6rem">Não encontrámos esta página</h3>
      <p>Pode ter sido removida, ou o endereço está errado.</p>
      <a class="btn btn--principal" href="${u('viaturas/')}">Ver as viaturas ${ic.seta}</a>
    </div></section>`,
  }));
  writeFileSync(join(SAIDA, '.nojekyll'), '');

  console.log(`gerado em _site/`);
  console.log(`  ${publicadas.length} viaturas publicadas (${todas.length - publicadas.length} em rascunho)`);
  console.log(`  ${urls.length} páginas no sitemap`);
  console.log(`  base: ${BASE || '/'}   site: ${SITE}`);
  if (naoPublicados.length) {
    const n = naoPublicados.length;
    console.log(`\n  ${n} ficheiro${n === 1 ? '' : 's'} ficou fora do site:`
      .replace('ficou', n === 1 ? 'ficou' : 'ficaram'));
    for (const f of naoPublicados) console.log(`    - ${f}`);
  }
}

/* Markdown mínimo: só o que as páginas legais usam. Não vale a pena uma
   dependência para converter títulos, listas e ligações. */
function marcarDown(md) {
  const linhas = md.split('\n');
  let html = '', lista = false;
  /* O negrito tem de ser convertido ANTES do itálico, senão a regra do itálico
     come o primeiro asterisco de cada par. Itálico e código entraram porque a
     página de privacidade passou a nomear uma chave de armazenamento, e sem
     eles saíam os asteriscos e as crases à vista no ecrã — saíam mesmo, foi
     assim que dei por isto. */
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const l of linhas) {
    const t = l.trim();
    if (/^- /.test(t)) {
      if (!lista) { html += '<ul>'; lista = true; }
      html += `<li>${inline(t.slice(2))}</li>`; continue;
    }
    if (lista) { html += '</ul>'; lista = false; }
    if (!t) continue;
    if (/^### /.test(t)) html += `<h3>${inline(t.slice(4))}</h3>`;
    else if (/^## /.test(t)) html += `<h2>${inline(t.slice(3))}</h2>`;
    else if (/^# /.test(t)) html += `<h1>${inline(t.slice(2))}</h1>`;
    else if (/^_.*_$/.test(t)) html += `<p class="actualizado">${inline(t.slice(1, -1))}</p>`;
    else html += `<p>${inline(t)}</p>`;
  }
  if (lista) html += '</ul>';
  return html;
}

main();
