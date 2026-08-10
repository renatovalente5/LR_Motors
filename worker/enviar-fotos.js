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
  'Access-Control-Allow-Headers': 'Content-Type, X-Senha, X-Nome, X-Versao',
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

/* ------------------------------------------------------- passo 1: um ficheiro
 *
 * A FOTOGRAFIA NUNCA CHEGA A ESTAR EM MEMÓRIA AQUI. Vale a pena explicar, que
 * foi o que partiu isto em produção e não é evidente.
 *
 * O plano gratuito da Cloudflare dá 10 ms de CPU por pedido. Não é tempo de
 * espera — é tempo de trabalho a sério — e uma fotografia de 1,8 MB são 2,4 MB
 * de base64. Sobre esse texto, TUDO custa: um `JSON.parse` custa, um
 * `request.text()` custa, um `replace` custa, e `Uint8Array.from(atob(x), …)`
 * custa muito mais do que tudo o resto junto, porque são dois milhões de
 * chamadas a uma função.
 *
 * A primeira versão fazia as três coisas. A Cloudflare matava o Worker a meio
 * — «error code: 1102», resposta sem corpo, que no Safari do cliente aparecia
 * como «Load failed». Medido: 15 falhas em 20 envios. Tirar o `Uint8Array.from`
 * baixou para 7 em 20; só o `JSON.parse` ainda chegava para rebentar o
 * orçamento. E falhava ao acaso, porque o tempo de CPU disponível varia — daí
 * o cliente dizer que «às vezes funciona».
 *
 * Agora o corpo do pedido é o base64 em cru (o nome e a senha vão em
 * cabeçalhos), e é reenviado para o GitHub aos pedaços, sem nunca ser juntado
 * numa variável. Lê-se só o primeiro pedaço, para confirmar pelos bytes que
 * aquilo é mesmo uma imagem. O resto passa ao lado do Worker.
 *
 * As duas verificações que faltavam também não precisam do ficheiro inteiro:
 * o TAMANHO sai do Content-Length (4 caracteres de base64 = 3 bytes) e o
 * FORMATO sai dos primeiros bytes. */
