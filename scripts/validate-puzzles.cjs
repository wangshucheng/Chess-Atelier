// 临时脚本：验证所有习题的 solution 合法性 + 是否以将杀结尾
const { Chess } = require('chess.js');
const puzzles = require('../public/puzzles.json');

let allOk = true;
for (const p of puzzles) {
  const game = new Chess(p.fen);
  let ok = true;
  let errMsg = '';
  for (let i = 0; i < p.solution.length; i++) {
    try {
      const m = game.move(p.solution[i]);
      if (!m) {
        ok = false;
        errMsg = `Step ${i} "${p.solution[i]}" returned null`;
        break;
      }
    } catch (e) {
      ok = false;
      errMsg = `Step ${i} "${p.solution[i]}" threw: ${e.message}`;
      break;
    }
  }
  const isMate = game.isCheckmate();
  const isGameOver = game.isGameOver();
  const status = ok ? (isMate ? 'MATE' : isGameOver ? 'GAMEOVER' : 'NOT-MATE') : 'INVALID';
  if (!ok || !isMate) allOk = false;
  console.log(`${p.id} | L${p.level} | ${status} | valid=${ok} | mate=${isMate}${ok ? '' : ' | ERR: ' + errMsg}`);
}

console.log('\n' + (allOk ? 'ALL OK' : 'SOME PUZZLES BROKEN'));
