/* ============================================================================
 * Recebe as fotografias da página /fotos/ e grava-as no repositório do site,
 * na pasta de Media que o backoffice mostra.
 *
 * ---------------------------------------------------------------------------
 * PORQUE EXISTE ISTO, EM VEZ DE A PÁGINA FALAR DIRECTAMENTE COM O GITHUB
 *
 * Escrever no repositório exige uma chave. O repositório é PÚBLICO — tem de
 * ser, porque publicar o GitHub Pages a partir de um repositório privado exige
 * o plano Pro, pago — logo tudo o que estivesse no código da página seria
 * legível por qualquer pessoa, e a chave com ele. O endereço /fotos/ ser pouco
 * conhecido não protege nada: o ficheiro está à vista em github.com.
 *
 * Aqui a chave é um "secret" do Worker: fica do lado do servidor e nunca sai.
 * O cliente prova quem é com uma senha, que é a única coisa que viaja.
 *
 * E mesmo que a senha se saiba, o estrago é limitado de propósito: só entram
 * imagens (verificadas pelos bytes, não pela extensão), só se escreve dentro
 * de assets/veiculos/, e o nome da pasta é validado contra uma forma fixa.
 * Não há por aqui caminho para tocar no código ou nos dados do site.
 *
 * ---------------------------------------------------------------------------
 * PORQUE SÃO DOIS PASSOS E NÃO UM
 *
 * Cinquenta fotografias de 1 MB são 67 MB depois de convertidas em base64, e
 * um Worker tem 128 MB de memória: num pedido só, com o texto recebido mais o
 * que se descodifica dele, não cabia. Por isso cada fotografia vai no seu
 * pedido (/blob), pequeno, e no fim um único /commit junta os pedaços.
 *
 * Junta-os num ÚNICO commit de propósito. A maneira óbvia — a API de conteúdos
 * do GitHub, um PUT por ficheiro — dá um commit por fotografia, e vinte
 * fotografias seriam vinte publicações do site em catadupa. Com a API de Git
 * em cru (blobs -> árvore -> commit -> ref) é uma publicação só.
 *
 * ---------------------------------------------------------------------------
 * INSTALAR (uma vez; o passo a passo está em worker/README.md)
 *
 *   npx wrangler deploy
 *   npx wrangler secret put GITHUB_TOKEN     (fine-grained, Contents: R/W)
 *   npx wrangler secret put SENHA            (longa; é o que o cliente escreve)
 * ========================================================================= */

const REPO = 'renatovalente5/LR_Motors';
const RAMO = 'main';
const PASTA_BASE = 'assets/veiculos';
const ORIGEM = 'https://lrmotorsautomoveis.pt';

/* Limites. Não são por avareza: são o que impede um pedido de esgotar a
   memória do Worker ou de encher o repositório. 50 é o mesmo máximo que o
   backoffice aceita por viatura. */
const MAX_FICHEIROS = 50;
const MAX_POR_FICHEIRO = 8 * 1024 * 1024;

/* Assinaturas dos formatos aceites. Confiar na extensão, ou no `type` que o
   browser declara, não serve de nada — ambos vêm do lado de quem envia. Estes
   bytes estão dentro do próprio ficheiro. */
const FORMATOS = [
  { ext: 'jpg', bytes: [0xFF, 0xD8, 0xFF] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], em8: [0x57, 0x45, 0x42, 0x50] },
];

const cabecalhos = {
  'Access-Control-Allow-Origin': ORIGEM,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const responder = (corpo, estado = 200) =>
  new Response(JSON.stringify(corpo), {
    status: estado,
    headers: { ...cabecalhos, 'Content-Type': 'application/json; charset=utf-8' },
  });

/* Comparação em tempo constante. Comparar senhas com === deixa o tempo de
   resposta dizer quantos caracteres iniciais estavam certos, e isso chega para
   as descobrir letra a letra. */
function senhaConfere(dada, esperada) {
  if (typeof dada !== 'string' || typeof esperada !== 'string') return false;
  const cod = new TextEncoder();
  const a = cod.encode(dada);
  const b = cod.encode(esperada);
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return dif === 0;
}

/* O nome da pasta é escrito pelo cliente, portanto chega aqui como texto de
   quem sabe. Não se corrige nem se adivinha: ou está dentro do que se aceita,
   ou é recusado. Sem pontos, para não haver «..»; sem barras, para não sair
   de assets/veiculos/. */
const pastaValida = (n) =>
  typeof n === 'string' && n.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n);

