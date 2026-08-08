# LR Motors — plano de construção

Stand online para a **Luís & Ricardo Motors, Lda** (LR Motors), Vila Verde, Braga.
Alojado em GitHub Pages, orçamento zero, cliente autónomo a gerir o stock.

---

## Decisões de arquitectura

**Site estático gerado por um script próprio, sem dependências.**

O cliente edita ficheiros JSON num backoffice; um GitHub Action corre um gerador
em Node e publica HTML já pronto. Porquê assim:

- **Uma página HTML por viatura, indexável.** É o requisito de SEO que decide a
  arquitectura. Um site que desenha os anúncios em JavaScript no browser deixa o
  Google dependente de renderização — mais lento a indexar e mais frágil. Com
  páginas geradas, cada viatura tem URL própria, `<title>`, meta description e
  JSON-LD no HTML de origem.
- **Zero dependências npm.** Um stand não tem quem faça manutenção. Um gerador de
  ~200 linhas em Node puro não apodrece: não há `npm audit`, não há major
  versions a partir builds daqui a dois anos. Astro e Eleventy são melhores
  ferramentas, mas trazem uma árvore de dependências que ninguém aqui vai manter.
- **Backoffice = Pages CMS.** Já validado ponta-a-ponta noutro projecto meu: o
  cliente entra com um link mágico por email, **sem conta GitHub**, e os commits
  vão direitos ao repositório. Alternativas (Sveltia, Decap) exigem conta GitHub
  ou um Worker de OAuth próprio.

**Imagens no próprio repositório**, convertidas para WebP em três larguras. Sem
CDN externo: menos uma dependência, menos um sítio onde o RGPD tem de ser
avaliado, e o volume não justifica (13 MB para 31 fotos).

---

## Fase 1 — Fundação

1. Estrutura de pastas, git, remoto. **feito**
2. Extrair o logótipo do PDF para SVG vectorial, com a cor em `currentColor` para
   poder inverter em fundo escuro. **feito**
3. Sistema de design a partir do logótipo: azul de marca `#004AAD`, escala de
   cinzentos, tipografia, espaçamentos, raios. Tokens em CSS.
4. Pipeline de imagens: WebP 480/960/1600 + miniatura de cartão. **feito**

## Fase 2 — Dados e conteúdo

5. Modelo de dados de uma viatura, que sirva **carros, motos e off-road**.
6. Catálogo inicial com o stock real lido dos cartazes das redes sociais.
7. Ficheiro de definições do site (contactos, horário, textos) editável no
   backoffice.

## Fase 3 — Gerador e páginas

8. Gerador em Node: lê os JSON, escreve as páginas.
9. Página inicial: destaque, pesquisa rápida, viaturas em destaque, porquê a LR.
10. Listagem `/viaturas/` com filtros.
11. Página de viatura com galeria, ficha técnica, equipamento e contacto directo.
12. Contactos com mapa, e páginas legais.

## Fase 4 — Interacção

13. Navbar com logótipo grande que encolhe ao descer e volta ao subir.
14. Menu de telemóvel em ecrã inteiro.
15. Filtros instantâneos, sem recarregar, com estado no URL.
16. Galeria com lightbox, teclado e gesto de arrastar.

## Fase 5 — SEO

17. JSON-LD: `AutoDealer` no site, `Vehicle`+`Offer` em cada viatura,
    `BreadcrumbList` na navegação.
18. `sitemap.xml`, `robots.txt`, canónicos, Open Graph e Twitter Card.
19. Core Web Vitals: dimensões explícitas em todas as imagens, `loading=lazy`
    excepto a primeira, `fetchpriority` no LCP, fontes locais.
20. Tratamento de viaturas vendidas sem criar 404.

## Fase 6 — Conformidade

21. Identificação legal exigida pelo DL 7/2004.
22. Livro de Reclamações electrónico, junto aos restantes links legais.
23. Política de privacidade e termos, RGPD no formulário.
24. Mapa sem cookies antes de consentimento.
25. Garantia legal de conformidade dos bens usados.

## Fase 7 — Backoffice

26. `.pages.yml` com as colecções: viaturas, definições.
27. GitHub Action: gerar o site e optimizar automaticamente as fotos que o
    cliente carregar.
28. Manual do cliente, em português e sem jargão.

## Fase 8 — Verificação

29. Responsivo a 320 / 390 / 768 / 1280 / 1920.
30. Acessibilidade: contraste, foco, navegação por teclado, leitor de ecrã.
31. Validar HTML, JSON-LD e sitemap.
32. Publicar e confirmar em produção.
