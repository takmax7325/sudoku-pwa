/* ================================================================
   engine/generator.js
   数独問題ジェネレーター

   - seededRng           : シード付き乱数
   - shuffle             : 配列シャッフル
   - generateFullSolution: フル解生成（バックトラッキング + ランダム）
   - generatePuzzle      : 問題生成（削除フェーズ + ロジック難易度確認）
   - generateInsanePuzzle: 鬼難問専用（XY-Wing + Swordfish 必須）

   【重要な改善点】
   既存の実装はヒント数（空きマス数）で難易度を決めていたが、
   この実装は solveLogically + evaluateDifficulty を使って
   「論理的な難しさ」が目標難易度と一致する問題だけを返す。
================================================================ */

/** 配列をシャッフル（Fisher-Yates） */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** シード付き乱数生成器（xorshift32） */
function seededRng(seed) {
  let s = (seed >>> 0) || 0xdeadbeef;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 7;  s >>>= 0;
    s ^= s << 17; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * フル解を生成する（バックトラッキング + ランダムシャッフル）
 * MRV（最小残余値）ヒューリスティックで高速化
 * @param {function} rngFn  乱数関数（0〜1）
 * @returns {number[]}  長さ81の完成グリッド
 */
function generateFullSolution(rngFn) {
  const g = new Array(81).fill(0);

  function bt() {
    // MRV: 候補数が最小の空セルを選ぶ
    let best = -1, bestCnt = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let cnt = 0;
      const r = ~~(i / 9), c = i % 9;
      for (let v = 1; v <= 9; v++) if (isPlacementValid(g, r, c, v)) cnt++;
      if (!cnt) return false;
      if (cnt < bestCnt) { bestCnt = cnt; best = i; }
    }
    if (best === -1) return true;

    const r = ~~(best / 9), c = best % 9;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rngFn);
    for (const v of nums) {
      if (isPlacementValid(g, r, c, v)) {
        g[best] = v;
        if (bt()) return true;
        g[best] = 0;
      }
    }
    return false;
  }

  bt();
  return g;
}

// 難易度ごとの最小ヒント数（削除上限の目安）
const DIFF_MIN_CLUES = {
  easy:   36,
  normal: 30,
  hard:   26,
  expert: 23,
  insane: 20,
};

// 難易度ごとの最大試行数（ロジック難易度確認込み）
const DIFF_MAX_ATTEMPTS = {
  easy:   200,
  normal: 300,
  hard:   400,
  expert: 600,
  insane: 1500,
};

/**
 * 問題を生成する（メインAPI）
 *
 * 手順:
 *   1. フル解を生成
 *   2. ランダムな順でセルを削除（一意解チェック付き）
 *   3. ロジックソルバーで難易度を確認
 *   4. 目標難易度と一致すれば返す（一致しなければ再挑戦）
 *
 * @param {string}   difficulty  'easy'|'normal'|'hard'|'expert'|'insane'
 * @param {number|null} seed     乱数シード（null でランダム）
 * @returns {Promise<{grid:number[], solution:number[]}>}
 */
async function generatePuzzle(difficulty, seed = null) {
  const rng = seed !== null ? seededRng(seed) : Math.random.bind(Math);
  const minClues = DIFF_MIN_CLUES[difficulty] ?? 26;
  const maxAttempts = DIFF_MAX_ATTEMPTS[difficulty] ?? 300;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // UIをブロックしないよう定期的に制御を返す
    if (attempt % 10 === 9) await new Promise(r => setTimeout(r, 0));

    const solution = generateFullSolution(rng);
    const puzzle = [...solution];
    const indices = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);

    // 削除フェーズ
    let clues = 81;
    for (const idx of indices) {
      if (clues <= minClues) break;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      clues--;
      if (!hasUniqueSolution(puzzle)) {
        puzzle[idx] = backup;
        clues++;
      }
    }

    // ロジック難易度確認（核心的改善点）
    const { solved, steps } = solveLogically(puzzle);
    if (!solved) continue; // ロジックで解けない問題は除外
    const actualDiff = evaluateDifficulty(steps);
    if (actualDiff !== difficulty) continue; // 難易度ミスマッチは再生成

    return { grid: puzzle, solution };
  }

  // タイムアウト：許容範囲の問題をフォールバック返却
  console.warn(`[Generator] ${difficulty}: fallback after ${maxAttempts} attempts`);
  return _fallbackGenerate(difficulty, rng);
}

/**
 * フォールバック生成（ロジック難易度確認なし・ヒント数ベース）
 * タイムアウト時のみ使用
 */
function _fallbackGenerate(difficulty, rng) {
  const minClues = DIFF_MIN_CLUES[difficulty] ?? 26;
  const solution = generateFullSolution(rng);
  const puzzle = [...solution];
  const indices = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);

  let clues = 81;
  for (const idx of indices) {
    if (clues <= minClues) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    clues--;
    if (!hasUniqueSolution(puzzle)) {
      puzzle[idx] = backup;
      clues++;
    }
  }
  return { grid: puzzle, solution };
}

/**
 * 鬼難問（insane）専用生成
 * XY-Wing と Swordfish を両方含む問題のみ返す
 * @param {number} maxAttempts
 * @returns {Promise<{grid:number[], solution:number[]}|null>}
 */
async function generateInsanePuzzle(maxAttempts = 2000) {
  const rng = Math.random.bind(Math);
  const minClues = DIFF_MIN_CLUES.insane;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt % 10 === 9) await new Promise(r => setTimeout(r, 0));

    const solution = generateFullSolution(rng);
    const puzzle = [...solution];
    const indices = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);

    let clues = 81;
    for (const idx of indices) {
      if (clues <= minClues) break;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      clues--;
      if (!hasUniqueSolution(puzzle)) {
        puzzle[idx] = backup;
        clues++;
      }
    }

    const { solved, steps } = solveLogically(puzzle);
    if (!solved) continue;
    const actualDiff = evaluateDifficulty(steps);
    if (actualDiff !== 'insane') continue;

    const usedTechs = new Set(steps.map(s => s.technique));
    if (!usedTechs.has('XY-Wing') || !usedTechs.has('Swordfish')) continue;

    return { grid: puzzle, solution };
  }

  console.warn('[Generator] Insane: fallback without XY-Wing+Swordfish requirement');
  return generatePuzzle('insane');
}
