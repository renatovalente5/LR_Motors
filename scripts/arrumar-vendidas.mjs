#!/usr/bin/env node
/* ============================================================================
   Arruma as viaturas vendidas na sua própria pasta.
   ============================================================================
   O cliente pediu que as vendidas saiam do caminho: no backoffice, quem trata
   do stock quer ver o que está à venda, não um histórico a crescer para sempre.

   Mas o backoffice (Pages CMS) não sabe mover ficheiros entre pastas — o que
   ele tem, `rename`, só funciona dentro do caminho da própria colecção. Então
   quem move é isto, na publicação: olha para o campo `estado` de cada viatura e
   põe o ficheiro do lado certo.

       estado = "vendido"   →  data/viaturas/vendidas/<slug>.json
       qualquer outro       →  data/viaturas/<slug>.json

   Move nos DOIS sentidos de propósito. Uma venda que se desfaz — e desfazem-se
   — é marcada como disponível na pasta das Vendidas, e o ficheiro volta
   sozinho para o stock. Se só movesse num sentido, ficava lá encalhada.

   O site não depende disto: o gerador lê as duas pastas e é o campo `estado`,
   não a pasta, que manda no que aparece. Isto é arrumação, não é publicação —
   e é por isso que uma falha a gravar não deita a publicação abaixo.
   ========================================================================== */
import { readFileSync, readdirSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const STOCK = join(RAIZ, 'data/viaturas');
const VENDIDAS = join(STOCK, 'vendidas');

const jsons = (pasta) =>
  (existsSync(pasta) ? readdirSync(pasta) : []).filter((f) => f.endsWith('.json'));

const mudancas = [];
const erros = [];

const planear = (deOnde, paraOnde, querVendido) => {
  for (const f of jsons(deOnde)) {
    const origem = join(deOnde, f);
    let dados;
    try {
      dados = JSON.parse(readFileSync(origem, 'utf8'));
    } catch (e) {
      /* Um JSON partido não é problema desta arrumação — quem se queixa dele é
         o gerador, a seguir, com uma mensagem melhor. Aqui deixa-se estar. */
      console.warn(`  (ignorado, não é JSON válido: ${relative(RAIZ, origem)})`);
      continue;
    }
    const vendido = dados.estado === 'vendido';
    if (vendido !== querVendido) continue;

    const destino = join(paraOnde, f);
    if (existsSync(destino)) {
      /* Já lá está um ficheiro com este nome e outro conteúdo. Mover por cima
         apagava uma viatura inteira sem deixar rasto. Não se mexe. */
      erros.push(`"${f}" já existe em ${relative(RAIZ, paraOnde)}/ — não se move por cima`);
      continue;
    }
    mudancas.push({ origem, destino, modelo: `${dados.marca ?? ''} ${dados.modelo ?? ''}`.trim() });
  }
};

/* Vendidas que ainda estão no stock → para dentro. */
planear(STOCK, VENDIDAS, true);
/* E o contrário: as que estão nas vendidas e já não estão vendidas → para fora. */
planear(VENDIDAS, STOCK, false);

if (erros.length) {
  console.error('\nERRO ao arrumar as vendidas:');
  for (const e of erros) console.error(`  ${e}`);
  console.error('');
  process.exit(1);
}

if (!mudancas.length) {
  console.log('Vendidas: nada a arrumar.');
  process.exit(0);
}

mkdirSync(VENDIDAS, { recursive: true });
for (const { origem, destino, modelo } of mudancas) {
  renameSync(origem, destino);
  const sentido = destino.startsWith(VENDIDAS) ? 'vendida →' : 'de volta ao stock ←';
  console.log(`  ${sentido} ${modelo || relative(RAIZ, destino)}`);
}
console.log(`Vendidas: ${mudancas.length} ficheiro(s) arrumado(s).`);
