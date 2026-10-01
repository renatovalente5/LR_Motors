/* AS REGRAS DOS DADOS DA LR MOTORS, NUM SÓ SÍTIO.
 *
 * Quatro leitores, e os quatro têm de ouvir o mesmo:
 *   · o CI do site (.github/guardas.mjs), antes de gerar o site;
 *   · o gerador (scripts/gerar.mjs), que tira daqui o horário que dá ao Google
 *     (lerHorario), a nota do custo da chamada de cada telefone (notaDaChamada)
 *     e o que é um email ou um endereço que se possa pôr num link;
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
 *                  precisa, um valor de que TODAS as páginas dependem — os
 *                  telefones, de que sai a nota do custo da chamada, e o
 *                  WhatsApp) e os dados legais da empresa (CSC art. 171.º).
 *   · neutraliza — uma viatura, só na cópia que o gerador lê (o ficheiro do
 *                  repositório não muda — ver neutralizar()): sem marca ou sem
 *                  modelo, ou com um valor que não pode ir para o site, fica
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
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
  const s = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
  const t = s.replace(/[\u2028\u2029]/g, '\n');
  const partes = porParagrafo ? t.replace(/\r\n?/g, '\n').split(/\n{2,}/) : [t];
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
/* O gerador apara todos os textos à entrada (limparCampos): «SUV » é «SUV». */
const aparado = (v) => (typeof v === 'string' ? v.trim() : v);
const inteiroEntre = (v, a, b) => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;
const duasCasas = (x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;
const bytesDe = (s) => new TextEncoder().encode(s).length;
/* 1000000 → «1 000 000», igual em todo o lado (o toLocaleString depende do ICU de quem corre). */
const milhares = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* Caracteres de controlo, por escape e nunca literais no código. Os
   separadores de linha U+2028/U+2029 ficam de fora: o gerador troca-os por
   mudanças de linha à entrada (há um na descrição do Opel Corsa). */
const RE_CONTROLO_LINHA = /[\u0000-\u001F\u007F]/;
const RE_CONTROLO_TEXTO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/* «</script» e «<!--»: dentro de um <script> do JSON-LD, um fecha o elemento a
   meio e o outro muda a forma como o browser o lê. O gerador escapa o «<» lá
   dentro desde 1 out 2026, e já não partem nada; mas não há texto honesto que os
   precise, e continuam fora (a viatura escondida, ou a publicação parada se
   estiverem nos dados do stand) — uma segunda rede, para um commit à mão. */
const RE_PARTE_A_PAGINA = /<\/script|<!--/i;

/* Telefones portugueses, 9 algarismos: telemóvel (91, 92, 93, 96) e fixo (2…;
   o 20 não existe no plano de numeração). O WhatsApp é sempre um telemóvel. */
const RE_TELEMOVEL = /^9[1236][0-9]{7}$/;
const RE_FIXO = /^2[1-9][0-9]{7}$/;
const RE_WHATSAPP = /^3519[1236][0-9]{7}$/;
const RE_TELEFONE_TEXTO = /^[0-9 +.-]+$/;
const RE_CP = /^[0-9]{4}-[0-9]{3}$/;
export const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/* O email que o site mostra (Contactos, rodapé, Termos, JSON-LD): só um que
   passe aqui. O mesmo teste nas regras e no gerador. */
export const emailValido = (v) => typeof v === 'string' && v.length <= TAMANHOS.email && RE_EMAIL.test(v.trim());
/* Lenta de propósito: uma matrícula estrangeira, ou um formato antigo, não pode
   impedir o dono de gravar. Apanha o que não é matrícula nenhuma («não tem»). */
const RE_MATRICULA = /^[A-Za-z0-9]+(?:[- ][A-Za-z0-9]+)*$/;
/* O endereço da página: o que o painel gera (gerarSlug). */
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* Um endereço https:// inteiro, sem espaços, aspas nem «<>». O gerador só põe
   num link das redes ou do mapa o que passar aqui (um «javascript:» nunca chega
   a um href, mesmo vindo de um commit à mão). */
export function urlHttps(v) {
  if (typeof v !== 'string' || !/^https:\/\/[^\s"'<>\\]+$/.test(v.trim())) return false;
  try { return new URL(v.trim()).protocol === 'https:'; } catch { return false; }
}

/* A REDE DE UM TELEFONE, para a nota do custo da chamada que o site escreve
   junto de cada número (DL 59/2021): 'movel', 'fixa', ou null para o que não é
   nenhum dos dois (um 800, um 707, um 30…, um número estrangeiro) — aí o site
   não sabe que nota escrever, e estas regras não o deixam gravar. O
   scripts/gerar.mjs escreve a nota a partir DAQUI (notaDaChamada). */
export const redeDoTelefone = (n) => (typeof n !== 'string' ? null : RE_TELEMOVEL.test(n) ? 'movel' : RE_FIXO.test(n) ? 'fixa' : null);
export const NOTAS_DA_CHAMADA = { movel: 'Chamada para a rede móvel nacional', fixa: 'Chamada para a rede fixa nacional' };
export const notaDaChamada = (n) => { const r = redeDoTelefone(n); return r ? NOTAS_DA_CHAMADA[r] : null; };

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
/* O horário, como o Google o lê                                        */
/* ------------------------------------------------------------------ */

/* O HORÁRIO É TEXTO LIVRE no backoffice («Segunda a sexta» · «09:00 – 19:00»),
   e o site mostra-o tal e qual. O Google lê-o do JSON-LD do stand
   (openingHoursSpecification), que tem de ser dias da semana e horas certas.
   lerHorario() traduz as formas portuguesas comuns; uma linha que não perceba
   fica FORA do JSON-LD — melhor nada do que um horário errado no Google — e o
   problemasDasDefinicoes() lembra o dono de como a escrever. O scripts/gerar.mjs
   escreve o JSON-LD a partir DAQUI: o que esta função não percebe é exactamente
   o que lá fica de fora. Nunca adivinha: uma palavra que não conheça, e a linha
   não se percebe. */
export const DIAS_DA_SEMANA = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DIAS_COM_ARTIGO = ['a segunda', 'a terça', 'a quarta', 'a quinta', 'a sexta', 'o sábado', 'o domingo'];

/* Minúsculas, sem acentos («à» é «a»; o NFKD desfaz o «ª» de «2.ª» em «a»),
   os traços todos iguais e um espaço só. */
const normalizarHorario = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim();

const DIA = new Map([
  ['segunda', 0], ['seg', 0], ['2a', 0], ['terca', 1], ['ter', 1], ['3a', 1], ['quarta', 2], ['qua', 2], ['4a', 2],
  ['quinta', 3], ['qui', 3], ['5a', 3], ['sexta', 4], ['sex', 4], ['6a', 4], ['sabado', 5], ['sab', 5], ['domingo', 6], ['dom', 6],
]);
const GRUPOS_DE_DIAS = new Map([['todos', [0, 1, 2, 3, 4, 5, 6]], ['uteis', [0, 1, 2, 3, 4]], ['fds', [5, 6]]]);
const SEPARA_DIAS = new Set([',', 'e', '/', '&', '+', ';']);
const ATE_AO_DIA = new Set(['a', 'as', 'ate', '-']);
const ANTES_DO_DIA = new Set(['de', 'da', 'das', 'do', 'dos', 'ao', 'aos', 'a', 'as', 'nas', 'nos']);
/* «sábados» é «sábado»; um Map, e não um objecto, para «constructor» não ser um dia. */
const diaDe = (f) => (DIA.has(f) ? DIA.get(f) : f.endsWith('s') && DIA.has(f.slice(0, -1)) ? DIA.get(f.slice(0, -1)) : null);

/* Os dias de uma linha: [0..6] (0 é a segunda), por ordem, ou null se não se
   percebe. «Segunda a sexta», «De segunda-feira a sexta-feira», «2.ª a 6.ª»,
   «Seg-Sex», «Sábados», «Sábado e domingo», «Segunda, quarta e sexta», «Todos
   os dias», «Dias úteis», «Fim de semana», «Sexta a segunda» (dá a volta à
   semana). «Feriados», «exceto», parênteses, «segunda a segunda»: não. */
export function lerDiasDoHorario(texto) {
  if (typeof texto !== 'string') return null;
  const s = normalizarHorario(texto)
    .replace(/([0-9]) ?\. ?a\b/g, '$1a')
    .replace(/(?:-| )feiras?\b/g, '')
    .replace(/\btodos os dias(?: da semana)?\b|\bdiariamente\b/g, ' todos ')
    .replace(/\bdias uteis\b/g, ' uteis ')
    .replace(/\bfi(?:m|ns)[ -]de[ -]semana\b/g, ' fds ')
    .replace(/\./g, ' ');
  const f = s.match(/[a-z0-9]+|[^a-z0-9\s]/g) || [];
  const dias = new Set();
  let i = 0;
  for (;;) {
    while (i < f.length && ANTES_DO_DIA.has(f[i])) i++;
    if (i >= f.length) return null;
    if (GRUPOS_DE_DIAS.has(f[i])) { for (const d of GRUPOS_DE_DIAS.get(f[i])) dias.add(d); i++; } else {
      const de = diaDe(f[i]);
      if (de === null) return null;
      i++;
      if (i < f.length && ATE_AO_DIA.has(f[i])) {
        i++;
        while (i < f.length && ANTES_DO_DIA.has(f[i])) i++;
        const ate = i < f.length ? diaDe(f[i]) : null;
        if (ate === null || ate === de) return null;
        for (let d = de; ; d = (d + 1) % 7) { dias.add(d); if (d === ate) break; }
        i++;
      } else dias.add(de);
    }
    if (i >= f.length) break;
    if (!SEPARA_DIAS.has(f[i])) return null;
    i++;
  }
  return [...dias].sort((a, b) => a - b);
}

/* As horas de uma linha: 'fechado', [['09:00', '13:00'], ['14:30', '19:00']]
   (por ordem, sem se sobreporem), ou null se não se percebe. «09:00 – 19:00»,
   «9h-19h», «9h às 19h», «Das 9:00 às 13:00 / 14:30 às 19:00», «9h-12h30 e
   14h-19h», «9.00-19.00», «9 às 19 horas», «Fechado», «Encerrado», «24 horas».
   O fecho à meia-noite («24h», «24:00») vai como 23:59, como o Google o quer.
   «Por marcação», «até às 19h», um intervalo ao contrário ou sobreposto: não. */
const HORA = '([0-9]{1,2})(?:(?:h|:|\\.)([0-9]{2})h?|h)?';
const RE_INTERVALO = new RegExp(`^(?:das? |de )?${HORA} ?(?:-|a|as|ate|ate as) ?${HORA}$`);
const minutosDe = (h, m) => {
  const H = Number(h); const M = m === undefined ? 0 : Number(m);
  return H > 24 || M > 59 || (H === 24 && M > 0) ? null : H * 60 + M;
};
const hhmm = (t) => (t >= 1440 ? '23:59' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
export function lerHorasDoHorario(texto) {
  if (typeof texto !== 'string') return null;
  const s = normalizarHorario(texto).replace(/\.$/, '');
  if (/^(?:fechad[oa]s?|encerrad[oa]s?)$/.test(s)) return 'fechado';
  if (/^(?:aberto )?24 ?(?:h|horas)$/.test(s)) return [['00:00', '23:59']];
  const t = s.replace(/([0-9]) ?horas?\b/g, '$1h').replace(/([0-9]) h\b/g, '$1h');
  const intervalos = [];
  for (const parte of t.split(/ ?(?:[\/,;+&|]|\be\b) ?/)) {
    const m = parte.match(RE_INTERVALO);
    if (!m) return null;
    const abre = minutosDe(m[1], m[2]); const fecha = minutosDe(m[3], m[4]);
    if (abre === null || fecha === null || abre >= fecha) return null;
    intervalos.push([abre, fecha]);
  }
  intervalos.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < intervalos.length; k++) if (intervalos[k][0] < intervalos[k - 1][1]) return null;
  return intervalos.map(([a, b]) => [hhmm(a), hhmm(b)]);
}

/* O horário inteiro (a lista do definicoes.json) →
     { linhas: [{ indice, estado, dias?, horas?, motivo?, repetidos? }],
       especificacao: [os OpeningHoursSpecification, pela ordem das linhas] }
   estado: 'aberto'; 'fechado' (não vai nada para o Google: um dia que lá não
   está, está fechado — e por isso os dias de uma linha fechada podem nem
   perceber-se, «Feriados»); 'vazio' (sem linha, dias ou horas: as regras
   dizem-no à parte); 'nao-percebido', com motivo 'dias', 'horas' ou 'repetido'
   — um dia em duas linhas que não estão ambas fechadas é uma contradição, e
   saem as duas. dayOfWeek: um nome quando é um dia, uma lista quando são vários. */
export function lerHorario(horario) {
  /* Array.from e não .map: um buraco na lista (um delete) conta como uma linha
     vazia, e não fica um buraco no resultado. */
  const linhas = Array.from(Array.isArray(horario) ? horario : [], (l, indice) => {
    if (!eObjecto(l) || !temTexto(l.dias) || !temTexto(l.horas)) return { indice, estado: 'vazio' };
    const horas = lerHorasDoHorario(l.horas);
    const dias = lerDiasDoHorario(l.dias);
    if (horas === 'fechado') return { indice, estado: 'fechado', dias };
    if (!horas || !dias) return { indice, estado: 'nao-percebido', motivo: dias ? 'horas' : 'dias' };
    return { indice, estado: 'aberto', dias, horas };
  });
  const lidas = linhas.filter((l) => l.dias && (l.estado === 'aberto' || l.estado === 'fechado'));
  const contraditorios = new Set([0, 1, 2, 3, 4, 5, 6].filter((d) => {
    const com = lidas.filter((l) => l.dias.includes(d));
    return com.length > 1 && com.some((l) => l.estado === 'aberto');
  }));
  for (const l of lidas) {
    const repetidos = l.dias.filter((d) => contraditorios.has(d));
    if (repetidos.length) Object.assign(l, { estado: 'nao-percebido', motivo: 'repetido', repetidos });
  }
  const especificacao = linhas.filter((l) => l.estado === 'aberto').flatMap((l) => l.horas.map(([abre, fecha]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: l.dias.length === 1 ? DIAS_DA_SEMANA[l.dias[0]] : l.dias.map((d) => DIAS_DA_SEMANA[d]),
    opens: abre,
    closes: fecha,
  })));
  return { linhas, especificacao };
}

/* ------------------------------------------------------------------ */
/* Uma viatura                                                          */
/* ------------------------------------------------------------------ */

/* À venda NO SITE, como o gerador decide: publicada (tudo menos `false`) e não
   vendida. É a estas que a lei dos usados se aplica — o anúncio. */
export const aVendaNoSite = (v) => eObjecto(v) && v.publicado !== false && aparado(v.estado) !== 'vendido';
/* O nome que o ecrã mostra: marca, modelo e versão, numa linha só (sem
   caracteres invisíveis nem mudanças de linha), cortado a 80. */
export const nomeDaViatura = (v, slug) => {
  const n = eObjecto(v) ? ['marca', 'modelo', 'versao'].map((k) => v[k]).filter(temTexto).join(' ')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const curto = n.length > 80 ? `${n.slice(0, 79)}…` : n;
  return curto || slug || 'viatura sem nome';
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
  /* O que partia a página desta viatura até 1 out 2026: aspas no estado ou num
     número (iam tal e qual para atributos do cartão), e «</script» ou «<!--»
     num texto (no JSON-LD). O gerador escapa-os agora e já não partem nada; mas
     nenhum dado honesto os tem, e a viatura continua escondida — uma segunda
     rede. Só um commit à mão chega aqui. */
  const partem = [];
  for (const campo of ['estado', 'preco', 'ano', 'km']) if (typeof v[campo] === 'string' && v[campo].includes('"')) partem.push(campo);
  for (const [caminho, t] of textosDe(v)) if (RE_PARTE_A_PAGINA.test(t)) partem.push(caminho.split('.')[0]);
  if (partem.length) {
    const campos = [...new Set(partem)];
    neutraliza('partia-a-pagina', 'esconder', campos[0], `${campos.map((c) => `«${NOMES_CAMPOS[c] || c}»`).join(', ')}: tem caracteres que não podem ir para o site (aspas no estado ou num número, ou «</script» ou «<!--» num texto). A viatura fica escondida do site até isso ser corrigido.`, { campos });
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
    const x = aparado(v[campo]);
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
  numero('preco', LIMITES.preco, `O preço é só o número, sem € nem pontos (ex.: 18990), de 0 a ${milhares(LIMITES.preco[1])} €.`, { casas: 2 });
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

  /* As secções que o gerador lê sem perguntar. Faltam quando todos os campos
     delas ficam vazios: o Pages CMS não grava uma secção vazia. */
  for (const s of ['contactos', 'stand', 'redes', 'textos', 'opcoes', 'empresa']) {
    if (!eObjecto(d[s])) bloqueia(`${s}:forma`, s, s, `A secção «${SECCOES_DEFINICOES[s]}» não está gravada, e sem ela o site não se consegue gerar. Preencha os campos dela e grave outra vez.`);
  }
  if (!Array.isArray(d.horario)) bloqueia('horario:forma', 'horario', 'horario', 'O horário não está gravado, e sem ele o site não se consegue gerar. Escreva pelo menos uma linha e grave outra vez.');

  /* Um texto que o gerador escreve no JSON-LD de todas as páginas. Desde 1 out
     2026 o gerador escapa-o e já não parte nada (ver RE_PARTE_A_PAGINA); fica
     como estava, uma segunda rede para um commit à mão. */
  const partidos = textosDe(Object.fromEntries(Object.entries(d).filter(([k]) => !BLOQUEADOS_DEFINICOES.includes(k)))).filter(([, t]) => RE_PARTE_A_PAGINA.test(t));
  if (partidos.length) {
    const seccao = partidos[0][0].split('.')[0];
    bloqueia('partia-a-pagina', tem(SECCOES_DEFINICOES, seccao) ? seccao : null, partidos[0][0], 'Um texto tem «</script» ou «<!--», que não podem ir para o site. Apague-o e escreva-o outra vez.');
  }

  /* Um texto de um campo, pelo rótulo que o dono vê (o do .pages.yml).
     vazio: a classe quando falta ('bloqueia' — a lei; 'avisa' — fica um buraco
     no site) ou null (opcional); porque: o que acontece no site sem ele. */
  const textoSimples = (valor, chave, seccao, campo, rotulo, max, { vazio: classeVazio = null, porque = '', linha = true } = {}) => {
    if (vazio(valor)) {
      if (classeVazio === 'bloqueia') bloqueia(chave, seccao, campo, `Preencha «${rotulo}»: é obrigatório por lei, e sem isso o site não é publicado.`);
      else if (classeVazio) avisa(chave, seccao, campo, `Preencha «${rotulo}»: ${porque || 'sem isso fica um espaço em branco no site.'}`);
      return false;
    }
    if (typeof valor !== 'string') { (classeVazio === 'bloqueia' ? bloqueia : avisa)(chave, seccao, campo, `«${rotulo}» tem de ser texto.`); return false; }
    if (valor.length > max) avisa(`${chave}:tamanho`, seccao, campo, `«${rotulo}» tem mais de ${max} caracteres (tem ${valor.length}).`);
    if ((linha ? RE_CONTROLO_LINHA : RE_CONTROLO_TEXTO).test(valor)) avisa(`${chave}:controlo`, seccao, campo, `«${rotulo}» tem caracteres invisíveis${linha ? ' (ex.: uma mudança de linha)' : ''}. Escreva-o outra vez.`);
    return true;
  };

  // --- contactos ------------------------------------------------------------
  /* O gerador escreve os telefones e o WhatsApp nos endereços (tel:+351…,
     wa.me/…) e o «como aparece» no texto, em todas as páginas; e junto de cada
     número a nota do custo da chamada (DL 59/2021), que sai do próprio número
     (notaDaChamada: «rede móvel» ou «rede fixa»). Por isso: um telemóvel ou um
     fixo português, e o «como aparece» com os mesmos algarismos. Sem o telefone
     2, o site mostra só o 1 — sem linha vazia em lado nenhum. O WhatsApp é
     sempre um telemóvel. */
  const c = d.contactos;
  if (eObjecto(c)) {
    const telefone = (n, obrigatorio) => {
      const num = c[`telefone_${n}`]; const txt = c[`telefone_${n}_texto`];
      const campoNum = `contactos.telefone_${n}`; const campoTxt = `contactos.telefone_${n}_texto`;
      const rNum = `Telefone ${n} (só dígitos)`; const rTxt = `Telefone ${n} (como aparece)`;
      if (!obrigatorio && vazio(num) && vazio(txt)) return;
      if (vazio(num)) bloqueia(`contactos.telefone_${n}`, 'contactos', campoNum, obrigatorio ? `Preencha «${rNum}»: é o número dos botões «Ligar» de todas as páginas.` : `Preencha «${rNum}» (o «como aparece» está preenchido), ou apague os dois.`);
      else if (!redeDoTelefone(num)) bloqueia(`contactos.telefone_${n}`, 'contactos', campoNum, `«${rNum}» tem de ser um número português de 9 algarismos, sem espaços: um telemóvel (começa por 91, 92, 93 ou 96) ou um fixo (começa por 2). Ex.: 961053363 ou 253123456.`);
      if (vazio(txt)) bloqueia(`contactos.telefone_${n}_texto`, 'contactos', campoTxt, `Preencha «${rTxt}»: é o número que se lê no site (ex.: 961 053 363).`);
      else {
        const digitos = typeof txt === 'string' ? txt.replace(/[^0-9]/g, '').replace(/^351(?=[0-9]{9}$)/, '') : '';
        if (!(typeof txt === 'string' && RE_TELEFONE_TEXTO.test(txt) && txt.length <= TAMANHOS.telefoneTexto)) bloqueia(`contactos.telefone_${n}_texto`, 'contactos', campoTxt, `«${rTxt}» só pode ter algarismos e espaços (ex.: 961 053 363).`);
        else if (redeDoTelefone(num) && digitos !== num) bloqueia(`contactos.telefone_${n}_texto`, 'contactos', campoTxt, `«${rTxt}» não é o mesmo número de «${rNum}»: o site mostrava um número e ligava para outro.`);
      }
    };
    telefone(1, true);
    telefone(2, false);
    if (vazio(c.whatsapp)) bloqueia('contactos.whatsapp', 'contactos', 'contactos.whatsapp', 'Preencha o WhatsApp: é para onde vão os botões «WhatsApp» de todas as páginas.');
    else if (!(typeof c.whatsapp === 'string' && RE_WHATSAPP.test(c.whatsapp))) bloqueia('contactos.whatsapp', 'contactos', 'contactos.whatsapp', 'O WhatsApp é um telemóvel: escreve-se 351 e o número, só algarismos, sem espaços nem + (ex.: 351961053363).');
    if (!vazio(c.email) && !emailValido(c.email)) {
      avisa('contactos.email', 'contactos', 'contactos.email', 'O email não está bem escrito (ex.: geral@lrmotorsautomoveis.pt, sem acentos nem espaços): enquanto estiver assim, não aparece no site. Corrija-o ou deixe-o vazio.');
    }
  }

  // --- morada do stand (DL 7/2004: o endereço geográfico) -------------------
  const s = d.stand;
  if (eObjecto(s)) {
    textoSimples(s.morada, 'stand.morada', 'stand', 'stand.morada', 'Rua', TAMANHOS.morada, { vazio: 'bloqueia' });
    if (vazio(s.codigo_postal)) bloqueia('stand.codigo_postal', 'stand', 'stand.codigo_postal', 'Preencha «Código postal»: é obrigatório por lei, e sem isso o site não é publicado.');
    else if (!(typeof s.codigo_postal === 'string' && RE_CP.test(s.codigo_postal.trim()))) bloqueia('stand.codigo_postal', 'stand', 'stand.codigo_postal', 'O código postal escreve-se 0000-000.');
    textoSimples(s.localidade, 'stand.localidade', 'stand', 'stand.localidade', 'Localidade', TAMANHOS.localidade, { vazio: 'bloqueia' });
    textoSimples(s.distrito, 'stand.distrito', 'stand', 'stand.distrito', 'Distrito', TAMANHOS.distrito, { vazio: 'avisa', porque: 'aparece na morada, no rodapé e na página de Contactos.' });
    textoSimples(s.pais, 'stand.pais', 'stand', 'stand.pais', 'País', TAMANHOS.pais);
    if (!vazio(s.mapa) && !(urlHttps(s.mapa) && s.mapa.length <= TAMANHOS.url)) avisa('stand.mapa', 'stand', 'stand.mapa', 'O link do Google Maps tem de começar por https:// (copie-o do botão «Partilhar» do Google Maps).');
    /* As coordenadas são o destino do botão «Como chegar» e o ponto do stand
       que o site dá ao Google. Sem elas (ou fora do mapa), o gerador leva o
       botão à morada e não dá ponto nenhum ao Google. Um texto no lugar de um
       número só chega num commit à mão, e pára como sempre parou. */
    for (const [k, rotulo, max] of [['latitude', 'Latitude', 90], ['longitude', 'Longitude', 180]]) {
      const x = s[k];
      const campo = `stand.${k}`;
      if (ausente(x) || x === '') avisa(`stand.${k}`, 'stand', campo, `Preencha «${rotulo}»: sem as coordenadas, o botão «Como chegar» leva à morada e não ao ponto exacto do stand.`);
      else if (typeof x !== 'number' || !Number.isFinite(x)) bloqueia(`stand.${k}:forma`, 'stand', campo, `«${rotulo}» tem de ser um número (ex.: 41.6469), sem texto à volta.`);
      else if (Math.abs(x) > max) avisa(`stand.${k}`, 'stand', campo, `«${rotulo}» não é uma coordenada (vai de -${max} a ${max}).`);
    }
  }

  // --- horário -----------------------------------------------------------
  const h = d.horario;
  if (Array.isArray(h)) {
    if (h.length === 0) avisa('horario:vazio', 'horario', 'horario', 'O horário está vazio: o rodapé e a página de Contactos ficam sem horário.');
    if (h.length > TAMANHOS.horarioLinhas) avisa('horario:linhas', 'horario', 'horario', `O horário tem ${h.length} linhas; o máximo é ${TAMANHOS.horarioLinhas}.`);
    h.forEach((linha, i) => {
      if (!eObjecto(linha)) { bloqueia(`horario.${i + 1}:forma`, 'horario', `horario.${i}`, `A ${i + 1}.ª linha do horário não está preenchida, e sem ela o site não se consegue gerar. Apague-a e escreva-a outra vez.`); return; }
      /* Toda vazia, o gerador não a mostra (não fica uma linha em branco). */
      if (vazio(linha.dias) && vazio(linha.horas)) {
        avisa(`horario.${i + 1}:vazia`, 'horario', `horario.${i}`, `A ${i + 1}.ª linha do horário está vazia, e não aparece no site: apague-a, ou escreva os dias e as horas.`);
        return;
      }
      const porque = `na ${i + 1}.ª linha do horário fica um espaço em branco.`;
      textoSimples(linha.dias, `horario.${i + 1}.dias`, 'horario', `horario.${i}.dias`, 'Dias', TAMANHOS.dias, { vazio: 'avisa', porque });
      textoSimples(linha.horas, `horario.${i + 1}.horas`, 'horario', `horario.${i}.horas`, 'Horas', TAMANHOS.horas, { vazio: 'avisa', porque });
    });
    /* O que vai para o Google (lerHorario): a linha que não se percebe fica fora
       do JSON-LD, e o dono fica a saber como a escrever. Só lembra — no site a
       linha aparece como está. */
    const citar = (t) => { const x = String(t).replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim(); return x.length > 40 ? `${x.slice(0, 39)}…` : x; };
    const comE = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l.join(''));
    for (const l of lerHorario(h).linhas) {
      if (l.estado !== 'nao-percebido') continue;
      const n = l.indice + 1;
      const mensagem = l.motivo === 'repetido'
        ? `A ${n}.ª linha do horário tem ${comE(l.repetidos.map((x) => DIAS_COM_ARTIGO[x]))}, que também ${l.repetidos.length === 1 ? 'está' : 'estão'} noutra linha: o Google não sabe qual das duas vale, e nenhuma delas vai para o Google (no site aparecem como estão). Escreva cada dia numa linha só (ex.: «Segunda a sexta» numa linha e «Sábado» noutra).`
        : `O Google não percebe a ${n}.ª linha do horário («${citar(h[l.indice].dias)}» · «${citar(h[l.indice].horas)}»): fica fora do que o site diz ao Google (no site aparece como está). Para o Google a perceber, escreva os dias como «Segunda a sexta», «Sábado» ou «Sábado e domingo», e as horas como «9:00 – 19:00», «9h-13h e 14h30-19h» ou «Fechado».`;
      avisa(`horario.${n}:google`, 'horario', `horario.${l.indice}.${l.motivo === 'horas' ? 'horas' : 'dias'}`, mensagem, { lembrete: true });
    }
  }

  // --- redes sociais --------------------------------------------------------
  const r = d.redes;
  if (eObjecto(r)) {
    for (const [k, rotulo] of [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']]) {
      if (!vazio(r[k]) && !(urlHttps(r[k]) && r[k].length <= TAMANHOS.url)) avisa(`redes.${k}`, 'redes', `redes.${k}`, `O endereço do ${rotulo} tem de começar por https:// (copie-o do browser). Corrija-o ou deixe-o vazio.`);
    }
  }

  // --- textos do site -------------------------------------------------------
  const t = d.textos;
  if (eObjecto(t)) {
    textoSimples(t.reclamo, 'textos.reclamo', 'textos', 'textos.reclamo', 'Frase da marca', TAMANHOS.reclamo, { vazio: 'avisa' });
    textoSimples(t.hero_titulo, 'textos.hero_titulo', 'textos', 'textos.hero_titulo', 'Título da página inicial', TAMANHOS.titulo, { vazio: 'avisa' });
    textoSimples(t.hero_texto, 'textos.hero_texto', 'textos', 'textos.hero_texto', 'Texto da página inicial', TAMANHOS.heroTexto, { vazio: 'avisa', linha: false });
    textoSimples(t.sobre_titulo, 'textos.sobre_titulo', 'textos', 'textos.sobre_titulo', 'Título do "Sobre nós"', TAMANHOS.titulo, { vazio: 'avisa' });
    textoSimples(t.sobre_texto, 'textos.sobre_texto', 'textos', 'textos.sobre_texto', 'Texto do "Sobre nós"', TAMANHOS.sobreTexto, { vazio: 'avisa', linha: false });
    textoSimples(t.locais, 'textos.locais', 'textos', 'textos.locais', 'Onde estamos (texto livre)', TAMANHOS.locais);
    /* O gerador faz (aviso_visita || '').trim(): um número ou uma lista aqui
       rebentava a geração do site inteiro. */
    const av = t.aviso_visita;
    if (!ausente(av) && typeof av !== 'string') bloqueia('textos.aviso_visita:forma', 'textos', 'textos.aviso_visita', '«Aviso sobre visitas noutro local» tem de ser texto, e assim o site não se consegue gerar. Apague-o e escreva-o outra vez.');
    else if (textoSimples(av, 'textos.aviso_visita', 'textos', 'textos.aviso_visita', 'Aviso sobre visitas noutro local', TAMANHOS.avisoVisita) && !negritoCerto(av, { porParagrafo: false })) {
      avisa('textos.aviso_visita:negrito', 'textos', 'textos.aviso_visita', 'No aviso sobre visitas há um ** sem par: o negrito escreve-se **assim**. Sem par, os asteriscos aparecem no site.');
    }
  }

  // --- opções --------------------------------------------------------------
  const o = d.opcoes;
  if (eObjecto(o) && typeof o.mostrar_vendidos !== 'boolean') {
    avisa('opcoes.mostrar_vendidos', 'opcoes', 'opcoes.mostrar_vendidos', '«Mostrar secção "Já vendidas" na listagem» não está gravado (sim ou não): vale como «não».');
  }

  // --- dados legais da empresa (CSC art. 171.º) ------------------------------
  /* Vale mais o site ficar na versão anterior do que ir para o ar sem eles. */
  const e = d.empresa;
  if (eObjecto(e)) {
    textoSimples(e.denominacao_social, 'empresa.denominacao_social', 'empresa', 'empresa.denominacao_social', 'Denominação social', TAMANHOS.denominacao, { vazio: 'bloqueia' });
    textoSimples(e.forma_juridica, 'empresa.forma_juridica', 'empresa', 'empresa.forma_juridica', 'Forma jurídica', TAMANHOS.formaJuridica, { vazio: 'bloqueia' });
    if (vazio(e.nif)) bloqueia('empresa.nif', 'empresa', 'empresa.nif', 'Preencha «NIF»: é obrigatório por lei, e sem isso o site não é publicado.');
    else if (!nifValido(typeof e.nif === 'string' ? e.nif.trim() : e.nif)) bloqueia('empresa.nif', 'empresa', 'empresa.nif', 'O NIF não é válido (9 algarismos, o primeiro não é 0, e o último tem de bater certo com os outros). Confira-o na certidão permanente.');
    if (textoSimples(e.capital_social, 'empresa.capital_social', 'empresa', 'empresa.capital_social', 'Capital social', TAMANHOS.capitalSocial, { vazio: 'bloqueia' }) && !/[0-9]/.test(e.capital_social)) {
      avisa('empresa.capital_social:formato', 'empresa', 'empresa.capital_social', 'O capital social escreve-se em euros, com algarismos (ex.: 20.000,00 €).');
    }
    textoSimples(e.nome_comercial, 'empresa.nome_comercial', 'empresa', 'empresa.nome_comercial', 'Nome comercial', TAMANHOS.nomeComercial, { vazio: 'avisa', porque: 'é o nome que aparece no topo da página inicial e no rodapé.' });
    textoSimples(e.cae, 'empresa.cae', 'empresa', 'empresa.cae', 'CAE', TAMANHOS.cae);
  }

  // --- sede social (opcional: hoje não está no ficheiro) ---------------------
  const sd = d.sede_social;
  if (!ausente(sd)) {
    if (!eObjecto(sd)) avisa('sede_social', 'sede_social', 'sede_social', 'A sede social não tem a forma certa: apague-a e escreva-a outra vez.');
    else {
      const preenchida = ['morada', 'codigo_postal', 'localidade'].some((k) => !vazio(sd[k]));
      const porque = 'a morada da sede fica incompleta (ou apague-a toda).';
      if (preenchida) {
        textoSimples(sd.morada, 'sede_social.morada', 'sede_social', 'sede_social.morada', 'Rua', TAMANHOS.morada, { vazio: 'avisa', porque });
        textoSimples(sd.localidade, 'sede_social.localidade', 'sede_social', 'sede_social.localidade', 'Localidade', TAMANHOS.localidade, { vazio: 'avisa', porque });
        if (vazio(sd.codigo_postal) || !(typeof sd.codigo_postal === 'string' && RE_CP.test(sd.codigo_postal.trim()))) {
          avisa('sede_social.codigo_postal', 'sede_social', 'sede_social.codigo_postal', 'O código postal da sede escreve-se 0000-000.');
        }
      }
      textoSimples(sd.distrito, 'sede_social.distrito', 'sede_social', 'sede_social.distrito', 'Distrito', TAMANHOS.distrito);
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
      classe: 'bloqueia', chave: `viatura:${slug}:repetida`, ficheiro: ficheiros[0], ficheiros, slug, ecra: `${ficheiros[0].includes('/vendidas/') ? 'Vendidas' : 'Viaturas'} › ${slug}`,
      mensagem: `Há ${ficheiros.length} viaturas com o mesmo endereço («${slug}»)${ficheiros.some((f) => f.includes('/vendidas/')) && ficheiros.some((f) => !f.includes('/vendidas/')) ? ', uma nas Viaturas e outra nas Vendidas' : ''}: o site não sabe qual mostrar. Apague a que está a mais.`,
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