const ficheiroValido = (n) =>
  typeof n === 'string' && !n.includes('..')
  && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(jpe?g|png|webp)$/i.test(n);

const shaValido = (s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s);

const formatoDe = (b) => FORMATOS.find((f) =>
  f.bytes.every((x, i) => b[i] === x)
  && (!f.em8 || f.em8.every((x, i) => b[8 + i] === x)));

async function github(caminho, token, opcoes = {}) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lrmotors-fotos',
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    /* A resposta do GitHub pode trazer detalhes do repositório; para o cliente
       vai uma frase simples e o resto fica no registo do Worker. */
    console.error('github', caminho, r.status, JSON.stringify(corpo).slice(0, 500));
    const e = new Error(`github ${r.status}`);
    e.estado = r.status;
    throw e;
  }
  return corpo;
}

/* ----------------------------- que pastas já existem, para propor um nome livre */
async function listarPastas(ambiente) {
  /* Vem daqui e não do browser de propósito. A API pública do GitHub dá 60
     pedidos por hora POR ENDEREÇO, e num escritório atrás de um só IP isso
     esgota-se sem se dar por ela; aqui vai com a chave do Worker, que tem
     5000. E poupa à página falar com um segundo sítio. */
  const conteudo = await github(
    `/repos/${REPO}/contents/${PASTA_BASE}?ref=${RAMO}`, ambiente.GITHUB_TOKEN);
  const pastas = (Array.isArray(conteudo) ? conteudo : [])
    .filter((x) => x.type === 'dir').map((x) => x.name);
  return responder({ ok: true, pastas });
}

/* ------------------------------------------------------- passo 1: um ficheiro */
async function guardarBlob(dados, ambiente) {
  if (!ficheiroValido(dados.nome)) {
    return responder({ erro: `Nome de ficheiro inválido: ${String(dados.nome).slice(0, 40)}` }, 400);
  }
  if (typeof dados.conteudo !== 'string' || !dados.conteudo) {
    return responder({ erro: `Não veio conteúdo em ${dados.nome}.` }, 400);
  }

  let bruto;
  try {
    bruto = Uint8Array.from(atob(dados.conteudo), (c) => c.charCodeAt(0));
  } catch {
    return responder({ erro: `Não consegui ler ${dados.nome}.` }, 400);
  }
  if (bruto.length > MAX_POR_FICHEIRO) {
    return responder({ erro: `${dados.nome} é grande de mais.` }, 413);
  }
  if (!formatoDe(bruto)) {
    return responder({ erro: `${dados.nome} não é uma imagem JPEG, PNG ou WebP.` }, 400);
  }

  /* Um blob sozinho não altera nada no repositório: fica solto até um commit
     lhe pegar, e o GitHub deita fora os que ninguém usa. Se o envio for a meio
     interrompido, não fica nada por limpar. */
  const b = await github(`/repos/${REPO}/git/blobs`, ambiente.GITHUB_TOKEN, {
    method: 'POST',
    body: JSON.stringify({ content: dados.conteudo, encoding: 'base64' }),
  });
  return responder({ ok: true, nome: dados.nome, sha: b.sha });
}

