/* AS REGRAS DOS DADOS DA LR MOTORS, NUM SÓ SÍTIO.
 *
 * Três leitores, e os três têm de ouvir o mesmo:
 *   · o CI do site (.github/guardas.mjs), antes de gerar o site;
 *   · o painel, no browser (o erro aparece por baixo do campo, antes de gravar);
 *   · o Worker do painel, ao gravar (recusa os problemas NOVOS que não sejam
 *     lembretes).
 * O painel usa uma CÓPIA BYTE A BYTE deste ficheiro (estatico/js/regras.js no
 * repositório do painel), com um teste de SHA-256 que falha se divergirem. Por
 * isso é um ES module puro: nenhum import, nada de node:*, fs, process ou
 * require. Corre tal e qual no browser, num Worker e no Node.
 *
 * A ESPECIFICAÇÃO É O .pages.yml: os campos, a ordem, as listas de valores e as
 * ajudas que o dono lê. E o que cada campo FAZ no site é o scripts/gerar.mjs —
 * as regras olham para o que o gerador faz com o valor, e não para o que o valor
 * parece.
 *
 * CADA PROBLEMA TEM UMA CLASSE (plano, §4):
 *   · bloqueia   — a publicação pára e o site fica como estava. Só a estrutura
 *                  (um JSON que não se lê, um ficheiro sem a forma que o gerador
 *                  precisa, um valor que ele escreve tal e qual no HTML de TODAS
 *                  as páginas) e os dados legais da empresa (CSC art. 171.º).
 *   · neutraliza — uma viatura, só na cópia que o gerador lê (o ficheiro do
 *                  repositório não muda — ver neutralizar()): sem marca ou sem
 *                  modelo, ou com um valor que partia a página dela, fica
 *                  escondida do site; uma fotografia que não existe, ou que não é
 *                  da biblioteca, não aparece. Um problema de UMA viatura nunca
 *                  pára a publicação das outras.
 *   · avisa      — só aviso. No painel, os que não são lembrete são erro de
 *                  campo (valor fora da lista, número fora dos limites, texto
 *                  comprido de mais): o painel não os deixa gravar, mas um valor
 *                  estranho num commit à mão não é razão para parar o site.
 *                  Os LEMBRETES (lembrete: true) não são erro de ninguém: o painel
 *                  grava na mesma e mostra-os no Início.
 *
 * DECISÃO DO RENATO (1 out 2026): os campos da lei dos usados (DL 74/93:
 * matrícula, ano de construção quando difere do da matrícula, donos anteriores)
 * e a garantia SÓ LEMBRAM — não bloqueiam nem tiram viaturas do site. Hoje
 * nenhuma das viaturas à venda tem matrícula.
 *
 * dados = {
 *   viaturas:   { <nome>: texto | objecto | null },   data/viaturas/<nome>.json
 *   vendidas:   { <nome>: texto | objecto | null },   data/viaturas/vendidas/<nome>.json
 *   definicoes: texto | objecto | null,               data/definicoes.json
 * }
 *   <nome> é o nome do ficheiro sem «.json». Para o painel é o slug; nos
 *   ficheiros antigos do Pages CMS pode ter hífens a mais («renault-captur-»), e
 *   o endereço da página é slugDoFicheiro(<nome>), como no gerador.
 *   texto = o conteúdo do ficheiro; null = o ficheiro não existe (ignorado).
 *   Uma chave de topo AUSENTE não se confere (o painel pode conferir só uma
 *   viatura); `definicoes: null` (presente, mas null) é «falta o ficheiro».
 *
 * problema = {
 *   classe:   'bloqueia' | 'neutraliza' | 'avisa',
 *   chave:    estável: 'viatura:<slug>:<regra>' ou 'definicoes:<campo>[:<regra>]'.
 *             O Worker compara as chaves do HEAD com as da gravação e recusa só
 *             as novas; por isso UMA CHAVE TEM SEMPRE A MESMA CLASSE (o
 *             .github/test-guardas.mjs confere-o num varrimento). As chaves das
 *             viaturas são pelo slug e não pela pasta: vender uma viatura move o
 *             ficheiro, e os problemas dela não podem parecer novos por isso.
 *   ficheiro: 'data/viaturas/<nome>.json', 'data/viaturas/vendidas/<nome>.json'
 *             ou 'data/definicoes.json';
 *   ecra:     o ecrã do painel onde se corrige («Viaturas › Ford Puma 1.0
 *             EcoBoost Titanium», «Dados do stand › Contactos»);
 *   mensagem: para o dono, em português simples, sem caminhos de JSON;
 *   campo?:   o campo onde o painel mostra o erro ('preco', 'contactos.telefone_1');
 *   campos?:  quando são vários;
 *   efeito?:  só nos «neutraliza»: 'esconder' | 'sem_fotografia';
 *   slug?, pasta?: só nas viaturas ('viaturas' | 'vendidas', a pasta do ficheiro);
 *   foto?, indice?: só nos problemas de uma fotografia (o caminho e a posição);
 *   lembrete?: true nos avisos que não são erro de ninguém.
 * }
 *
 * «NÃO FOI DITO» E NULL SÃO O MESMO: o Pages CMS omite os campos vazios ao
 * gravar, e uma regra que exigisse a chave partia à primeira gravação dele. E o
 * vazio testa-se ANTES de converter: Number(null) é 0, e 0 é uma escolha (zero
 * quilómetros, zero donos anteriores).
 */

/* ------------------------------------------------------------------ */
/* Onde estão as coisas                                                */
/* ------------------------------------------------------------------ */

export const FICHEIROS = { definicoes: 'data/definicoes.json' };
export const PASTAS = { viaturas: 'data/viaturas', vendidas: 'data/viaturas/vendidas' };
export const ficheiroDaViatura = (pasta, nome) => `${PASTAS[pasta]}/${nome}.json`;
/* A BIBLIOTECA (o que se carrega; é o que os caminhos das viaturas apontam) e as
   GERADAS (as larguras que o site serve, no mesmo caminho relativo). Nunca se
   escreve nas geradas: é a publicação que as faz. */
export const BIBLIOTECA = 'assets/veiculos';
export const DERIVADAS = 'assets/fotos';

/* ------------------------------------------------------------------ */
/* As listas do .pages.yml                                             */
/* ------------------------------------------------------------------ */

export const TIPOS = ['carro', 'mota', 'off-road'];
export const CARROCARIAS = ['Citadino', 'Berlina', 'Carrinha', 'SUV', 'Coupé', 'Cabrio', 'Monovolume', 'Comercial'];
export const ESTADOS = ['disponivel', 'reservado', 'brevemente', 'vendido'];
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const COMBUSTIVEIS = ['Gasolina', 'Diesel', 'Elétrico', 'Híbrido', 'Híbrido Plug-in', 'GPL'];
export const CAIXAS = ['Manual', 'Automática'];
export const ORIGENS = ['Nacional', 'Importado'];
/* As que o scripts/otimizar-imagens.py prepara. */
export const EXTENSOES_FOTO = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

/* Os campos de uma viatura, pela ordem do .pages.yml (a do formulário). Uma
   chave nova entra por esta ordem (ordenarComo()); as que já estão no ficheiro
   ficam onde estão. */
export const CAMPOS_VIATURA = [
  'marca', 'modelo', 'versao', 'tipo', 'carrocaria', 'preco', 'iva_dedutivel', 'publicado', 'estado',
  'destaque', 'ordem', 'fotos', 'ano', 'mes', 'km', 'combustivel', 'caixa', 'potencia', 'cilindrada',
  'cor', 'lugares', 'portas', 'origem', 'matricula', 'ano_construcao', 'registos_anteriores',
  'garantia', 'equipamento', 'descricao',
];
/* Sempre escritos pelo painel, com o valor explícito. Ausentes valem o valor por
   omissão do .pages.yml (é o que o gerador faz). */
export const BOOLEANOS_VIATURA = ['iva_dedutivel', 'publicado', 'destaque'];
export const POR_OMISSAO = { tipo: 'carro', iva_dedutivel: false, publicado: true, estado: 'disponivel', destaque: false, ordem: 50, lugares: 5 };

export const NOMES_CAMPOS = {
  marca: 'Marca', modelo: 'Modelo', versao: 'Versão', tipo: 'Tipo de veículo', carrocaria: 'Carroçaria',
  preco: 'Preço', iva_dedutivel: 'IVA dedutível', publicado: 'Publicado no site', estado: 'Estado',
  destaque: 'Destaque na página inicial', ordem: 'Ordem', fotos: 'Fotografias', ano: 'Ano', mes: 'Mês',
  km: 'Quilómetros', combustivel: 'Combustível', caixa: 'Caixa', potencia: 'Potência (cv)',
  cilindrada: 'Cilindrada (cm³)', cor: 'Cor', lugares: 'Lugares', portas: 'Portas', origem: 'Origem',
  matricula: 'Matrícula', ano_construcao: 'Ano de construção', registos_anteriores: 'Donos anteriores',
  garantia: 'Garantia', equipamento: 'Equipamento', descricao: 'Descrição',
};

