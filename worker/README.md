# Worker que recebe as fotografias

Isto liga a página `lrmotorsautomoveis.pt/fotos/` à biblioteca de Media do
backoffice: o cliente escolhe as fotografias no telemóvel, elas são reduzidas
ali mesmo, e chegam ao repositório numa pasta só delas — prontas a ser
escolhidas no anúncio da viatura.

Sem isto instalado, a página continua a funcionar: reduz as fotografias e
guarda-as no telemóvel, para depois serem carregadas à mão pelo backoffice.

## Porque não pode ser a página a falar com o GitHub

Escrever no repositório exige uma chave, e o repositório é **público** — tem
de ser, porque publicar o GitHub Pages a partir de um repositório privado
exige o plano Pro, pago. Tudo o que estivesse dentro do `fotos.html` estaria
à vista em `github.com`, chave incluída. O endereço `/fotos/` ser pouco
conhecido não protege coisa nenhuma.

Aqui a chave é um *secret* do Worker: fica do lado do servidor e nunca sai. O
cliente prova quem é com uma senha, e é só a senha que viaja.

Mesmo que a senha se saiba, o estrago é limitado de propósito: o Worker só
aceita imagens (verificadas pelos **bytes**, não pela extensão — um SVG com
JavaScript lá dentro renomeado para `.jpg` é recusado), só escreve dentro de
`assets/veiculos/`, e valida o nome da pasta contra uma forma fixa. Não há
por ali caminho para tocar no código ou nos dados do site.

## Instalar (uma vez, ~15 minutos)

### 1. A chave do GitHub

Em <https://github.com/settings/personal-access-tokens/new>:

- **Token name:** `lrmotors-fotos`
- **Expiration:** 1 ano (apontar a data para renovar)
- **Repository access:** *Only select repositories* → `renatovalente5/LR_Motors`
- **Permissions → Repository permissions → Contents:** `Read and write`

Não dar mais nada. Só isto é preciso, e é o que limita o que a chave pode
fazer se algum dia se perder.

Copiar a chave — só aparece uma vez.

### 2. Uma senha para o cliente

Gerar uma longa e ao acaso; não é para memorizar, é escrita uma vez no
telemóvel e fica lá guardada:

```bash
LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 32; echo
```

### 3. Publicar o Worker

**Já está feito.** O Worker está no ar em

```
https://lrmotors-fotos.renato-lima-valente-dcb.workers.dev
```

na conta `renato.lima.valente@gmail.com`, e a `SENHA` já lá está. Falta só o
`GITHUB_TOKEN` do passo 1:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Para voltar a publicar depois de mexer no código, a partir desta pasta:

```bash
npx wrangler deploy
```

Cabe folgadamente no plano gratuito da Cloudflare: são 100 000 pedidos por
dia, e aqui são uns quantos por semana.

### 4. Dizer ao site onde está

Em `data/definicoes.json`, pôr esse endereço em `tecnico.worker_fotos`, e
publicar. A secção «Enviar para o backoffice» passa a aparecer em `/fotos/`.

### 5. Dar ao cliente

O endereço `lrmotorsautomoveis.pt/fotos/` e a senha. Mais nada — a senha só é
escrita à primeira vez.

## Porque não se usa aqui a chave do `gh`

O `gh` desta máquina tem um token com os âmbitos `gist`, `read:org`, `repo` e
`workflow` — ou seja, escrita em **todos** os repositórios da conta, mais os
workflows. Um Worker está aberto à Internet e defendido por uma senha; se a
senha se souber, o que essa chave dava era escrita em tudo o que lá está
(Marmovar, HN Transportes, PokeAuto, Praiómetro…) e a possibilidade de mudar
o que as Actions correm.

A chave fina do passo 1 dá escrita no conteúdo de **um** repositório e mais
nada. Custa dois minutos e é a diferença entre um problema e um desastre.

## Não devolver 500

A Cloudflare troca o corpo de uma resposta **500** pela sua própria página de
erro (`error code: 1104`), e a mensagem em JSON que a página precisa de ler
nunca chega. Aconteceu em cerca de metade dos pedidos, ao acaso — parecia
avaria intermitente e era só isto.

Os 4xx passam sempre, e o 502 e o 503 também (verificado em oito e dez pedidos
seguidos, zero mangados). Por isso o «não está configurado» é 503 e a avaria
genérica é 502.

## Testes

```bash
node worker/testar.mjs
```

48 testes com a API do GitHub simulada — sem rede, sem chaves, sem conta na
Cloudflare. Correr sempre que se mexer no `enviar-fotos.js`. Verificam o que
impede um estranho de fazer estragos: quem entra, que ficheiros passam, onde
podem ir parar, e se o commit é mesmo um só.

## Se alguma coisa correr mal

```bash
npx wrangler tail
```

Mostra os registos em directo. Os erros do GitHub ficam aí com o detalhe todo;
ao cliente vai só uma frase, para não lhe despejar respostas de API à frente.

## O que este Worker faz, ao certo

Três rotas, todas por POST e todas a exigir a senha:

| Rota | Faz |
|---|---|
| `/pastas` | Devolve as pastas que já existem, para a página propor um nome livre |
| `/blob` | Recebe UMA fotografia, verifica-a e guarda-a solta no GitHub |
| `/commit` | Junta as fotografias todas num **único** commit |

Uma de cada vez porque 50 fotografias em base64 são 67 MB, e um Worker tem
128 MB de memória — num pedido só não cabia.

Um único commit porque a alternativa óbvia (a API de conteúdos do GitHub, um
`PUT` por ficheiro) daria um commit por fotografia, e vinte fotografias seriam
vinte publicações do site em catadupa.

O commit é feito com `force: false`: se o backoffice tiver gravado alguma
coisa entretanto, o envio falha e pede para repetir, em vez de passar por cima.