async function guardarBlob(pedido, ambiente) {
  const nome = pedido.headers.get('X-Nome') || '';
  if (!ficheiroValido(nome)) {
    return responder({ erro: `Nome de ficheiro inválido: ${nome.slice(0, 40)}` }, 400);
  }
  if (!pedido.body) return responder({ erro: `Não veio conteúdo em ${nome}.` }, 400);

  const comprimento = Number(pedido.headers.get('Content-Length') || 0);
  if (comprimento && Math.floor(comprimento / 4) * 3 > MAX_POR_FICHEIRO) {
    return responder({ erro: `${nome} é grande de mais.` }, 413);
  }

  const leitor = pedido.body.getReader();
  const desistir = async (erro, estado = 400) => {
    await leitor.cancel().catch(() => {});
    return responder({ erro }, estado);
  };

  /* Juntar pedaços até haver 24 caracteres, e NÃO assumir que o primeiro já os
     traz. Um fluxo pode entregar o corpo aos bocados do tamanho que lhe
     apetecer — os limites não são nossos —, e com um primeiro pedaço pequeno
     uma fotografia verdadeira seria recusada como se estivesse vazia. Foram os
     testes que deram por isto, com imagens pequenas. */
  const guardados = [];
  let cabeca = '';
  while (cabeca.length < 24) {
    const { value, done } = await leitor.read();
    if (done) break;
    if (!value || !value.length) continue;
    guardados.push(value);
    /* O base64 é ASCII, portanto o byte n do corpo é o carácter n do texto. */
    cabeca += String.fromCharCode(...value.subarray(0, 24 - cabeca.length));
  }
  if (!cabeca) return desistir(`Não veio conteúdo em ${nome}.`);

  /* 24 caracteres de base64 dão 18 bytes, que chegam de sobra para distinguir
     JPEG, PNG e WebP — o mais exigente precisa de 12. Descodifica-se só um
     múltiplo de 4, senão o `atob` recusa o resto. */
  let inicio;
  try {
    const bytes = atob(cabeca.slice(0, Math.floor(cabeca.length / 4) * 4));
    inicio = Uint8Array.from({ length: bytes.length }, (_, i) => bytes.charCodeAt(i));
  } catch {
    return desistir(`Não consegui ler ${nome}.`);
  }
  if (!formatoDe(inicio)) {
    return desistir(`${nome} não é uma imagem JPEG, PNG ou WebP.`);
  }

  /* O JSON que o GitHub espera é montado à volta do corpo enquanto ele passa.
     O primeiro pedaço já foi lido, por isso vai à frente; o resto sai do leitor
     como veio. Em nenhum momento existe uma variável com a fotografia toda. */
  const cod = new TextEncoder();
  let contados = guardados.reduce((n, p) => n + p.length, 0);
  /* Verificar JÁ AQUI o que se leu, e não só o que vier a seguir: um corpo
     pequeno o suficiente chega todo num pedaço, o `pull` recebe logo o fim, e
     a contagem nunca era comparada com nada. Deu 200 a um ficheiro de 9 MB. */
  if (Math.floor(contados / 4) * 3 > MAX_POR_FICHEIRO) {
    return desistir(`${nome} é grande de mais.`, 413);
  }
  const fluxo = new ReadableStream({
    start(c) {
      c.enqueue(cod.encode('{"encoding":"base64","content":"'));
      for (const p of guardados) c.enqueue(p);   // o que já se leu para ver o formato
    },
    async pull(c) {
      const { value, done } = await leitor.read();
      if (done) {
        c.enqueue(cod.encode('"}'));
        return c.close();
      }
      /* Rede de segurança para quando não há Content-Length: conta-se o que
         passa e trava-se a meio em vez de deixar entrar um ficheiro sem fim. */
      contados += value.length;
      if (Math.floor(contados / 4) * 3 > MAX_POR_FICHEIRO) {
        await leitor.cancel().catch(() => {});
        return c.error(new Error('ficheiro grande de mais'));
      }
      c.enqueue(value);
    },
    cancel: (r) => leitor.cancel(r),
  });

  const b = await github(`/repos/${REPO}/git/blobs`, ambiente.GITHUB_TOKEN, {
    method: 'POST',
    body: fluxo,
    duplex: 'half',
  });
  return responder({ ok: true, nome, sha: b.sha });
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

    const rota = new URL(pedido.url).pathname;

    /* O /blob é tratado à parte de propósito: o corpo dele é a fotografia, e
       lê-lo para memória — nem que fosse só para tirar de lá a senha — é o
       trabalho que estoirava o orçamento de CPU. Por isso a senha e o nome
       vêm em cabeçalhos, e o corpo passa intocado. */
    if (rota === '/blob') {
      /* UMA PÁGINA VELHA NÃO É UMA SENHA ERRADA.
         --------------------------------------------------------------------
         A senha do /blob mudou de sítio: vinha no corpo em JSON, passou a vir
         no cabeçalho X-Senha, para o Worker não ter de ler a fotografia toma
         memória. Quem tivesse a página aberta de antes continuou a enviá-la
         no corpo — e o Worker, que já só olha para o cabeçalho, respondia
         «Senha errada».

         Foi o que aconteceu ao cliente: passou a manhã a desconfiar da senha,
         que estava certa. Uma mensagem errada custa mais do que a avaria. */
      if (!pedido.headers.get('X-Senha') && !pedido.headers.get('X-Versao')) {
        return responder({
          desactualizada: true,
          erro: 'A página está desactualizada. Feche-a e abra outra vez '
              + 'lrmotorsautomoveis.pt/fotos/ — a senha está certa.',
        }, 409);
      }
      if (!senhaConfere(pedido.headers.get('X-Senha'), ambiente.SENHA)) {
        /* Deixar rasto de uma senha recusada, SEM a escrever.
           ------------------------------------------------------------------
           Isto já aconteceu duas vezes e as duas fui a adivinhar, porque não
           havia registo nenhum de um 401 — só o cliente a dizer «dá senha
           errada» e eu a inventar teorias. O comprimento e a versão chegam
           para distinguir os três casos que interessam:

             0 caracteres      -> o campo chegou vazio
             o comprimento certo mas recusada -> erro de escrita, ou o
                                  gestor de senhas do iPhone a meter outra
             versão em falta   -> página velha, de antes do contrato mudar

           O VALOR nunca vai para o registo: um registo é para se ler, e uma
           senha lida deixa de ser senha. */
        registarRecusa(pedido);
        return responder({ erro: 'Senha errada.' }, 401);
      }
      try {
        return await guardarBlob(pedido, ambiente);
      } catch (e) {
        return avaria(e, rota);
      }
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

    try {
      if (rota === '/pastas') return await listarPastas(ambiente);
      if (rota === '/commit') return await gravarCommit(dados, ambiente);
      return responder({ erro: 'não encontrado' }, 404);
    } catch (e) {
      return avaria(e, rota);
    }
  },
};

/* Só o que serve para diagnosticar, e nada que sirva para entrar. */
function registarRecusa(pedido) {
  const dada = pedido.headers.get('X-Senha');
  console.error('senha recusada', JSON.stringify({
    caracteres: dada === null ? 'cabeçalho ausente' : dada.length,
    versao: pedido.headers.get('X-Versao') || 'nenhuma',
    espacos_nas_pontas: typeof dada === 'string' && dada !== dada.trim(),
    aparelho: (pedido.headers.get('User-Agent') || '').slice(0, 60),
  }));
}

function avaria(e, rota) {
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