/* As secções do data/definicoes.json, com o nome do ecrã (os rótulos do
   .pages.yml). SÃO TODAS OBRIGATÓRIAS menos a sede: o gerador lê-as sem
   perguntar (def.textos.aviso_visita, def.horario.map…) e, faltando uma,
   rebenta a meio. A sede social não existe hoje no ficheiro e o gerador não a
   usa: confere-se só quando está lá. */
export const SECCOES_DEFINICOES = {
  contactos: 'Contactos', stand: 'Morada do stand', horario: 'Horário', redes: 'Redes sociais',
  textos: 'Textos do site', opcoes: 'Opções', empresa: 'Dados legais da empresa', sede_social: 'Sede social',
};
/* O que o painel nunca muda: `tecnico` (o endereço do Worker da página /fotos/,
   que nenhum ecrã mostra e que sai à mão no dia da troca — plano §6). O Worker
   do painel recusa uma gravação do definicoes.json que o mude — ver
   mudancasBloqueadas(). Preserva-se e não se valida. */
export const BLOQUEADOS_DEFINICOES = ['tecnico'];

/* ------------------------------------------------------------------ */
/* Limites                                                             */
/* ------------------------------------------------------------------ */

/* Os números: [mínimo, máximo]. Inteiros, menos o preço (até 2 casas). O ano
   vai de 1950 ao ano seguinte ao de hoje (opcoes.hoje). */
export const LIMITES = {
  preco: [0, 1000000], km: [0, 2000000], potencia: [1, 2000], cilindrada: [1, 10000],
  lugares: [1, 9], portas: [1, 7], ordem: [0, 9999], registos_anteriores: [0, 30],
  anoMinimo: 1950,
};
/* Tamanhos máximos dos textos, em caracteres. Folgados: o maior de hoje é a
   descrição do Mercedes E 300 de, com 1428. */
export const TAMANHOS = {
  marca: 40, modelo: 60, versao: 120, cor: 40, garantia: 60, matricula: 15,
  equipamento: 120, equipamentoItens: 60, descricao: 6000, fotos: 50, caminhoFoto: 300,
  telefoneTexto: 20, email: 160, url: 500,
  morada: 120, localidade: 60, distrito: 40, pais: 40,
  horarioLinhas: 10, dias: 40, horas: 40,
  reclamo: 80, titulo: 80, heroTexto: 300, sobreTexto: 1500, locais: 120, avisoVisita: 200,
  nomeComercial: 80, denominacao: 160, formaJuridica: 80, capitalSocial: 40, cae: 120,
};
/* O que o Worker do painel aceita gravar (recusa acima); aqui só se lembra, a
   partir de 80 %. */
export const TECTOS = { viaturaBytes: 64 * 1024, definicoesBytes: 64 * 1024, aviso: 0.8 };
/* DL 84/2021, art. 12.º: num bem usado, a garantia de 3 anos só pode descer até
   18 meses, e por acordo. */
export const GARANTIA_MINIMA_USADOS = 18;

/* ------------------------------------------------------------------ */
/* Ajudantes que o painel e o Worker também usam                      */
/* ------------------------------------------------------------------ */

export const terminacaoDe = (texto) => (typeof texto === 'string' && texto.endsWith('\n') ? '\n' : '');
/* Como os ficheiros estão escritos: 2 espaços e a terminação de cada um (os das
   viaturas vêm do Pages CMS quase todos SEM \n no fim; o definicoes.json COM).
   Os 21 ficheiros de hoje saem daqui byte a byte. */
export function serializar(obj, terminacao = '') { return JSON.stringify(obj, null, 2) + (terminacao || ''); }

/* O endereço da página, a partir do nome do ficheiro — IGUAL ao slugDoFicheiro
   do scripts/gerar.mjs e ao do scripts/otimizar-imagens.py. */
