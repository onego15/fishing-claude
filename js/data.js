/* Lumina Mere — game data: fish, upgrades
 * behaviour: weights of fish actions during the reel-in duel
 *   pull  : steady strong pull (release to protect the line)
 *   dash  : short sideways sprint, small pull, line swings
 *   jump  : leaps out of the water; release while airborne, press on splash-down
 *   dive  : heavy downward pull, the strongest
 *   vanish: the fish melts into the mist, tension gauge is hidden
 */
'use strict';

(function (LM) {
  const FISH = [
    {
      id: 'minamobuna', name: 'ミナモブナ', en: 'Ripple Crucian', rarity: 1, size: 22, value: 18,
      periods: ['dawn', 'day', 'dusk', 'night'], weather: ['clear', 'rain', 'fog'], zone: [0, 1],
      beh: { pull: 3, dash: 1 }, power: 0.55, stamina: 1.0, tele: 0.55,
      look: { len: 20, ht: 10, top: '#5d6b3a', mid: '#a59a4c', belly: '#e8dc9a', fin: '#7c6a36', finHi: '#b3a058', pattern: 'scales', patCol: '#c3b25e', tail: 'fork', dorsal: 0.55, seed: 11 },
      desc: '湖のどこにでもいる、ひかえめな金色のフナ。波紋に映る空を眺めて暮らすという。',
      trait: 'おだやか。素直に引いてくる。',
    },
    {
      id: 'ruriaze', name: 'ルリハゼ', en: 'Lapis Goby', rarity: 1, size: 9, value: 14,
      periods: ['dawn', 'day'], weather: ['clear', 'rain'], zone: [0],
      beh: { dash: 3, pull: 1 }, power: 0.45, stamina: 0.7, tele: 0.45,
      look: { len: 14, ht: 6, top: '#1f3f8a', mid: '#3a76c8', belly: '#a9d4f0', fin: '#2a5ab0', finHi: '#6fb0f0', pattern: 'spots', patCol: '#bfe8ff', tail: 'round', dorsal: 0.7, blunt: 0.45, seed: 22 },
      desc: '瑠璃色の小さなハゼ。浅瀬の石の陰で、陽だまりを独り占めしている。',
      trait: 'すばしっこく左右に走る。',
    },
    {
      id: 'sakuraugui', name: 'サクラウグイ', en: 'Blossom Dace', rarity: 1, size: 18, value: 22,
      periods: ['day', 'dusk'], weather: ['clear', 'rain', 'fog'], zone: [1],
      beh: { dash: 4, pull: 2 }, power: 0.6, stamina: 1.0, tele: 0.45,
      look: { len: 22, ht: 7, top: '#6a5a7e', mid: '#d6c7d8', belly: '#f6eef2', fin: '#e07a9a', finHi: '#ffb0c4', pattern: 'band', patCol: '#f08aa8', tail: 'fork', dorsal: 0.45, seed: 33 },
      desc: '春に灯樹の花びらを食べたウグイは、一年じゅう桜色の帯をまとう。',
      trait: '鋭いダッシュをくり返す。',
    },
    {
      id: 'tsuyuhikari', name: 'ツユヒカリマス', en: 'Dewlight Trout', rarity: 2, size: 34, value: 48,
      periods: ['dawn', 'day'], weather: ['clear'], zone: [1, 2],
      beh: { jump: 3, pull: 2, dash: 1 }, power: 0.75, stamina: 1.2, tele: 0.5,
      look: { len: 28, ht: 9, top: '#4a6a6a', mid: '#b8cccc', belly: '#f2f6f2', fin: '#7a9a96', finHi: '#bfe0d8', pattern: 'band', patCol: '#f0a0c8', tail: 'fork', dorsal: 0.45, seed: 44, hi: '#e6fff8' },
      desc: '朝露のしずくを鱗に宿すマス。晴れた朝、水面を跳ねて虹を描く。',
      trait: 'よく跳ねる。跳ねたら糸をゆるめ、着水の瞬間に巻け。',
    },
    {
      id: 'yuyakegoi', name: 'ユウヤケゴイ', en: 'Sunset Koi', rarity: 2, size: 45, value: 55,
      periods: ['dusk'], weather: ['clear', 'rain', 'fog'], zone: [1, 2],
      beh: { pull: 4, rest: 1 }, rhythm: 1.25, power: 0.8, stamina: 1.4, tele: 0.6,
      look: { len: 30, ht: 13, top: '#c2541e', mid: '#f0f0e6', belly: '#fffaf0', fin: '#e8a070', finHi: '#ffe0c0', pattern: 'koi', patCol: '#e8501e', tail: 'long', dorsal: 0.5, seed: 55, whisker: true },
      desc: '夕焼けを背負って泳ぐ鯉。一定のリズムで力強く引く、湖の古老。',
      trait: '規則正しいリズムで強く引く。',
    },
    {
      id: 'hoshikuzu', name: 'ホシクズメダカ', en: 'Stardust Medaka', rarity: 1, size: 6, value: 20,
      periods: ['night'], weather: ['clear', 'fog'], zone: [0, 1],
      beh: { dash: 3, pull: 1, rest: 1 }, erratic: true, power: 0.4, stamina: 0.7, tele: 0.3,
      look: { len: 12, ht: 5, top: '#1a2050', mid: '#2e3a80', belly: '#8090d0', fin: '#3a4aa0', finHi: '#9aa8ff', pattern: 'glowdots', patCol: '#fff2a0', glow: '#fff6b0', tail: 'round', dorsal: 0.6, seed: 66 },
      desc: '星屑を食べて光るメダカ。群れで泳ぐと、湖の中にもうひとつの夜空ができる。',
      trait: '気まぐれに動き回る。',
    },
    {
      id: 'aogane', name: 'アオガネナマズ', en: 'Bluegold Catfish', rarity: 2, size: 60, value: 62,
      periods: ['dusk', 'night'], weather: ['rain', 'fog', 'clear'], zone: [2],
      beh: { dive: 3, pull: 1, rest: 1 }, power: 0.95, stamina: 1.6, tele: 0.7,
      look: { len: 32, ht: 9, top: '#1e3e48', mid: '#2f6070', belly: '#c8b060', fin: '#2a4a52', finHi: '#5a8a90', pattern: 'spots', patCol: '#d8b84a', tail: 'round', dorsal: 0.25, blunt: 0.4, seed: 77, whisker: true },
      desc: '雨の夜、湖底からのっそり現れる大ナマズ。金の斑は沈んだ街の灯だとか。',
      trait: '重い潜行。粘り強く耐えよう。',
    },
    {
      id: 'kirigakure', name: 'キリガクレ', en: 'Mistveil Eel', rarity: 2, size: 70, value: 66,
      periods: ['dawn', 'day', 'dusk', 'night'], weather: ['fog'], zone: [1, 2],
      beh: { vanish: 3, pull: 2, dash: 1 }, power: 0.7, stamina: 1.3, tele: 0.6,
      look: { len: 38, ht: 5, top: '#7a7aa8', mid: '#c4c4e4', belly: '#eeeefa', fin: '#a0a0d0', finHi: '#e0e0ff', pattern: 'glowline', patCol: '#ffffff', glow: '#e8f0ff', tail: 'eel', dorsal: 0.0, seed: 88 },
      desc: '霧の日にだけ姿を見せる半透明のウナギ。霧に溶けて、気配だけが糸に伝わる。',
      trait: '霧に溶けてテンションが見えなくなる。竿のしなりで判断せよ。',
    },
    {
      id: 'amatsuyu', name: 'アマツユパイク', en: 'Rainspear Pike', rarity: 2, size: 55, value: 60,
      periods: ['day', 'dusk'], weather: ['rain'], zone: [2],
      beh: { pull: 3, dash: 3 }, erratic: true, power: 0.9, stamina: 1.3, tele: 0.4,
      look: { len: 34, ht: 7, top: '#2a5a3a', mid: '#6aa070', belly: '#e0eccc', fin: '#5a8a50', finHi: '#a8d090', pattern: 'stripes', patCol: '#3a6a3a', tail: 'fork', dorsal: 0.4, dorsalAt: 0.5, seed: 99 },
      desc: '雨粒を合図に狩りを始める槍のような魚。激しい突進で糸を試す。',
      trait: '突然の突進。予兆の「！」を見逃すな。',
    },
    {
      id: 'tsukikage', name: 'ツキカゲウオ', en: 'Moonshadow', rarity: 3, size: 40, value: 110, lure: 2,
      periods: ['night'], weather: ['clear'], zone: [2],
      beh: { jump: 2, vanish: 2, pull: 2 }, power: 0.85, stamina: 1.5, tele: 0.5,
      look: { len: 28, ht: 11, top: '#2a3060', mid: '#8a9ad0', belly: '#e0e8ff', fin: '#5a6ab0', finHi: '#c0d0ff', pattern: 'glowline', patCol: '#ffffff', glow: '#cfe0ff', tail: 'fork', dorsal: 0.6, seed: 111 },
      desc: '月影の差す深みにいる幻の魚。月の光を鱗に溜め、跳ねるたび夜を照らす。',
      trait: '跳躍と霧隠れ。貝の擬餌以上が必要。',
    },
    {
      id: 'kohaku', name: 'コハクチョウザメ', en: 'Amber Sturgeon', rarity: 3, size: 110, value: 140, rod: 2,
      periods: ['dawn', 'day', 'dusk', 'night'], weather: ['clear', 'rain', 'fog'], zone: [2],
      beh: { dive: 3, pull: 3, rest: 1 }, power: 1.05, stamina: 2.0, tele: 0.7,
      look: { len: 40, ht: 10, top: '#6a4018', mid: '#c88a3a', belly: '#f4dca0', fin: '#8a5a28', finHi: '#e0a860', pattern: 'scales', patCol: '#f0c060', tail: 'long', dorsal: 0.35, dorsalAt: 0.55, seed: 122, whisker: true },
      desc: '琥珀色の古代魚。湖ができる前からここにいた、と灯守りの日誌は記す。',
      trait: '最強クラスの引き。銀樺の竿以上が必要。',
    },
    {
      id: 'hotaruayu', name: 'ホタルアユ', en: 'Firefly Ayu', rarity: 2, size: 20, value: 45,
      periods: ['dusk', 'night'], weather: ['clear', 'rain', 'fog'], zone: [0, 1],
      beh: { jump: 3, dash: 2 }, power: 0.6, stamina: 1.0, tele: 0.45,
      look: { len: 22, ht: 7, top: '#3a5a2a', mid: '#a0b870', belly: '#eef4d0', fin: '#7a9a40', finHi: '#e0f070', pattern: 'glowdots', patCol: '#f0ff90', glow: '#f4ff9a', tail: 'fork', dorsal: 0.5, seed: 133 },
      desc: '蛍と同じ光を灯すアユ。夕闇の浅瀬で、蛍と光の会話をしている。',
      trait: '光りながら跳ねる。',
    },
    {
      id: 'lumineria', name: '湖の主 ルミナリア', en: 'Lumineria, Mere Sovereign', rarity: 4, size: 240, value: 500, lure: 3, legend: true,
      periods: ['night'], weather: ['clear', 'rain', 'fog'], zone: [2],
      beh: { pull: 3, dive: 2, jump: 2, vanish: 1, dash: 1 }, power: 1.1, stamina: 2.6, tele: 0.65,
      look: { len: 46, ht: 15, top: '#1e2a6a', mid: '#5a7ad0', belly: '#d8e8ff', fin: '#7aa8f0', finHi: '#e0f4ff', pattern: 'glowline', patCol: '#ffffff', glow: '#bff4ff', tail: 'long', dorsal: 0.7, seed: 144, whisker: true, hi: '#cfe8ff' },
      desc: '湖の底で星を抱いて眠る主。この湖の灯はすべて、彼女の鱗の光だという。',
      trait: 'あらゆる技を使う湖の主。',
    },
  ];

  const LEGEND_NEED = 9; // species required before the sovereign stirs

  const UPGRADES = {
    rod: {
      name: '竿', desc: '巻き上げの力が上がる',
      tiers: [
        { name: '柳の竿', cost: 0, reel: 1.0 },
        { name: '銀樺の竿', cost: 130, reel: 1.3 },
        { name: '星鉄の竿', cost: 300, reel: 1.6 },
      ],
    },
    line: {
      name: '糸', desc: '糸が切れにくくなる',
      tiers: [
        { name: '麻糸', cost: 0, tension: 1.0, grace: 0.3 },
        { name: '絹糸', cost: 90, tension: 0.8, grace: 0.5 },
        { name: '月光糸', cost: 260, tension: 0.65, grace: 0.8 },
      ],
    },
    lure: {
      name: '擬餌', desc: 'アタリが早く、珍しい魚が掛かりやすい',
      tiers: [
        { name: '木の浮き', cost: 0, bite: 1.0, rare: 1.0 },
        { name: '貝の擬餌', cost: 100, bite: 0.75, rare: 1.5 },
        { name: '星灯りの擬餌', cost: 320, bite: 0.55, rare: 2.2 },
      ],
    },
  };

  const byId = {};
  for (const f of FISH) byId[f.id] = f;

  LM.FISH = FISH;
  LM.FISH_BY_ID = byId;
  LM.UPGRADES = UPGRADES;
  LM.LEGEND_NEED = LEGEND_NEED;
})(window.LM);