/* ------------------------------------ passo 2: juntar tudo num único commit */
async function gravarCommit(dados, ambiente) {
  if (!pastaValida(dados.pasta)) {
    return responder({
      erro: 'Nome de pasta inválido. Use só letras minúsculas, números e hífens.',
    }, 400);
  }
  const fs = Array.isArray(dados.ficheiros) ? dados.ficheiros : [];
  if (!fs.length) return responder({ erro: 'Não veio nenhuma fotografia.' }, 400);
  if (fs.length > MAX_FICHEIROS) {
    return responder({ erro: `São ${fs.length} fotografias; o máximo é ${MAX_FICHEIROS}.` }, 400);
  }

  const vistos = new Set();
  for (const f of fs) {
    if (!ficheiroValido(f && f.nome) || !shaValido(f && f.sha)) {
      return responder({ erro: 'Pedido mal formado.' }, 400);
    }
    if (vistos.has(f.nome.toLowerCase())) {
      return responder({ erro: `Há duas fotografias chamadas ${f.nome}.` }, 400);
    }
    vistos.add(f.nome.toLowerCase());
  }

  const pasta = `${PASTA_BASE}/${dados.pasta}`;
  const arvoreEntradas = fs.map((f) => ({
    path: `${pasta}/${f.nome}`, mode: '100644', type: 'blob', sha: f.sha,
  }));

  const ref = await github(`/repos/${REPO}/git/ref/heads/${RAMO}`, ambiente.GITHUB_TOKEN);
  const base = ref.object.sha;
  const commitBase = await github(`/repos/${REPO}/git/commits/${base}`, ambiente.GITHUB_TOKEN);

  const arvore = await github(`/repos/${REPO}/git/trees`, ambiente.GITHUB_TOKEN, {
    method: 'POST',
    body: JSON.stringify({ base_tree: commitBase.tree.sha, tree: arvoreEntradas }),
  });

  const n = fs.length;
  const commit = await github(`/repos/${REPO}/git/commits`, ambiente.GITHUB_TOKEN, {
    method: 'POST',
    body: JSON.stringify({
      message: `${n} ${n === 1 ? 'fotografia' : 'fotografias'} em ${dados.pasta}`
        + '\n\nEnviadas pela página /fotos/, já reduzidas e sem os metadados do'
        + '\ntelemóvel. As variantes para o site são geradas na publicação.',
      tree: arvore.sha,
      parents: [base],
    }),
  });

  /* Sem `force`: se o backoffice tiver gravado alguma coisa entretanto, isto
     falha em vez de lhe passar por cima. */
  await github(`/repos/${REPO}/git/refs/heads/${RAMO}`, ambiente.GITHUB_TOKEN, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return responder({ ok: true, pasta: dados.pasta, quantas: n, commit: commit.sha.slice(0, 7) });
}

export default {
  async fetch(pedido, ambiente) {
    if (pedido.method === 'OPTIONS') return new Response(null, { headers: cabecalhos });
    if (pedido.method !== 'POST') return responder({ erro: 'método não permitido' }, 405);

    /* Só a página do site pode falar com isto. Não é uma tranca a sério — a
       origem é declarada por quem pede — mas trava o caso banal de outra página
       aberta no browser de alguém tentar usar isto às escondidas. */
    const origem = pedido.headers.get('Origin');
    if (origem && origem !== ORIGEM) return responder({ erro: 'origem não permitida' }, 403);

    /* 503 e não 500: a Cloudflare troca o corpo de uma resposta 500 pela sua
       própria página de erro («error code: 1104»), e a mensagem em JSON que a
       página precisa de ler nunca chegava. Vi acontecer em cerca de metade dos
       pedidos, ao acaso, o que dava uma avaria de aspecto intermitente.
       Semanticamente também está mais certo: não é um erro do pedido, é o
       serviço que ainda não está pronto. */
    if (!ambiente.GITHUB_TOKEN || !ambiente.SENHA) {
      console.error('faltam os secrets GITHUB_TOKEN ou SENHA');
      return responder({ erro: 'O servidor ainda não está configurado.' }, 503);
    }

    let dados;
    try {
      dados = await pedido.json();
    } catch {
      return responder({ erro: 'Pedido mal formado.' }, 400);
    }

    if (!senhaConfere(dados.senha, ambiente.SENHA)) {
      return responder({ erro: 'Senha errada.' }, 401);
    }

    const rota = new URL(pedido.url).pathname;
    try {
      if (rota === '/pastas') return await listarPastas(ambiente);
      if (rota === '/blob') return await guardarBlob(dados, ambiente);
      if (rota === '/commit') return await gravarCommit(dados, ambiente);
      return responder({ erro: 'não encontrado' }, 404);
    } catch (e) {
      console.error('falhou', rota, e && e.message);
      /* 409 é o caso concreto de alguém ter gravado no repositório entre o
         princípio e o fim do envio — vale a pena dizê-lo, porque a solução é
         simplesmente tentar outra vez. */
      if (e && (e.estado === 409 || e.estado === 422)) {
        return responder({
          erro: 'Alguém gravou no site enquanto isto ia a meio. Carregue em Enviar outra vez.',
        }, 409);
      }
      return responder({
        erro: 'Não consegui gravar as fotografias. Tente daqui a um minuto; '
            + 'se continuar assim, avise o Renato.',
      }, 502);
    }
  },
};