export const slugDoFicheiro = (nome) => String(nome).replace(/\.json$/, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

/* NIF português: 9 algarismos, o primeiro nunca é 0, e o de controlo (módulo 11). */
export function nifValido(nif) {
  const s = typeof nif === 'number' ? String(nif) : nif;
  if (typeof s !== 'string' || !/^[1-9][0-9]{8}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(s[8]);
}

/* O SLUG DE UMA VIATURA NOVA: gerado UMA vez, ao criar, e nunca mais muda — é o
   endereço da página que o stand partilha no WhatsApp. Corrigir a marca não muda
   o endereço. Minúsculas, sem acentos, o resto passa a hífen.
   existentes: os slugs das duas pastas E os nomes das pastas da biblioteca
   (assets/veiculos/<x>/): uma viatura nova que caísse na pasta de fotografias
   de outra herdava-lhe as fotografias. Repetido: -2, -3… */
export function gerarSlug(marca, modelo, versao, existentes = []) {
  const ja = existentes instanceof Set ? existentes : new Set(existentes);
  let base = [marca, modelo, versao].map((x) => (x === null || x === undefined ? '' : String(x))).join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 80).replace(/-+$/, '');
  if (!base) base = 'viatura';
  let slug = base;
  for (let n = 2; ja.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/* UMA FOTOGRAFIA EXISTE PARA O SITE quando o scripts/gerar.mjs (fotos() →
   resolver()) a encontra: as larguras geradas em assets/fotos/<pasta>/, ou um
   ficheiro na pasta da biblioteca com o mesmo nome, ou com o mesmo nome sem a
   extensão. É a MESMA conta do gerador, e tem de ser: o que esta função diz que
   falta é exactamente o que o gerador deita fora da galeria (o
   .github/test-guardas.mjs compara as duas listas com o gerador verdadeiro).
   Um caminho sem pasta resolve-se na pasta da viatura, como lá.
   listarPasta(pasta) → os nomes do que está nessa pasta (ficheiros e pastas,
   como o readdirSync), ou [] se não existir. */
export function fotografiaExiste(caminho, slug, listarPasta) {
  const limpo = String(caminho).trim().replace(/^\/+/, '');
  const nome = limpo.split('/').pop();
  const pastaRel = limpo.includes('/') ? limpo.slice(0, limpo.lastIndexOf('/')) : `${BIBLIOTECA}/${slug}`;
  const base = nome.replace(/\.[a-z0-9]+$/i, '').replace(/-(?:480|960|1600)$/, '');
  const derivada = pastaRel === BIBLIOTECA || pastaRel.startsWith(BIBLIOTECA + '/') ? DERIVADAS + pastaRel.slice(BIBLIOTECA.length) : pastaRel;
  const listar = (p) => { const l = listarPasta(p); return Array.isArray(l) ? l : []; };
  const geradas = listar(derivada);
  if ([480, 960, 1600].some((w) => geradas.includes(`${base}-${w}.webp`))) return true;
  return listar(pastaRel).some((f) => f === nome || f.replace(/\.[a-z0-9]+$/i, '') === base);
}

/* OS MESES DE GARANTIA que um texto anuncia, ou null quando não diz um prazo
   («Garantia incluída», «Garantia mútuo acordo»). Como o gerador mostra: só
   algarismos são meses («18» → «Garantia 18 meses»). */
const NUMEROS_ESCRITOS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, doze: 12, dezoito: 18, 'vinte e quatro': 24, 'trinta e seis': 36 };
export function mesesDeGarantia(texto) {
  if (typeof texto !== 'string') return null;
  const s = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/^[0-9]{1,3}$/.test(s)) return Number(s);
  const palavras = Object.keys(NUMEROS_ESCRITOS).join('|');
  const m = s.match(new RegExp(`(?:^|[^0-9a-z])([0-9]{1,3}|${palavras})\\s*(mes|meses|ano|anos)(?![a-z])`));
  if (!m) return null;
  const n = /^[0-9]+$/.test(m[1]) ? Number(m[1]) : NUMEROS_ESCRITOS[m[1]];
  return m[2].startsWith('ano') ? n * 12 : n;
}

/* O **negrito** como o gerador o lê (textoRico() na descrição: dentro de cada
   parágrafo, sem asteriscos nem mudanças de linha lá dentro; o aviso da visita
   deixa mudanças de linha). O que sobrar de «**» aparece no site tal e qual. */
export function negritoCerto(s, { porParagrafo = true } = {}) {
  if (typeof s !== 'string') return true;
  const partes = porParagrafo ? s.replace(/\r\n?/g, '\n').split(/\n{2,}/) : [s];
  const re = porParagrafo ? /\*\*([^*\n]+)\*\*/g : /\*\*([^*]+)\*\*/g;
  return partes.every((p) => !p.replace(re, '$1').includes('**'));
}

/* ------------------------------------------------------------------ */
/* Pequenos ajustes internos                                          */
/* ------------------------------------------------------------------ */

const eObjecto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const tem = (o, k) => eObjecto(o) && Object.prototype.hasOwnProperty.call(o, k);
const ausente = (v) => v === undefined || v === null;
/* Vazio como o gerador o vê: limparCampos() apara os textos, e um texto só de
   espaços passa a nada. */
const vazio = (v) => ausente(v) || (typeof v === 'string' && v.trim() === '');
const temTexto = (v) => typeof v === 'string' && v.trim() !== '';
const inteiroEntre = (v, a, b) => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;
const duasCasas = (x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;
const bytesDe = (s) => new TextEncoder().encode(s).length;

/* Caracteres de controlo, por escape e nunca literais no código. Os
   separadores de linha U+2028/U+2029 ficam de fora: o gerador troca-os por
   mudanças de linha à entrada (há um na descrição do Opel Corsa). */
const RE_CONTROLO_LINHA = /[\u0000-\u001F\u007F]/;
const RE_CONTROLO_TEXTO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/* Num <script> do JSON-LD (o gerador escreve JSON.stringify(...) lá dentro, sem
   escapar o «<»), «</script» fecha o elemento a meio e «<!--» muda a forma como
   o browser o lê: a página parte-se, e o resto do JSON aparece como texto. */
const RE_PARTE_A_PAGINA = /<\/script|<!--/i;

const RE_TELEMOVEL = /^9[1236][0-9]{7}$/;
const RE_WHATSAPP = /^351[29][0-9]{8}$/;
const RE_TELEFONE_TEXTO = /^[0-9 +.-]+$/;
const RE_CP = /^[0-9]{4}-[0-9]{3}$/;
export const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/* Lenta de propósito: uma matrícula estrangeira, ou um formato antigo, não pode
   impedir o dono de gravar. Apanha o que não é matrícula nenhuma («não tem»). */
const RE_MATRICULA = /^[A-Za-z0-9]+(?:[- ][A-Za-z0-9]+)*$/;
/* O endereço da página: o que o painel gera (gerarSlug). */
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function urlHttps(v) {
  if (typeof v !== 'string' || !/^https:\/\/[^\s"'<>\\]+$/.test(v.trim())) return false;
  try { return new URL(v.trim()).protocol === 'https:'; } catch { return false; }
}

/* Um caminho de fotografia como o painel e o Pages CMS os escrevem: dentro de
   assets/veiculos/ (com ou sem a barra à frente), ou só o nome do ficheiro (o
   gerador procura-o na pasta da viatura). Nada de «..», «//», barras para trás,
   aspas, nem os sinais que partem um endereço (# ? %). Espaços, vírgulas e
   acentos aceitam-se: o gerador codifica-os (há uma «Cópia de Cópia de
   Stock.jpeg» no Nissan Patrol). */
const EXT = EXTENSOES_FOTO.join('|');
const RE_FOTO_CAMINHO = new RegExp(`^/?${BIBLIOTECA}/(?:[^/]+/)*[^/]+\\.(?:${EXT})$`, 'i');
const RE_FOTO_NOME = new RegExp(`^[^/]+\\.(?:${EXT})$`, 'i');
export function caminhoDeFotoValido(c) {
  if (typeof c !== 'string') return false;
  const s = c.trim();
  if (!s || s.length > TAMANHOS.caminhoFoto) return false;
  if (RE_CONTROLO_LINHA.test(s) || /["<>\\#?%]/.test(s)) return false;
  if (!(RE_FOTO_CAMINHO.test(s) || RE_FOTO_NOME.test(s))) return false;
  const partes = s.replace(/^\/+/, '').split('/');
  return partes.every((p) => p !== '' && p !== '.' && p !== '..' && p.trim() === p);
}

/* Igualdade de valores lidos de JSON, com null ≡ ausente e sem ligar à ordem
   das chaves. */
function mesmoValor(a, b) {
  if (ausente(a) && ausente(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => mesmoValor(x, b[i]));
  }
  if (eObjecto(a) || eObjecto(b)) {
    if (!eObjecto(a) || !eObjecto(b)) return false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!mesmoValor(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

/* Os textos de um valor (em profundidade), com o caminho de cada um. */
function textosDe(v, caminho = '') {
  if (typeof v === 'string') return [[caminho, v]];
  const filhos = Array.isArray(v) ? Array.from(v, (x, i) => [i, x]) : eObjecto(v) ? Object.entries(v) : [];
  return filhos.flatMap(([k, x]) => textosDe(x, caminho ? `${caminho}.${k}` : String(k)));
}

/* Lê um ficheiro: o TEXTO (string), o objecto já lido, ou null/undefined. */
function lerJson(valor) {
  if (ausente(valor)) return { ausente: true };
  if (typeof valor !== 'string') return { obj: valor, texto: null };
  try { return { obj: JSON.parse(valor), texto: valor }; } catch (e) { return { ilegivel: String((e && e.message) || e).slice(0, 120), texto: valor }; }
}

/* ------------------------------------------------------------------ */
/* Uma viatura                                                          */
/* ------------------------------------------------------------------ */

/* À venda NO SITE, como o gerador decide: publicada (tudo menos `false`) e não
   vendida. É a estas que a lei dos usados se aplica — o anúncio. */
export const aVendaNoSite = (v) => eObjecto(v) && v.publicado !== false && v.estado !== 'vendido';
export const nomeDaViatura = (v, slug) => {
  const n = eObjecto(v) ? ['marca', 'modelo', 'versao'].map((k) => v[k]).filter(temTexto).map((x) => x.trim()).join(' ') : '';
  return n || slug || 'viatura sem nome';
};
const ecraDaViatura = (v, slug, pasta) => `${pasta === 'vendidas' ? 'Vendidas' : 'Viaturas'} › ${nomeDaViatura(v, slug)}`;

/* Os problemas de UMA viatura, sem os que dependem das outras (o endereço
   repetido). O painel usa-o campo a campo.
   ctx = { nome, pasta ('viaturas' | 'vendidas'), imagemExiste?(caminho, slug),
           listarPasta?(pasta), hoje?: Date }
   Sem imagemExiste nem listarPasta, não se confere se as fotografias existem
   (só a forma do caminho). */
export function problemasDaViatura(v, ctx = {}) {
  const pasta = ctx.pasta === 'vendidas' ? 'vendidas' : 'viaturas';
  const nome = typeof ctx.nome === 'string' ? ctx.nome : '';
  const slug = slugDoFicheiro(nome);
  const ficheiro = ficheiroDaViatura(pasta, nome);
  const existe = typeof ctx.imagemExiste === 'function' ? ctx.imagemExiste
    : typeof ctx.listarPasta === 'function' ? (c, s) => fotografiaExiste(c, s, ctx.listarPasta) : null;
  const anoSeguinte = (ctx.hoje instanceof Date && !Number.isNaN(ctx.hoje.getTime()) ? ctx.hoje : new Date()).getFullYear() + 1;
  const out = [];
  const ecra = ecraDaViatura(v, slug, pasta);
  const base = { ficheiro, ecra, slug, pasta };
  const chave = (regra) => `viatura:${slug}:${regra}`;
  const neutraliza = (regra, efeito, campo, mensagem, extra = {}) => out.push({ classe: 'neutraliza', chave: chave(regra), campo, efeito, mensagem, ...base, ...extra });
  const avisa = (regra, campo, mensagem, extra = {}) => out.push({ classe: 'avisa', chave: chave(regra), campo, mensagem, ...base, ...extra });
  const lembra = (regra, campo, mensagem, extra = {}) => avisa(regra, campo, mensagem, { lembrete: true, ...extra });

  if (!eObjecto(v)) return out;   // a forma do ficheiro é do problemas(): bloqueia

  // --- neutraliza: o que o site não pode mostrar --------------------------
  /* Sem marca, o gerador escrevia «undefined» na faixa das marcas da página
     inicial e no filtro; sem modelo, o título da página ficava só a marca. */
  for (const [campo, nomeCampo] of [['marca', 'a marca'], ['modelo', 'o modelo']]) {
    const x = v[campo];
    if (vazio(x)) neutraliza(campo, 'esconder', campo, `Falta ${nomeCampo}: a viatura fica escondida do site até ${nomeCampo} estar preenchid${campo === 'marca' ? 'a' : 'o'}.`);
    else if (typeof x !== 'string') neutraliza(campo, 'esconder', campo, `${campo === 'marca' ? 'A marca' : 'O modelo'} tem de ser texto: a viatura fica escondida do site até ser corrigid${campo === 'marca' ? 'a' : 'o'}.`);
  }
  /* O que partia a página desta viatura: o gerador escreve o estado num
     atributo class, e o preço, o ano e os quilómetros em atributos data-, tal e
     qual (sem escapar); e qualquer texto vai para o JSON-LD, onde «</script» ou
     «<!--» partem o resto da página. Só um commit à mão chega aqui. */
  const partem = [];
  for (const campo of ['estado', 'preco', 'ano', 'km']) if (typeof v[campo] === 'string' && v[campo].includes('"')) partem.push(campo);
  for (const [caminho, t] of textosDe(v)) if (RE_PARTE_A_PAGINA.test(t)) partem.push(caminho.split('.')[0]);
  if (partem.length) {
    const campos = [...new Set(partem)];
    neutraliza('partia-a-pagina', 'esconder', campos[0], `${campos.map((c) => `«${NOMES_CAMPOS[c] || c}»`).join(', ')}: tem caracteres que partiam a página do site (aspas no estado ou num número, ou «</script» ou «<!--» num texto). A viatura fica escondida do site até isso ser corrigido.`, { campos });
  }

  // --- fotografias ---------------------------------------------------------
  const fotos = v.fotos;
  const lista = Array.isArray(fotos) ? fotos : [];
  if (!ausente(fotos) && !Array.isArray(fotos)) {
    avisa('fotos', 'fotos', 'As fotografias não estão gravadas como uma lista: o site mostra a pasta da viatura, por ordem de nome. Escolha-as outra vez.');
  }
  /* O gerador apara os caminhos e deita fora os vazios (limparCampos). Cada
     caminho distinto conta uma vez; o mesmo duas vezes aparece duas vezes na
     galeria (foi uma das queixas de 11/9/2026). */
  const vistos = new Set();
  lista.forEach((c, indice) => {
    if (typeof c === 'string' && c.trim() === '') return;
    const caminho = typeof c === 'string' ? c.trim() : c;
    const nomeFoto = typeof caminho === 'string' ? caminho.split('/').pop() : String(caminho);
    const extra = { foto: caminho, indice };
    if (!caminhoDeFotoValido(caminho)) {
      if (!vistos.has(`x:${String(caminho)}`)) {
        vistos.add(`x:${String(caminho)}`);
        neutraliza(`foto-invalida:${String(caminho)}`, 'sem_fotografia', 'fotos', `A fotografia «${nomeFoto.slice(0, 80)}» não é um ficheiro da biblioteca de fotografias: não aparece no site. Tire-a do anúncio e escolha-a outra vez.`, extra);
      }
      return;
    }
    const chaveFoto = caminho.replace(/^\/+/, '');
    if (vistos.has(chaveFoto)) {
      avisa(`foto-repetida:${chaveFoto}`, 'fotos', `A fotografia «${nomeFoto}» está duas vezes no anúncio: aparece repetida na galeria. Tire uma delas.`, extra);
      return;
    }
    vistos.add(chaveFoto);
    if (existe && !existe(caminho, slug)) {
      neutraliza(`foto-em-falta:${chaveFoto}`, 'sem_fotografia', 'fotos', `A fotografia «${nomeFoto}» já não está na biblioteca: não aparece no site. Tire-a do anúncio, ou carregue-a outra vez.`, extra);
    }
  });
  if (lista.length > TAMANHOS.fotos) avisa('fotos-a-mais', 'fotos', `O anúncio tem ${lista.length} fotografias; o máximo é ${TAMANHOS.fotos}. Tire as que estão a mais.`);

  // --- valores fora da lista (erro de campo no painel) --------------------
  const deLista = (campo, valores, obrigatorio, mensagem) => {
    const x = v[campo];
    if (vazio(x)) { if (obrigatorio) avisa(campo, campo, mensagem); return; }
    if (!valores.includes(x)) avisa(campo, campo, mensagem);
  };
  deLista('tipo', TIPOS, true, 'Escolha o tipo de veículo: Carro, Mota ou Off-road.');
  deLista('estado', ESTADOS, true, 'O estado tem de ser um destes: À venda, Reservado, Brevemente ou Vendido (sem isso o site mostra a viatura como «À venda»).');
  deLista('carrocaria', CARROCARIAS, false, `A carroçaria tem de ser uma destas: ${CARROCARIAS.join(', ')} (ou nenhuma).`);
  deLista('mes', MESES, false, 'O mês tem de ser um dos doze, escrito como na lista (ex.: Março), ou ficar vazio.');
  deLista('combustivel', COMBUSTIVEIS, false, `O combustível tem de ser um destes: ${COMBUSTIVEIS.join(', ')} (ou nenhum).`);
  deLista('caixa', CAIXAS, false, 'A caixa tem de ser Manual ou Automática (ou nenhuma).');
  deLista('origem', ORIGENS, false, 'A origem tem de ser Nacional ou Importado (ou nenhuma).');
  for (const b of BOOLEANOS_VIATURA) {
    if (!ausente(v[b]) && typeof v[b] !== 'boolean') avisa(b, b, `«${NOMES_CAMPOS[b]}» tem de ser sim ou não.`);
  }

  // --- números ----------------------------------------------------------------
  const numero = (campo, [min, max], mensagem, { casas = 0 } = {}) => {
    const x = v[campo];
    if (ausente(x) || x === '') return;
    const ok = typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max && (casas ? duasCasas(x) : Number.isInteger(x));
    if (!ok) avisa(campo, campo, mensagem);
  };
  numero('preco', LIMITES.preco, `O preço é só o número, sem € nem pontos (ex.: 18990), de 0 a ${LIMITES.preco[1].toLocaleString('pt-PT')} €.`, { casas: 2 });
  numero('km', LIMITES.km, 'Os quilómetros são só o número, sem pontos (ex.: 94000).');
  numero('potencia', LIMITES.potencia, `A potência é um número inteiro de cavalos, de 1 a ${LIMITES.potencia[1]}.`);
  numero('cilindrada', LIMITES.cilindrada, `A cilindrada é um número inteiro de cm³, de 1 a ${LIMITES.cilindrada[1]} (vazia nos eléctricos).`);
  numero('lugares', LIMITES.lugares, `Os lugares são um número de 1 a ${LIMITES.lugares[1]}.`);
  numero('portas', LIMITES.portas, `As portas são um número de 1 a ${LIMITES.portas[1]}.`);
  numero('ordem', LIMITES.ordem, `A ordem é um número inteiro de 0 a ${LIMITES.ordem[1]} (mais baixo aparece primeiro; 50 se for indiferente).`);
  numero('registos_anteriores', LIMITES.registos_anteriores, `Os donos anteriores são um número inteiro de 0 a ${LIMITES.registos_anteriores[1]} (sem contar o stand).`);
  numero('ano', [LIMITES.anoMinimo, anoSeguinte], `O ano é o da primeira matrícula, com 4 algarismos, de ${LIMITES.anoMinimo} a ${anoSeguinte}.`);
  numero('ano_construcao', [LIMITES.anoMinimo, anoSeguinte], `O ano de construção tem 4 algarismos, de ${LIMITES.anoMinimo} a ${anoSeguinte}.`);
  if (inteiroEntre(v.ano, LIMITES.anoMinimo, anoSeguinte) && inteiroEntre(v.ano_construcao, LIMITES.anoMinimo, anoSeguinte) && v.ano_construcao > v.ano) {
    avisa('ano_construcao:depois-da-matricula', 'ano_construcao', `O ano de construção (${v.ano_construcao}) não pode ser depois do ano da primeira matrícula (${v.ano}).`);
  }

  // --- textos -------------------------------------------------------------
  const texto = (campo, max, { linha = true } = {}) => {
    const x = v[campo];
    if (ausente(x)) return;
    if (typeof x !== 'string') { avisa(`${campo}:texto`, campo, `«${NOMES_CAMPOS[campo]}» tem de ser texto.`); return; }
    if (x.length > max) avisa(`${campo}:tamanho`, campo, `«${NOMES_CAMPOS[campo]}» tem mais de ${max} caracteres (tem ${x.length}).`);
    if ((linha ? RE_CONTROLO_LINHA : RE_CONTROLO_TEXTO).test(x)) avisa(`${campo}:controlo`, campo, `«${NOMES_CAMPOS[campo]}» tem caracteres invisíveis${linha ? ' (ex.: uma mudança de linha)' : ''}. Escreva-o outra vez.`);
  };
  texto('marca', TAMANHOS.marca);
  texto('modelo', TAMANHOS.modelo);
  texto('versao', TAMANHOS.versao);
  texto('cor', TAMANHOS.cor);
  texto('garantia', TAMANHOS.garantia);
  texto('matricula', TAMANHOS.matricula);
  texto('descricao', TAMANHOS.descricao, { linha: false });
  if (temTexto(v.matricula) && !(RE_MATRICULA.test(v.matricula.trim()) && /[0-9]/.test(v.matricula) && v.matricula.trim().length >= 4)) {
    avisa('matricula:formato', 'matricula', 'A matrícula escreve-se como no livrete, só letras, algarismos e hífens (ex.: AA-00-BB).');
  }
  if (typeof v.descricao === 'string' && !negritoCerto(v.descricao)) {
    avisa('descricao:negrito', 'descricao', 'Na descrição há um ** sem par: o negrito escreve-se **assim**, com o texto entre dois pares de asteriscos, na mesma linha. Sem par, os asteriscos aparecem no site.');
  }
  const eq = v.equipamento;
  if (!ausente(eq)) {
    if (!Array.isArray(eq)) avisa('equipamento', 'equipamento', 'O equipamento tem de ser uma lista, um por linha.');
    else {
      if (eq.length > TAMANHOS.equipamentoItens) avisa('equipamento:quantos', 'equipamento', `O equipamento tem ${eq.length} linhas; o máximo é ${TAMANHOS.equipamentoItens}.`);
      if (eq.some((x) => !ausente(x) && typeof x !== 'string')) avisa('equipamento:texto', 'equipamento', 'Cada linha do equipamento tem de ser texto.');
      if (eq.some((x) => typeof x === 'string' && x.length > TAMANHOS.equipamento)) avisa('equipamento:tamanho', 'equipamento', `Há uma linha do equipamento com mais de ${TAMANHOS.equipamento} caracteres: escreva-o curto (ex.: Câmara de marcha-atrás).`);
      if (eq.some((x) => typeof x === 'string' && RE_CONTROLO_LINHA.test(x))) avisa('equipamento:controlo', 'equipamento', 'Há uma linha do equipamento com caracteres invisíveis. Escreva-a outra vez.');
    }
  }

  // --- lembretes: o que a lei pede ao anúncio (só as que estão à venda) ----
  if (aVendaNoSite(v)) {
    const LEI = 'a lei dos usados (DL 74/93) obriga a mostrá-l';
    if (vazio(v.matricula)) lembra('sem-matricula', 'matricula', `Falta a matrícula: ${LEI}a no anúncio.`);
    if (vazio(v.registos_anteriores)) lembra('sem-donos', 'registos_anteriores', `Faltam os donos anteriores (0 se não teve nenhum além do stand): ${LEI}os no anúncio.`);
    if (vazio(v.ano)) lembra('sem-ano', 'ano', `Falta o ano da primeira matrícula: ${LEI}o no anúncio.`);
    /* O ano de construção só é obrigatório quando é diferente do da matrícula,
       e isso não se sabe daqui: a ajuda do campo diz quando. Lembrá-lo em todas
       as viaturas era ruído — e um ano de construção preenchido igual ao da
       matrícula não é erro. Confere-se quando está lá (acima). */
    if (!(typeof v.preco === 'number' && v.preco > 0)) {
      lembra('sem-preco', 'preco', 'Sem preço, o site mostra «Sob consulta». A lei pede o preço final, com impostos, em tudo o que está à venda (DL 138/90).');
    }
    if (vazio(v.km)) lembra('sem-km', 'km', 'Faltam os quilómetros: aparecem no cartão e na ficha da viatura.');
    if (!lista.some((c) => typeof c === 'string' && c.trim() !== '')) lembra('sem-fotos', 'fotos', 'O anúncio não tem fotografias escolhidas. A primeira é a capa e a imagem das partilhas no WhatsApp.');
    const meses = mesesDeGarantia(v.garantia);
    if (meses !== null && meses < GARANTIA_MINIMA_USADOS) {
      lembra('garantia-curta', 'garantia', `A garantia anunciada («${v.garantia.trim()}») é menor do que ${GARANTIA_MINIMA_USADOS} meses: num usado, a lei só deixa reduzir a garantia até ${GARANTIA_MINIMA_USADOS} meses, e por acordo escrito com o comprador (DL 84/2021, art. 12.º).`);
    }
    if (meses === 36) {
      lembra('garantia-3-anos', 'garantia', `A garantia diz «${v.garantia.trim()}». O stand não anuncia 3 anos de garantia nos usados (são ${GARANTIA_MINIMA_USADOS} meses, por acordo). Se for a garantia de fábrica da marca, escreva-o assim (ex.: «Garantia de fábrica até 2027»).`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* data/definicoes.json                                                */
/* ------------------------------------------------------------------ */

export function problemasDasDefinicoes(d) {
  const ficheiro = FICHEIROS.definicoes;
  const out = [];
  const ecraDe = (seccao) => `Dados do stand › ${SECCOES_DEFINICOES[seccao]}`;
  const bloqueia = (chave, seccao, campo, mensagem) => out.push({ classe: 'bloqueia', chave: `definicoes:${chave}`, ficheiro, ecra: seccao ? ecraDe(seccao) : 'Dados do stand', campo, mensagem });
  const avisa = (chave, seccao, campo, mensagem, extra = {}) => out.push({ classe: 'avisa', chave: `definicoes:${chave}`, ficheiro, ecra: seccao ? ecraDe(seccao) : 'Dados do stand', campo, mensagem, ...extra });
  if (!eObjecto(d)) { bloqueia('forma', null, undefined, 'Os dados do stand não têm a forma certa. Só o Renato os pode corrigir.'); return out; }

  /* As secções que o gerador lê sem perguntar. */
  for (const s of ['contactos', 'stand', 'redes', 'textos', 'opcoes', 'empresa']) {
    if (!eObjecto(d[s])) bloqueia(`${s}:forma`, s, s, `A secção «${SECCOES_DEFINICOES[s]}» não está gravada (sem ela o site não se consegue gerar). Só o Renato a pode repor.`);
  }
  if (!Array.isArray(d.horario)) bloqueia('horario:forma', 'horario', 'horario', 'O horário não está gravado como uma lista de linhas (sem ele o site não se consegue gerar). Só o Renato o pode repor.');

  /* Um texto que o gerador escreve no JSON-LD de todas as páginas. */
  const partidos = textosDe(Object.fromEntries(Object.entries(d).filter(([k]) => !BLOQUEADOS_DEFINICOES.includes(k)))).filter(([, t]) => RE_PARTE_A_PAGINA.test(t));
  if (partidos.length) {
    const seccao = partidos[0][0].split('.')[0];
    bloqueia('partia-a-pagina', tem(SECCOES_DEFINICOES, seccao) ? seccao : null, partidos[0][0], 'Um texto tem «</script» ou «<!--», que partiam todas as páginas do site. Apague-o e escreva outra vez.');
  }

  const textoSimples = (valor, chave, seccao, campo, nome, max, { obrigatorio = false, linha = true, classeVazio = 'avisa' } = {}) => {
    if (vazio(valor)) {
      if (obrigatorio) (classeVazio === 'bloqueia' ? bloqueia : avisa)(chave, seccao, campo, `${nome} está vazio${classeVazio === 'bloqueia' ? ' (a lei obriga a mostrá-lo)' : ''}.`);
      return false;
    }
    if (typeof valor !== 'string') { (classeVazio === 'bloqueia' ? bloqueia : avisa)(chave, seccao, campo, `${nome} tem de ser texto.`); return false; }
    if (valor.length > max) avisa(`${chave}:tamanho`, seccao, campo, `${nome} tem mais de ${max} caracteres (tem ${valor.length}).`);
    if ((linha ? RE_CONTROLO_LINHA : RE_CONTROLO_TEXTO).test(valor)) avisa(`${chave}:controlo`, seccao, campo, `${nome} tem caracteres invisíveis. Escreva-o outra vez.`);
    return true;
  };

  // --- contactos ------------------------------------------------------------
  /* O gerador escreve os telefones e o WhatsApp TAL E QUAL nos endereços
     (tel:+351…, wa.me/…) e o «como aparece» tal e qual no HTML, em todas as
     páginas: um valor fora da forma parte os botões de ligar do site inteiro.
     E junto de cada número o site diz «Chamada para a rede móvel nacional» (a
     nota está no gerador, DL 59/2021): por isso só números de telemóvel. */
  const c = d.contactos;
  if (eObjecto(c)) {
    const telefone = (n, obrigatorio) => {
      const num = c[`telefone_${n}`]; const txt = c[`telefone_${n}_texto`];
      const campoNum = `contactos.telefone_${n}`; const campoTxt = `contactos.telefone_${n}_texto`;
      if (!obrigatorio && vazio(num) && vazio(txt)) {
        avisa(`contactos.telefone_${n}:vazio`, 'contactos', campoNum, `Sem o telefone ${n}, o rodapé e a página de Contactos mostram uma linha de telefone vazia.`, { lembrete: true });
        return;
      }
      if (vazio(num)) bloqueia(`contactos.telefone_${n}`, 'contactos', campoNum, `O telefone ${n} (só dígitos) está vazio${obrigatorio ? ': é o número dos botões «Ligar» de todas as páginas' : ', e o «como aparece» está preenchido'}.`);
      else if (!(typeof num === 'string' && RE_TELEMOVEL.test(num))) bloqueia(`contactos.telefone_${n}`, 'contactos', campoNum, `O telefone ${n} tem de ser um número de telemóvel português, com 9 algarismos e sem espaços (ex.: 961053363): o site diz «Chamada para a rede móvel nacional» junto dele.`);
      if (vazio(txt)) bloqueia(`contactos.telefone_${n}_texto`, 'contactos', campoTxt, `O telefone ${n} (como aparece) está vazio: é o que se lê no site (ex.: 961 053 363).`);
      else {
        const digitos = typeof txt === 'string' ? txt.replace(/[^0-9]/g, '').replace(/^351(?=[0-9]{9}$)/, '') : '';
        if (!(typeof txt === 'string' && RE_TELEFONE_TEXTO.test(txt) && txt.length <= TAMANHOS.telefoneTexto)) bloqueia(`contactos.telefone_${n}_texto`, 'contactos', campoTxt, `O telefone ${n} (como aparece) só pode ter algarismos e espaços (ex.: 961 053 363).`);
        else if (typeof num === 'string' && RE_TELEMOVEL.test(num) && digitos !== num) bloqueia(`contactos.telefone_${n}_texto`, 'contactos', campoTxt, `O telefone ${n} (como aparece) não é o mesmo número do telefone ${n} (só dígitos): o site mostrava um número e ligava para outro.`);
      }
    };
    telefone(1, true);
    telefone(2, false);
    if (vazio(c.whatsapp)) bloqueia('contactos.whatsapp', 'contactos', 'contactos.whatsapp', 'O WhatsApp está vazio: é para onde vão os botões «WhatsApp» de todas as páginas.');
    else if (!(typeof c.whatsapp === 'string' && RE_WHATSAPP.test(c.whatsapp))) bloqueia('contactos.whatsapp', 'contactos', 'contactos.whatsapp', 'O WhatsApp escreve-se 351 e o número, só algarismos, sem espaços nem + (ex.: 351961053363).');
    if (!vazio(c.email) && !(typeof c.email === 'string' && c.email.length <= TAMANHOS.email && RE_EMAIL.test(c.email.trim()))) {
      avisa('contactos.email', 'contactos', 'contactos.email', 'O email não está bem escrito (ex.: geral@lrmotorsautomoveis.pt — sem acentos nem espaços), ou fica vazio.');
    }
  }

  // --- morada do stand (DL 7/2004: o endereço geográfico) -------------------
  const s = d.stand;
  if (eObjecto(s)) {
    textoSimples(s.morada, 'stand.morada', 'stand', 'stand.morada', 'A rua do stand', TAMANHOS.morada, { obrigatorio: true, classeVazio: 'bloqueia' });
    if (vazio(s.codigo_postal)) bloqueia('stand.codigo_postal', 'stand', 'stand.codigo_postal', 'O código postal do stand está vazio (a lei obriga a mostrar a morada).');
    else if (!(typeof s.codigo_postal === 'string' && RE_CP.test(s.codigo_postal.trim()))) bloqueia('stand.codigo_postal', 'stand', 'stand.codigo_postal', 'O código postal escreve-se 0000-000.');
    textoSimples(s.localidade, 'stand.localidade', 'stand', 'stand.localidade', 'A localidade do stand', TAMANHOS.localidade, { obrigatorio: true, classeVazio: 'bloqueia' });
    textoSimples(s.distrito, 'stand.distrito', 'stand', 'stand.distrito', 'O distrito do stand', TAMANHOS.distrito, { obrigatorio: true });
    textoSimples(s.pais, 'stand.pais', 'stand', 'stand.pais', 'O país', TAMANHOS.pais);
    if (!vazio(s.mapa) && !(urlHttps(s.mapa) && s.mapa.length <= TAMANHOS.url)) avisa('stand.mapa', 'stand', 'stand.mapa', 'O link do Google Maps tem de começar por https:// (copie-o do botão «Partilhar» do Google Maps).');
    /* As coordenadas vão tal e qual para o endereço do botão «Como chegar»: um
       texto podia partir a página; em falta, o botão fica sem destino. */
    for (const k of ['latitude', 'longitude']) {
      const x = s[k];
      const campo = `stand.${k}`;
      const nome = k === 'latitude' ? 'A latitude' : 'A longitude';
      const max = k === 'latitude' ? 90 : 180;
      if (ausente(x) || x === '') avisa(`stand.${k}`, 'stand', campo, `${nome} do stand está vazia: o botão «Como chegar» fica sem destino.`);
      else if (typeof x !== 'number' || !Number.isFinite(x)) bloqueia(`stand.${k}:forma`, 'stand', campo, `${nome} do stand tem de ser um número (ex.: 41.6469), sem texto à volta.`);
      else if (Math.abs(x) > max) avisa(`stand.${k}`, 'stand', campo, `${nome} do stand não é uma coordenada (vai de -${max} a ${max}).`);
    }
  }

  // --- horário -----------------------------------------------------------
  const h = d.horario;
  if (Array.isArray(h)) {
    if (h.length === 0) avisa('horario:vazio', 'horario', 'horario', 'O horário está vazio: o rodapé e a página de Contactos ficam sem horário.');
    if (h.length > TAMANHOS.horarioLinhas) avisa('horario:linhas', 'horario', 'horario', `O horário tem ${h.length} linhas; o máximo é ${TAMANHOS.horarioLinhas}.`);
    h.forEach((linha, i) => {
      if (!eObjecto(linha)) { bloqueia(`horario.${i + 1}:forma`, 'horario', `horario.${i}`, `A ${i + 1}.ª linha do horário não está preenchida (sem ela o site não se consegue gerar). Apague-a e escreva-a outra vez.`); return; }
      textoSimples(linha.dias, `horario.${i + 1}.dias`, 'horario', `horario.${i}.dias`, `Na ${i + 1}.ª linha do horário, os dias`, TAMANHOS.dias, { obrigatorio: true });
      textoSimples(linha.horas, `horario.${i + 1}.horas`, 'horario', `horario.${i}.horas`, `Na ${i + 1}.ª linha do horário, as horas`, TAMANHOS.horas, { obrigatorio: true });
    });
  }

  // --- redes sociais --------------------------------------------------------
  const r = d.redes;
  if (eObjecto(r)) {
    for (const [k, nome] of [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']]) {
      if (!vazio(r[k]) && !(urlHttps(r[k]) && r[k].length <= TAMANHOS.url)) avisa(`redes.${k}`, 'redes', `redes.${k}`, `O endereço do ${nome} tem de começar por https:// (copie-o do browser), ou fica vazio.`);
    }
  }

  // --- textos do site -------------------------------------------------------
  const t = d.textos;
  if (eObjecto(t)) {
    textoSimples(t.reclamo, 'textos.reclamo', 'textos', 'textos.reclamo', 'A frase da marca', TAMANHOS.reclamo, { obrigatorio: true });
    textoSimples(t.hero_titulo, 'textos.hero_titulo', 'textos', 'textos.hero_titulo', 'O título da página inicial', TAMANHOS.titulo, { obrigatorio: true });
    textoSimples(t.hero_texto, 'textos.hero_texto', 'textos', 'textos.hero_texto', 'O texto da página inicial', TAMANHOS.heroTexto, { obrigatorio: true, linha: false });
    textoSimples(t.sobre_titulo, 'textos.sobre_titulo', 'textos', 'textos.sobre_titulo', 'O título do «Sobre nós»', TAMANHOS.titulo, { obrigatorio: true });
    textoSimples(t.sobre_texto, 'textos.sobre_texto', 'textos', 'textos.sobre_texto', 'O texto do «Sobre nós»', TAMANHOS.sobreTexto, { obrigatorio: true, linha: false });
    textoSimples(t.locais, 'textos.locais', 'textos', 'textos.locais', 'O «Onde estamos»', TAMANHOS.locais);
    /* O gerador faz (aviso_visita || '').trim(): um número ou uma lista aqui
       rebentava a geração do site inteiro. */
    const av = t.aviso_visita;
    if (!ausente(av) && typeof av !== 'string') bloqueia('textos.aviso_visita:forma', 'textos', 'textos.aviso_visita', 'O aviso sobre visitas noutro local tem de ser texto (sem isso o site não se consegue gerar). Apague-o e escreva outra vez.');
    else if (textoSimples(av, 'textos.aviso_visita', 'textos', 'textos.aviso_visita', 'O aviso sobre visitas noutro local', TAMANHOS.avisoVisita) && !negritoCerto(av, { porParagrafo: false })) {
      avisa('textos.aviso_visita:negrito', 'textos', 'textos.aviso_visita', 'No aviso sobre visitas há um ** sem par: o negrito escreve-se **assim**. Sem par, os asteriscos aparecem no site.');
    }
  }

  // --- opções --------------------------------------------------------------
  const o = d.opcoes;
  if (eObjecto(o) && typeof o.mostrar_vendidos !== 'boolean') {
    avisa('opcoes.mostrar_vendidos', 'opcoes', 'opcoes.mostrar_vendidos', '«Mostrar secção "Já vendidas"» não está gravado (sim ou não): vale como «não».');
  }

  // --- dados legais da empresa (CSC art. 171.º) ------------------------------
  /* Vale mais o site ficar na versão anterior do que ir para o ar sem eles. */
  const e = d.empresa;
  if (eObjecto(e)) {
    textoSimples(e.denominacao_social, 'empresa.denominacao_social', 'empresa', 'empresa.denominacao_social', 'A denominação social', TAMANHOS.denominacao, { obrigatorio: true, classeVazio: 'bloqueia' });
    textoSimples(e.forma_juridica, 'empresa.forma_juridica', 'empresa', 'empresa.forma_juridica', 'A forma jurídica', TAMANHOS.formaJuridica, { obrigatorio: true, classeVazio: 'bloqueia' });
    if (vazio(e.nif)) bloqueia('empresa.nif', 'empresa', 'empresa.nif', 'O NIF está vazio (a lei obriga a mostrá-lo).');
    else if (!nifValido(typeof e.nif === 'string' ? e.nif.trim() : e.nif)) bloqueia('empresa.nif', 'empresa', 'empresa.nif', 'O NIF não é válido (9 algarismos, o primeiro não é 0, e o último tem de bater certo com os outros). Confira-o na certidão.');
    if (textoSimples(e.capital_social, 'empresa.capital_social', 'empresa', 'empresa.capital_social', 'O capital social', TAMANHOS.capitalSocial, { obrigatorio: true, classeVazio: 'bloqueia' }) && !/[0-9]/.test(e.capital_social)) {
      avisa('empresa.capital_social:formato', 'empresa', 'empresa.capital_social', 'O capital social escreve-se em euros, com algarismos (ex.: 20.000,00 €).');
    }
    textoSimples(e.nome_comercial, 'empresa.nome_comercial', 'empresa', 'empresa.nome_comercial', 'O nome comercial', TAMANHOS.nomeComercial, { obrigatorio: true });
    textoSimples(e.cae, 'empresa.cae', 'empresa', 'empresa.cae', 'O CAE', TAMANHOS.cae);
  }

  // --- sede social (opcional: hoje não está no ficheiro) ---------------------
  const sd = d.sede_social;
  if (!ausente(sd)) {
    if (!eObjecto(sd)) avisa('sede_social', 'sede_social', 'sede_social', 'A sede social não tem a forma certa: apague-a e escreva-a outra vez.');
    else {
      const preenchida = ['morada', 'codigo_postal', 'localidade'].some((k) => !vazio(sd[k]));
      if (preenchida) {
        textoSimples(sd.morada, 'sede_social.morada', 'sede_social', 'sede_social.morada', 'A rua da sede', TAMANHOS.morada, { obrigatorio: true });
        textoSimples(sd.localidade, 'sede_social.localidade', 'sede_social', 'sede_social.localidade', 'A localidade da sede', TAMANHOS.localidade, { obrigatorio: true });
        if (vazio(sd.codigo_postal) || !(typeof sd.codigo_postal === 'string' && RE_CP.test(sd.codigo_postal.trim()))) {
          avisa('sede_social.codigo_postal', 'sede_social', 'sede_social.codigo_postal', 'O código postal da sede escreve-se 0000-000.');
        }
      }
      textoSimples(sd.distrito, 'sede_social.distrito', 'sede_social', 'sede_social.distrito', 'O distrito da sede', TAMANHOS.distrito);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Todos                                                               */
/* ------------------------------------------------------------------ */

/* problemas(dados, opcoes)
 *   dados:  ver o cabeçalho;
 *   opcoes: { imagemExiste?(caminho, slug) → boolean, listarPasta?(pasta) →
 *             nomes — o que o gerador vê, para fotografiaExiste();
 *             hoje?: Date — o «ano seguinte» dos anos }
 *   → [problema]: primeiro as definições, depois as viaturas por nome. */
export function problemas(dados = {}, opcoes = {}) {
  const lista = [];
  const d = eObjecto(dados) ? dados : {};

  if (tem(d, 'definicoes')) {
    const ficheiro = FICHEIROS.definicoes;
    const l = lerJson(d.definicoes);
    if (l.ausente) lista.push({ classe: 'bloqueia', chave: 'definicoes:ausente', ficheiro, ecra: 'Dados do stand', mensagem: `Falta o ficheiro ${ficheiro}: sem ele o site não se consegue gerar. Só o Renato o pode repor.` });
    else if (l.ilegivel) lista.push({ classe: 'bloqueia', chave: 'definicoes:ilegivel', ficheiro, ecra: 'Dados do stand', mensagem: `Os dados do stand não se conseguem ler (JSON inválido: ${l.ilegivel}). Só o Renato os pode corrigir.` });
    else {
      lista.push(...problemasDasDefinicoes(l.obj));
      const bytes = l.texto !== null ? bytesDe(l.texto) : bytesDe(serializar(l.obj));
      if (bytes > TECTOS.definicoesBytes * TECTOS.aviso) {
        lista.push({ classe: 'avisa', chave: 'definicoes:tecto', ficheiro, ecra: 'Dados do stand', lembrete: true, mensagem: `Os dados do stand estão a chegar ao limite do painel (${Math.round(bytes / 1024)} de ${TECTOS.definicoesBytes / 1024} KB). Encurte os textos mais compridos.` });
      }
    }
  }

  const porSlug = new Map();   // slug → [ficheiro]
  for (const pasta of ['viaturas', 'vendidas']) {
    const mapa = d[pasta];
    if (!eObjecto(mapa)) continue;
    for (const nome of Object.keys(mapa).sort()) {
      const valor = mapa[nome];
      if (ausente(valor)) continue;
      const slug = slugDoFicheiro(nome);
      const ficheiro = ficheiroDaViatura(pasta, nome);
      const ecra = `${pasta === 'vendidas' ? 'Vendidas' : 'Viaturas'} › ${slug || nome}`;
      const base = { ficheiro, slug, pasta };
      if (!slug) {
        /* «--.json» daria o endereço viaturas//, que é a página da listagem: o
           gerador escrevia esta viatura POR CIMA da lista de viaturas. */
        lista.push({ classe: 'bloqueia', chave: `viatura:${nome}:endereco-vazio`, ecra, ...base, mensagem: `O ficheiro ${ficheiro} não dá endereço nenhum (o nome só tem hífens): o site escrevia esta viatura por cima da lista de viaturas. Só o Renato o pode corrigir.` });
        continue;
      }
      porSlug.set(slug, [...(porSlug.get(slug) || []), ficheiro]);
      const l = lerJson(valor);
      if (l.ilegivel) { lista.push({ classe: 'bloqueia', chave: `viatura:${slug}:ilegivel`, ecra, ...base, mensagem: `O ficheiro desta viatura não se consegue ler (JSON inválido: ${l.ilegivel}). Só o Renato o pode corrigir.` }); continue; }
      if (!eObjecto(l.obj)) { lista.push({ classe: 'bloqueia', chave: `viatura:${slug}:forma`, ecra, ...base, mensagem: 'O ficheiro desta viatura não tem a forma de uma viatura (sem ela o site não se consegue gerar). Só o Renato o pode corrigir.' }); continue; }
      if (!RE_SLUG.test(slug)) {
        lista.push({ classe: 'avisa', chave: `viatura:${slug}:endereco`, ecra: ecraDaViatura(l.obj, slug, pasta), ...base, mensagem: `O endereço desta página («${slug}») não é como os outros (só minúsculas, algarismos e hífens): o site publica-a na mesma, mas o painel não lhe consegue guardar fotografias. Só o Renato o pode corrigir.` });
      }
      lista.push(...problemasDaViatura(l.obj, { nome, pasta, imagemExiste: opcoes.imagemExiste, listarPasta: opcoes.listarPasta, hoje: opcoes.hoje }));
      const bytes = l.texto !== null ? bytesDe(l.texto) : bytesDe(serializar(l.obj));
      if (bytes > TECTOS.viaturaBytes * TECTOS.aviso) {
        lista.push({ classe: 'avisa', chave: `viatura:${slug}:tecto`, ecra: ecraDaViatura(l.obj, slug, pasta), ...base, lembrete: true, mensagem: `Esta viatura está a chegar ao limite do painel (${Math.round(bytes / 1024)} de ${TECTOS.viaturaBytes / 1024} KB): encurte a descrição ou o equipamento.` });
      }
    }
  }
  /* Duas viaturas com o mesmo endereço: o gerador PÁRA (uma escrevia a página da
     outra), e a arrumação das vendidas recusa mover uma por cima da outra. É o
     que acontece se se criar outra vez, em Viaturas, uma viatura que já está
     nas Vendidas. */
  for (const [slug, ficheiros] of porSlug) {
    if (ficheiros.length < 2) continue;
    lista.push({
      classe: 'bloqueia', chave: `viatura:${slug}:repetida`, ficheiro: ficheiros[0], ficheiros, slug, ecra: `Viaturas › ${slug}`,
      mensagem: `Há ${ficheiros.length} viaturas com o mesmo endereço («${slug}»): ${ficheiros.join(' e ')}. Apague a que está a mais (provavelmente a das Vendidas, se a viatura voltou ao stock).`,
    });
  }
  return lista;
}

/* ------------------------------------------------------------------ */
/* A cópia que o gerador lê                                            */
/* ------------------------------------------------------------------ */

/* neutralizar(dados, lista) → { ficheiros, efeitos, mudou }
 *   Os problemas «neutraliza» aplicados a uma CÓPIA das viaturas:
 *     · esconder       — publicado: false (sai do site, como um rascunho);
 *     · sem_fotografia — um caminho que não é da biblioteca sai da lista.
 *       Uma fotografia que simplesmente já não existe FICA na lista: o gerador
 *       já a deixa fora da galeria (é a mesma conta — fotografiaExiste()), e
 *       tirá-la podia esvaziar a lista, que o gerador lê como «mostra a pasta
 *       da viatura toda» — e voltavam ao site fotografias que o dono tirou do
 *       anúncio. O efeito no site é o mesmo, e conta nos efeitos.
 *   ficheiros: { <caminho>: texto } — SÓ os que mudam, serializados com a
 *              terminação que tinham (quem os escreve só os escreve com mudou);
 *   efeitos:   o que muda NO SITE, por viatura:
 *              [{ ficheiro, slug, pasta, nome, efeitos: [...], motivos: [...], fotos: [...] }]
 *              Uma viatura já escondida não conta, nem as fotografias dela;
 *   mudou:     false → a cópia é o repositório, byte a byte. */
export function neutralizar(dados = {}, lista = []) {
  const d = eObjecto(dados) ? dados : {};
  const porFicheiro = new Map();
  for (const p of Array.isArray(lista) ? lista : []) {
    if (p && p.classe === 'neutraliza' && typeof p.ficheiro === 'string') porFicheiro.set(p.ficheiro, [...(porFicheiro.get(p.ficheiro) || []), p]);
  }
  const ficheiros = {};
  const efeitos = [];
  for (const pasta of ['viaturas', 'vendidas']) {
    const mapa = d[pasta];
    if (!eObjecto(mapa)) continue;
    for (const nome of Object.keys(mapa).sort()) {
      const ficheiro = ficheiroDaViatura(pasta, nome);
      const prs = porFicheiro.get(ficheiro);
      if (!prs) continue;
      const l = lerJson(mapa[nome]);
      if (!eObjecto(l.obj)) continue;
      const v = JSON.parse(JSON.stringify(l.obj));
      const noSite = v.publicado !== false;
      const feitos = []; const motivos = []; const fotos = [];
      let mudou = false;
      if (prs.some((p) => p.efeito === 'esconder')) {
        if (noSite) { v.publicado = false; mudou = true; feitos.push('esconder'); }
        motivos.push(...prs.filter((p) => p.efeito === 'esconder').map((p) => p.mensagem));
      }
      const invalidas = new Set(prs.filter((p) => p.efeito === 'sem_fotografia' && p.chave.includes(':foto-invalida:')).map((p) => String(p.foto)));
      if (invalidas.size && Array.isArray(v.fotos)) {
        const antes = v.fotos.length;
        v.fotos = v.fotos.filter((c) => !invalidas.has(String(typeof c === 'string' ? c.trim() : c)));
        if (v.fotos.length !== antes) mudou = true;
      }
      const semFoto = prs.filter((p) => p.efeito === 'sem_fotografia');
      if (semFoto.length && noSite && !feitos.includes('esconder')) {
        feitos.push('sem_fotografia');
        motivos.push(...semFoto.map((p) => p.mensagem));
        fotos.push(...semFoto.map((p) => p.foto));
      }
      if (mudou) ficheiros[ficheiro] = serializar(v, terminacaoDe(l.texto));
      if (feitos.length) efeitos.push({ ficheiro, slug: slugDoFicheiro(nome), pasta, nome: nomeDaViatura(l.obj, slugDoFicheiro(nome)), efeitos: feitos, motivos, fotos });
    }
  }
  return { ficheiros, efeitos, mudou: Object.keys(ficheiros).length > 0 };
}

const DESCRICAO_EFEITOS = { esconder: 'escondida do site', sem_fotografia: 'com fotografias que não aparecem' };
export const descreverEfeitos = (e) => e.efeitos.map((x) => (x === 'sem_fotografia' && e.fotos.length ? `${e.fotos.length} fotografia${e.fotos.length === 1 ? '' : 's'} que não aparece${e.fotos.length === 1 ? '' : 'm'}` : DESCRICAO_EFEITOS[x] || x)).join(' e ');

/* ------------------------------------------------------------------ */
/* O que o painel não pode mudar ao gravar                             */
/* ------------------------------------------------------------------ */

/* mudancasBloqueadas(antes, depois, qual) → [{ caminho, motivo }] ([] = pode gravar)
 *   qual = 'definicoes': o `tecnico` não muda, e uma chave de topo nova só pode
 *          ser uma das SECCOES_DEFINICOES (uma secção que o ficheiro perdeu
 *          volta pelo painel; nenhuma outra se inventa);
 *   qual = 'viatura':    as chaves que não são CAMPOS_VIATURA não mudam (nem
 *          aparecem, nem desaparecem): o painel preserva o que não edita. */
export function mudancasBloqueadas(antes, depois, qual = 'definicoes') {
  const a = eObjecto(antes) ? antes : {};
  const d = eObjecto(depois) ? depois : {};
  const out = [];
  if (qual === 'viatura') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
      if (CAMPOS_VIATURA.includes(k) || mesmoValor(a[k], d[k])) continue;
      out.push({ caminho: k, motivo: tem(a, k) ? 'mudou' : 'chave_nova' });
    }
    return out;
  }
  for (const caminho of BLOQUEADOS_DEFINICOES) {
    if (!mesmoValor(a[caminho], d[caminho])) out.push({ caminho, motivo: 'mudou' });
  }
  for (const k of Object.keys(d)) {
    if (tem(a, k) || tem(SECCOES_DEFINICOES, k) || out.some((x) => x.caminho === k)) continue;
    out.push({ caminho: k, motivo: 'chave_nova' });
  }
  return out;
}

/* A ORDEM DAS CHAVES AO GRAVAR (plano §3): as que já estavam no ficheiro ficam
   onde estavam; uma nova entra antes da primeira que, no .pages.yml, vem
   depois dela (e no fim, se nenhuma vier); as que o .pages.yml não conhece vão
   para o fim. As que saíram, saem. */
export function ordenarComo(antes, depois, ordem = CAMPOS_VIATURA) {
  if (!eObjecto(depois)) return depois;
  const a = eObjecto(antes) ? antes : {};
  const chaves = Object.keys(a).filter((k) => tem(depois, k));
  const novas = Object.keys(depois).filter((k) => !chaves.includes(k));
  for (const k of novas.filter((x) => ordem.includes(x))) {
    const i = ordem.indexOf(k);
    const j = chaves.findIndex((x) => ordem.includes(x) && ordem.indexOf(x) > i);
    if (j < 0) chaves.push(k); else chaves.splice(j, 0, k);
  }
  chaves.push(...novas.filter((x) => !ordem.includes(x)));
  const out = {};
  for (const k of chaves) out[k] = depois[k];
  return out;
}
