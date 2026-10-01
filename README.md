# LR Motors — o site

Stand online da **Luís & Ricardo Motors, Lda** (LR Motors), Vila Verde, Braga.
Site estático em GitHub Pages, sem custos de alojamento. O stand gere o stock
sozinho, num painel próprio.

**Site:** https://lrmotorsautomoveis.pt
**Painel (backoffice):** https://backoffice.lrmotorsautomoveis.pt

---

## Para o stand — como gerir o stock

Tudo se faz no **painel**, no telemóvel ou no computador. Não é preciso conta no
GitHub nem perceber nada de programação. O painel tem um ecrã de **Ajuda**.

### Entrar

1. Abra https://backoffice.lrmotorsautomoveis.pt.
2. Escreva o seu email e carregue em entrar: recebe um código por email.
   Escreva-o no painel.

Só entram os emails autorizados.

### Pôr um carro à venda

1. **Viaturas** → **Nova viatura**.
2. Preencha. O endereço da página sai sozinho da marca, do modelo e da versão, e
   não muda depois — é o link que se partilha.
   - **Preço**: em euros, o valor final com impostos. É o que a lei exige a quem
     anuncia preços.
   - **Fotografias**: escolha-as no telemóvel, mesmo grandes — o painel reduz-as
     antes de as enviar, e tira-lhes os metadados (as coordenadas do GPS
     incluídas). **A primeira é a capa**: aparece na listagem e nas partilhas do
     WhatsApp e do Facebook. Use o carro inteiro, de três quartos à frente.
3. **Gravar**. Em 1 a 3 minutos está no site; o ecrã **Publicação** mostra
   quando ficou.

### Vender ou reservar

Não apague o anúncio. Mude o **Estado**:

- **Reservado** ou **Brevemente** — continua visível, com etiqueta.
- **Vendido** — passa para as **Vendidas** e sai do stock à venda. O endereço
  antigo leva à lista das viaturas, para quem tenha o link guardado. Uma venda
  que se desfaça volta a pôr-se à venda a partir das Vendidas.

### Mudar contactos, horário ou textos

**Dados do stand** → altere → **Gravar**.

O que o painel assinala por baixo de um campo é o que o site precisa para
publicar, ou o que a lei pede ao anúncio — está explicado ali mesmo.

---

## Para quem mexer no código

### Como está montado

| | |
|---|---|
| Alojamento | GitHub Pages, publicado por GitHub Actions (`.github/workflows/publicar.yml`) |
| Domínio | `lrmotorsautomoveis.pt` (o ficheiro `CNAME`, copiado para o `_site`); o site serve na raiz |
| Conteúdo | `data/viaturas/<slug>.json` (um ficheiro por viatura; as vendidas em `data/viaturas/vendidas/`) e `data/definicoes.json` |
| Fotos | `assets/veiculos/` é a **biblioteca** — o que o painel carrega, um ficheiro por fotografia. Para o site só saem jpg, jpeg, png e webp |
| Fotos que vão para o ar | `assets/fotos/<pasta>/` — as três larguras em WebP, geradas na publicação |
| Cartão de partilha | `assets/fotos/partilha/<slug>.jpg` — um por viatura, cortado da **capa** (a primeira fotografia da lista) para o `og:image` do WhatsApp |
| Gerador | `scripts/gerar.mjs` — Node puro, **zero dependências** |
| Imagens | `scripts/otimizar-imagens.py` — Pillow, numa versão fixa no `publicar.yml` |
| Backoffice | **o painel**, https://backoffice.lrmotorsautomoveis.pt: um Worker da Cloudflare, num repositório próprio (privado, `renatovalente5/lr-motors-painel`), que grava neste por uma GitHub App |
| Regras dos dados | `.github/regras.mjs` — as mesmas no painel (que guarda uma cópia byte a byte) e na guarda da publicação (`.github/guardas.mjs`) |

**O que o painel grava aqui**, e mais nada: `data/viaturas/<slug>.json`,
`data/viaturas/vendidas/<slug>.json`, `data/definicoes.json` e as fotografias
em `assets/veiculos/<slug>/`. Nunca o código (`.github/`, `scripts/`), os
conteúdos legais (`conteudo/`), as fotografias geradas (`assets/fotos/`) nem o
`CNAME`. Uma viatura vendida muda de pasta no mesmo commit em que se grava.

**Porquê um gerador próprio e não Astro ou Jekyll:** as páginas que valem
dinheiro num stand são as de cada viatura. Precisam de existir em HTML no
código-fonte — não só depois de o JavaScript correr — porque os robôs de
pré-visualização de links do **WhatsApp, Facebook e Instagram não executam
JavaScript**, e é por aí que este negócio partilha carros. Um gerador sem
dependências resolve isso e não apodrece: não há `npm install`, não há versões
a partir o build daqui a dois anos.

### A publicação

