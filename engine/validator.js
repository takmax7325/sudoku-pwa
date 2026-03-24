/* ================================================================
   engine/validator.js
   数独バリデーター
   - isPlacementValid  : セルへの配置可否
   - isGridValid       : グリッド全体の整合性
   - countSolutions    : 解の個数（上限付き高速カウント）
   - hasUniqueSolution : 一意解かどうか
================================================================ */

/**
 * グリッドの (row, col) に val を置けるか判定
 * @param {number[]} grid  長さ81の1次元配列（0=空）
 */
function isPlacementValid(grid, row, col, val) {
  if (val < 1 || val > 9) return false;
  // 行
  for (let c = 0; c < 9; c++) {
    if (c !== col && grid[row * 9 + c] === val) return false;
  }
  // 列
  for (let r = 0; r < 9; r++) {
    if (r !== row && grid[r * 9 + col] === val) return false;
  }
  // ボックス
  const br = ~~(row / 3) * 3, bc = ~~(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if ((r !== row || c !== col) && grid[r * 9 + c] === val) return false;
    }
  }
  return true;
}

/**
 * グリッド全体の行・列・ボックス重複チェック
 */
function isGridValid(grid) {
  for (let i = 0; i < 9; i++) {
    const row = [], col = [], box = [];
    for (let j = 0; j < 9; j++) {
      const rv = grid[i * 9 + j];
      const cv = grid[j * 9 + i];
      const br = ~~(i / 3) * 3, bc = (i % 3) * 3;
      const bv = grid[(br + ~~(j / 3)) * 9 + (bc + j % 3)];
      if (rv && row.includes(rv)) return false; if (rv) row.push(rv);
      if (cv && col.includes(cv)) return false; if (cv) col.push(cv);
      if (bv && box.includes(bv)) return false; if (bv) box.push(bv);
    }
  }
  return true;
}

/**
 * ビットマスクを使った高速ソルバーで解の個数をカウント
 * @param {number[]} grid
 * @param {number}   limit     このカウントに達したら打ち切り（default: 2）
 * @param {number}   nodeLimit 探索ノード上限（default: 8000）
 */
function countSolutions(grid, limit = 2, nodeLimit = 8000) {
  let count = 0, nodes = 0;
  const rm = new Uint16Array(9), cm = new Uint16Array(9), bm = new Uint16Array(9);
  const g = new Uint8Array(81);

  for (let i = 0; i < 81; i++) {
    g[i] = grid[i];
    if (grid[i]) {
      const bit = 1 << grid[i], r = ~~(i / 9), c = i % 9;
      rm[r] |= bit; cm[c] |= bit; bm[~~(r / 3) * 3 + ~~(c / 3)] |= bit;
    }
  }

  // ポップカウント（ビットの1の個数）
  function popcount(n) {
    n -= (n >> 1) & 0x55555555;
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
  }

  function bt() {
    if (count >= limit || nodes >= nodeLimit) return;
    nodes++;
    // MRV（最小残余値ヒューリスティック）で次の空セルを選択
    let best = -1, bestCnt = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const r = ~~(i / 9), c = i % 9;
      const avail = (~(rm[r] | cm[c] | bm[~~(r / 3) * 3 + ~~(c / 3)])) & 0x3FE;
      if (!avail) return; // 候補ゼロ → 矛盾
      const cnt = popcount(avail);
      if (cnt < bestCnt) { bestCnt = cnt; best = i; if (cnt === 1) break; }
    }
    if (best === -1) { count++; return; } // 全埋め → 解発見

    const r = ~~(best / 9), c = best % 9, b = ~~(r / 3) * 3 + ~~(c / 3);
    let avail = (~(rm[r] | cm[c] | bm[b])) & 0x3FE;
    while (avail) {
      const bit = avail & -avail; avail ^= bit;
      g[best] = 31 - Math.clz32(bit);
      rm[r] |= bit; cm[c] |= bit; bm[b] |= bit;
      bt();
      rm[r] ^= bit; cm[c] ^= bit; bm[b] ^= bit;
      if (count >= limit) break;
    }
    g[best] = 0;
  }

  bt();
  return count;
}

/** 一意解かどうかを返す */
function hasUniqueSolution(grid) {
  return countSolutions(grid, 2) === 1;
}
