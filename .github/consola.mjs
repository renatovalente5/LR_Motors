/* O QUE OS SCRIPTS DO CI ESCREVEM NA CONSOLA, quando leva dados lá dentro.
 *
 * O runner do GitHub não se limita a guardar o que um passo escreve: lê-o à
 * procura de comandos, e conhece dois formatos (actions/runner,
 * src/Runner.Common/ActionCommand.cs):
 *   · «::comando ...::texto» no PRINCÍPIO de uma linha (depois dos espaços);
 *   · «##[comando ...]texto» EM QUALQUER SÍTIO de uma linha — o formato antigo,
 *     que o runner ainda lê quando a linha não é do novo.
 * Um dado com uma mudança de linha (o caminho de uma fotografia, uma marca)
 * abria uma linha nova a começar por «::error …»; um «##[error]» numa marca nem
 * precisava disso. Era assim que os dados do repositório — que o dono, o Pages
 * CMS ou o painel escrevem — punham erros e avisos falsos na corrida, ou
 * escondiam texto com um add-mask.
 *
 * umaLinha(): os caracteres de controlo (C0, DEL e C1: \p{Cc}) e os separadores
 * de linha e de parágrafo do Unicode (\p{Zl}, \p{Zp}) passam a um espaço, e o
 * «##[» leva um espaço no meio. O resto fica como está: é para uma pessoa ler.
 * Os comandos que os próprios scripts emitem (as anotações da guarda) não
 * passam por aqui — escapam-se à maneira deles.
 *
 * Por classes do Unicode e não por escapes de cada carácter: as ferramentas de
 * edição trocam alguns desses escapes pelo próprio carácter, e um separador de
 * linha literal dentro de uma expressão regular parte o ficheiro. */
export const umaLinha = (s) => String(s ?? '')
  .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
  .replace(/##\[/g, '## [');