Cada commit em `main` — os do painel incluídos — corre o `publicar.yml`: a
guarda do conteúdo (as regras), a arrumação das vendidas, as fotografias
preparadas, o commit de volta do CI (`[skip ci]`), a cópia dos dados que o
gerador lê, o gerador, as verificações e o `deploy-pages`. A guarda só **pára**
a publicação no que partiria o site ou a lei (a estrutura, os dados legais); uma
viatura com problemas fica escondida ou sem a fotografia em falta, e o resto
publica. Quando pára, ou quando uma viatura muda no site por causa dos dados,
abre-se a issue «Publicação parada».

No painel, o ecrã **Publicação** mostra as corridas e tem o «Publicar outra
vez». À mão: Actions → Publicar site → Run workflow.

> Em **Settings → Pages**, a origem tem de estar em **GitHub Actions**. Na opção
> antiga o GitHub tenta processar o repositório com Jekyll e publica a fonte.

### Correr localmente

```bash
BASE= SITE=http://localhost:4200 node scripts/gerar.mjs
python3 -m http.server 4200 --directory _site
```

Em produção o `BASE` também é vazio (o domínio próprio serve na raiz) e o `SITE`
é `https://lrmotorsautomoveis.pt` — ver o passo «Gerar o site» do
`publicar.yml`. **Nunca escrever caminhos absolutos à mão** — usar sempre o
`u()` do gerador.

### Testes

```bash
PYTHON=<python com Pillow> node .github/test-guardas.mjs   # as regras, a guarda e o CI de ponta a ponta
node .github/test-gerador.mjs                               # o gerador, também com dados hostis
.github/comparar-site.sh main HEAD                          # a prova de que uma mudança não mexe no _site
python3 scripts/testar-cartoes.py                           # o cartão de partilha (corre também na publicação)
```

As baterias têm de passar duas vezes seguidas. Mudar as regras
(`.github/regras.mjs`) obriga a copiá-las para o painel.

### Fotografias

```bash
python3 scripts/otimizar-imagens.py --varrer      # gera o que falta
```

Os originais ficam em `_fonte/originais/`, **fora do repositório** (ver
`.gitignore`). Foi de propósito: uma vez comitados, os ficheiros ficam na
história do Git para sempre e o repositório nunca mais encolhe.

---

## Conformidade legal

Verificado para um stand de usados (Lda) em Vila Verde:

- **Identificação** no rodapé de todas as páginas — firma, forma jurídica,
  capital social, matrícula, NIPC e sede. Exigido pelo art. 171.º do Código das
  Sociedades Comerciais e pelo art. 10.º do DL 7/2004. *O capital social está lá
  por imposição legal, não por opção.*
- **Livro de Reclamações electrónico** com ligação em todas as páginas
  (DL 156/2005).
- **Resolução de litígios**: a entidade competente para Vila Verde é o **CIAB —
  Tribunal Arbitral de Consumo**, de Braga. Até 5.000 € a arbitragem é
  *necessária* se o consumidor a escolher. A plataforma ODR europeia foi
  desactivada em julho de 2025 e por isso **não** aparece no site.
- **Garantia**: página própria a explicar o DL 84/2021 — 3 anos, reduzíveis a
  18 meses em usados só por acordo escrito.
- **Preços** em euros com impostos incluídos (DL 138/90).
- **Sem cookies**: o site não tem analítica, publicidade, tipos de letra
  externos nem *embeds*. Por isso **não tem banner de cookies** — não é preciso.
  O mapa do Google só carrega depois de a pessoa carregar no botão.
- **Custo da chamada** indicado junto de cada número (DL 59/2021).
- O site é uma **montra**: não vende, não reserva e não recebe pagamentos, pelo
  que não se aplica o regime dos contratos à distância.

### Por confirmar com o cliente

- **Intermediação de crédito.** O site diz que há financiamento, sem taxas nem
  mensalidades — o que é seguro. Se a LR Motors apresentar propostas de
  financiadoras, tem de estar registada no Banco de Portugal como intermediária
  de crédito e indicá-lo no site (DL 81-C/2017).
- **Conservatória do registo comercial.** No rodapé está a fórmula genérica com
  o número único de matrícula. Se quiserem nomear a conservatória, é preciso
  confirmá-la.
- **Vila do Conde.** A informação da empresa fala em «Braga e Vila do Conde»,
  mas só há morada para Vila Verde. Se houver segundo espaço, falta a morada.

---

## O que a lei pede a cada anúncio

O painel lembra, em cada viatura à venda, o que falta do que a lei dos usados
pede ao anúncio (**DL 74/93**: matrícula, donos anteriores, ano de construção
quando difere do da matrícula), o **preço** (DL 138/90 — sem ele o site mostra
«Sob consulta») e a **garantia** (num usado, abaixo de 18 meses não é legal —
DL 84/2021). Lembra, não impede de gravar.
