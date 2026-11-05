/** Japanese messages (the reference set: every key must also exist in en.ts). */
export const ja = {
  // Page header and onboarding
  "header.lede":
    "Materials Project の計算エネルギーから、指定組成を作動イオンの開放系に置いたときの相平衡と反応電位 (電気化学的安定性ウィンドウ) を計算します。計算はすべてブラウザ内で行われます。",
  "header.help": "使い方",
  "header.theme": "テーマ",
  "header.themeAuto": "テーマ: 自動",
  "header.themeLight": "テーマ: ライト",
  "header.themeDark": "テーマ: ダーク",
  "header.lang": "言語",
  "onb.title": "はじめに",
  "onb.close": "使い方を閉じる",
  "onb.step1Title": "Materials Project の API key を用意",
  "onb.step1":
    '<a href="https://materialsproject.org/" target="_blank" rel="noopener noreferrer">materialsproject.org</a> にログインし、アカウントメニューの API key をコピーします。key は MP API への問い合わせにだけ使われます。',
  "onb.step1Button": "API key 欄へ移動",
  "onb.step2Title": "組成を入れて計算",
  "onb.step2":
    "組成 (例: Li6PS5Cl) と作動イオンを選び、「MP から取得して計算」を押します。取得済みの元素の範囲なら、組成を変えるだけで再計算されます。",
  "onb.step3Title": "図を読む",
  "onb.step3":
    "横軸 x は対象 1 式量あたりのイオン取込量 (x &lt; 0 が酸化、x &gt; 0 が還元)。灰色の帯が対象相の安定性ウィンドウ、右側は各電位で安定な相の組み合わせです。",
  "onb.demo": "デモデータで試す",
  "onb.done": "閉じる",
  "onb.hint": "デモデータは架空のエネルギーです。「使い方」からいつでも再表示できます。",

  // Form
  "form.formula": "組成",
  "form.ion": "作動イオン",
  "form.data": "データ",
  "form.apiKeyPlaceholder": "materialsproject.org の Dashboard で取得",
  "form.saveKey": "このブラウザに保存",
  "form.fetch": "MP から取得して計算",
  "form.loadJson": "JSON を読み込む",
  "form.demo": "デモデータ",
  "cli.summary": "コマンドで取得 (公開サイトではこちら)",
  "cli.intro":
    "Materials Project API はブラウザからの直接通信 (CORS) を materialsproject.org にしか許可していないため、公開サイトからは「MP から取得」できません。端末で次のコマンドを実行し、保存された JSON を「JSON を読み込む」で選んでください (複数ファイルをまとめて選択できます)。",
  "cli.shell": "シェル",
  "cli.step1": "API key を環境変数に設定",
  "cli.step2": "データを取得 (組成・作動イオン・thermo type に合わせて自動で更新されます)",
  "cli.copy": "コマンドをコピー",
  "cli.copied": "コピーしました",
  "cli.copyFailed": "コピーできませんでした",
  "cli.step3Before": "保存された",
  "cli.step3After": "を「JSON を読み込む」で選択",
  "cli.hint":
    "1 ファイルは最大 1000 件です。件数が足りない場合は読み込み時に警告が出るので、URL の <code>_page=1</code> を 2, 3… に変えて取得し、すべてのファイルを一緒に選んでください。<code>vp dev</code> / <code>vp preview</code> でローカル起動した場合は、開発サーバのプロキシ経由で「MP から取得」がそのまま使えます。",
  "cli.invalidFormula": "(組成を正しく入力してください)",
  "opt.legend": "オプション",
  "opt.stabilize": "対象相を hull 上に置く (既定)",
  "opt.stabilizeHint":
    "準安定な対象相もプロットに含めて評価します。元のエネルギーでの平衡相を調べる場合はチェックを外してください。該当エントリがない組成の仮想相は作りません。",
  "opt.deltaBefore": "hull より",
  "opt.deltaAfter": "meV/atom 下げる",
  "opt.exclude": "除外する相 (カンマ・改行区切り)",
  "opt.excludePlaceholder": "例: Li3P7, mp-1234",
  "opt.excludeHint":
    "化学式は同じ組成の全エントリ (多形を含む) を、material id はそのエントリだけを計算から除きます。不自然な組成や信頼できない計算の相を外すときに使います。",

  // Result
  "fig.label": "電位プロファイルと相平衡の図 (拡大・移動可能)",
  "fig.range": "電位範囲",
  "fig.vMin": "電位の下限 (V)",
  "fig.vMax": "電位の上限 (V)",
  "fig.reset": "表示をリセット",
  "fig.help":
    "ホイール: 電位を拡大縮小 / Shift+ホイール・x 軸上のホイール: x を拡大縮小 / ドラッグ: 移動 / ピンチ: 拡大縮小 / ダブルクリック: リセット / ホバー・タップ: 詳細 / キーボード: + − 矢印 0、[ ] で区間を選択、Shift+[ ] で相の詳細",
  "legend.ox": "酸化側 (x &lt; 0, イオン脱離)",
  "legend.red": "還元側 (x &gt; 0, イオン挿入)",
  "legend.window": "安定性ウィンドウ",
  "legend.axes": "x: 対象 1 式量あたりの作動イオン取込量 / 水平線: 二相共存の電位",
  "dl.json": "結果 JSON",
  "dl.entries": "エントリ JSON",
  "table.title": "相平衡と反応",
  "table.range": "電位範囲 (V)",
  "table.phases": "平衡相 (per {formula})",
  "table.reaction": "反応",
  footer:
    "電位は V = −(μ − μ<sub>metal</sub>)/z。Ong et al., Chem. Mater. 20, 1798 (2008); Zhu, He &amp; Mo, ACS Appl. Mater. Interfaces 7, 23685 (2015) の手法に基づく grand potential 相図による評価です。",

  // Status and summary
  "status.loaded": "{source}{thermo}: {system} 系 {n} エントリ",
  "status.demo": " — 架空のエネルギーです。実データは MP から取得してください。",
  "status.fetching": "{system} 系を取得中…",
  "status.progress": "取得中… {n}{total}",
  "summary.window": "安定性ウィンドウ",
  "summary.hullCorrected": " (hull 補正)",
  "summary.regions": "平衡領域 / プラトー",
  "summary.entries": "使用エントリ",
  "summary.noEntry": "該当エントリなし",
  "summary.notEvaluable": "評価不可 (該当エントリなし)",
  "summary.reactsWithMetal": "{ion} 金属と反応 (0 V 以下)",
  "summary.noneDecomposed": "なし (分解生成物が安定)",
  "summary.noneAt": "なし ({v} V で分解)",
  "note.stabilizedOn":
    "{formula} を hull 上に補正して評価しています。上の E<sub>hull</sub> は補正前の値です。このウィンドウは補正した対象相の評価です。",
  "note.stabilizedBelow":
    "{formula} を hull 上から {delta} meV/atom 下に補正して評価しています。上の E<sub>hull</sub> は補正前の値です。このウィンドウは補正した対象相の評価です。",
  "note.notOnHull":
    "対象相は hull 上にありません。x = 0 の平衡相は分解生成物です。「対象相を hull 上に置く」を有効にすると対象相を含むプロファイルを評価できます。",
  "note.noTarget":
    "{formula} の該当エントリがありません。仮想相は作らず、分解生成物の平衡のみを表示しています。",
  "note.excluded": "{n} エントリを除外しています: {ids}。",
  "note.unmatched": "一致するエントリがない項目: {items}。",

  // Errors raised by the page
  "err.missingElements":
    "読み込んだデータに {elements} が含まれていません。MP から再取得してください。",
  "err.lostRefs":
    "除外により {elements} の単体エントリがなくなりました。単体は生成エネルギーの基準なので除外できません。除外する相を見直してください。",

  "opt.film": "被膜厚みを計算 (分解生成物が粒子表面に形成されると仮定)",
  "opt.filmDiameter": "粒子径",
  "opt.filmFraction": "分解率 (粒子体積の)",
  "opt.filmHint":
    "球状粒子が表面から分解し、生成物が未反応のコアを覆う緻密な混合層になると仮定します。生成物の体積は MP の体積/原子から求め、体積変化を含めます。",
  "volume.toggle": "体積膨張率を計算 (初期組成の体積基準)",
  "volume.title": "体積膨張率",
  "volume.column": "体積膨張率 (初期組成基準)",
  "volume.hint":
    "対象組成 1 式量が各区間の平衡生成物に全反応したときの (V_生成物 / V_初期組成 − 1) × 100%。収縮は負値です。作動イオン金属と放出ガスを除く緻密な固相体積の見積もりで、空隙やガス圧による膨張は含みません。粒子径・分解率・電荷量には依存しません。",
  "volume.gasHint":
    "O₂・Cl₂ などの気体の単体と、指定した相を生成物の固相体積から除きます。被膜厚みと体積膨張率で共通の設定です。",
  "volume.values": "初期 {initial} → 生成物 {products} Å³/対象式量",
  "volume.gases": "体積から除外したガス: {list}",
  "volume.aria": "初期組成を基準とした電位区間ごとの固相体積膨張率",
  "volume.voltage": "電位 (V)",
  "volume.axis": "初期組成からの体積膨張率 (%)",
  "volume.missing": "体積データ不足の区間は図に表示しません。欠損相は反応表を確認してください。",
  "volume.download": "体積膨張率 SVG",

  "film.title": "被膜モデル",
  "film.region": "電位区間",
  "film.drag": "ドラッグ (または矢印キー) で回転",
  "film.column": "被膜 (厚み / 体積変化 / vol% / 容量)",
  "film.none": "—",
  "film.unavailable": "計算不可 (有効な体積データなし: {phases})",
  "film.capacity": "{q} mAh/g",
  "film.fromCharge": "分解率 {f} % (全分解に {full} mAh/g)",
  "film.noteCharge": "反応電荷量 {q} mAh/g から: ",
  "film.capped": "全分解 (電荷が全分解に必要な {full} mAh/g を超えています)",
  "film.chargeless": "電荷を伴わない分解のため、電荷量からは決まりません",
  "film.gas": "放出ガス: {list}",
  "film.noSolid": "被膜なし (生成物はすべてガス)",
  "film.noteGasOnly":
    "生成物はすべてガスとして放出されるため、被膜はできません。粒子径 {d} µm、分解率 {f} % で、粒子は直径 {core} µm のコアだけになります。",
  "opt.filmMode": "分解量の指定",
  "opt.filmModeFraction": "分解率で指定",
  "opt.filmModeCharge": "反応電荷量で指定",
  "opt.filmCharge": "反応電荷量 (対象相 1 g あたり)",
  "opt.filmGas": "ガスとして放出する相 (カンマ・改行区切り)",
  "opt.filmGasPlaceholder": "例: CO2, SO2, PCl3",
  "opt.filmGasHint":
    "O₂・Cl₂ などの気体の単体 (H, N, O, F, Cl, 貴ガス) は常にガスとして被膜から除き、放出量を表示します。CO₂ などの化合物のガスや液体の生成物は、化学式または material id でここに追加してください。",
  "film.full": "全分解: 粒子径 {d0} → {d1} µm ({pct})",
  "film.diameter": "外径 {d} µm ({pct})",
  "film.volumeChange": "体積変化: 分解部 {v} / 粒子全体 {p}",
  "film.noteFull":
    "粒子径 {d} µm の粒子がすべて分解し、生成物の粒子の直径は {out} µm ({pct}) になります。被膜ではなく粒子全体が生成物です。",
  "film.chartTitle": "体積変化",
  "film.chartAria": "電位区間ごとの、分解した部分の体積変化のグラフ",
  "film.chartHint":
    "分解した部分の体積変化 (V_生成物 / V_対象相 − 1) を電位区間ごとに示します。粒子全体の変化はこれに分解率を掛けた値です。線をクリックすると、その区間を 3D モデルに表示します。",
  "film.tooltip": "被膜 {t}",
  "film.invalid":
    "被膜: 粒子径 (> 0 µm) と、分解率 (0–100 %) または反応電荷量 (0 mAh/g 以上) を正しく入力してください。",
  "film.noRegion":
    "被膜を計算できる電位区間がありません (体積データのある分解生成物がありません)。",
  "film.core": "未反応の {formula}",
  "film.note":
    "粒子径 {d} µm、分解率 {f} % で、被膜の厚みは {t} (コア径 {core} µm、外径 {out} µm、{pct})。体積変化は分解部 {v}、粒子全体 {p}。",
  "film.exaggerated": "被膜が薄いため、図では厚みを誇張しています。",
  "film.aria": "{formula} 粒子の断面モデル。被膜の厚み {t}",

  // Tooltip and figure
  "link.openMp": "Materials Project で {id} を開く",
  "tip.plateau": "プラトー {v} V",
  "tip.uptake": "x: {from} → {to} ({ion} {dx} 取込)",
  "tip.range": "電位範囲: {range}",
  "tip.interval": "(区間 {range})",
  "plot.aria": "{formula} の {ion} 電位プロファイルと相平衡",
  "plot.virtual": "仮想相",
  "plot.originalEhull": "元の E_hull: {v} meV/atom",
  "plot.stabilized": "対象相を hull 補正 ({source})",

  // Calculation core
  "formula.empty": "空の化学式です",
  "formula.unparsable": '化学式を解釈できません: "{formula}" (位置 {pos})',
  "formula.number": '化学式の数字の位置が不正です: "{formula}"',
  "formula.brackets": '括弧の対応が不正です: "{formula}"',
  "formula.emptyGroup": '空の括弧です: "{formula}"',
  "formula.noElements": '元素がありません: "{formula}"',
  "entries.missingRefs": "単体の基準エントリがありません: {elements}",
  "profile.needOtherElements": "{ion} 以外の元素を含む組成を指定してください",

  // Materials Project API
  "mp.noKey": "Materials Project API key を入力してください",
  "mp.network":
    "ブラウザから Materials Project API に接続できませんでした。MP API は materialsproject.org 以外からのブラウザ通信 (CORS) を許可していません。下の「コマンドで取得」で JSON を取得して読み込んでください。",
  "mp.http": "Materials Project API エラー: HTTP {status}{hint}",
  "mp.httpKeyHint": " (API key を確認してください)",
  "mp.incomplete": "Materials Project API の応答が不完全です。再取得してください",

  // Entry files
  "io.staleMp":
    "Materials Project の energy_per_atom を使ったデータです。mixed scheme (GGA_GGA+U_R2SCAN) では値のスケールが揃っておらず、相図が正しくなりません。最新のコマンドまたは「MP から取得」で再取得してください。",
  "io.needCorrection": "entries[{i}]: energy_adjustments に対応する correction が必要です",
  "io.correctionNaN": "entries[{i}].correction が数値ではありません",
  "io.badComposition": "entries[{i}].composition が不正です",
  "io.notObject": "entries[{i}] がオブジェクトではありません",
  "io.energyNaN": "entries[{i}].energyPerAtom が数値ではありません",
  "io.nameNotString": "entries[{i}].name が文字列ではありません",
  "io.notThermoDoc": "data[{i}] は Materials Project の thermo ドキュメントではありません",
  "io.invalidJson": "JSON として読み込めません",
  "io.noEntries": "entries 配列が見つかりません",
  "io.noFiles": "ファイルが選択されていません",
  "io.mixedThermo": "thermo type が混在しています: {types}",
  "io.mixedBasis":
    "エネルギーの基準が異なるファイルが混在しています。同じ方法で取得し直してください",
  "io.missingPages":
    "MP のデータが {total} 件中 {docs} 件しかありません。_page=1〜{pages} の全ページを取得して、まとめて読み込んでください。",
} as const;

export type MessageKey = keyof typeof ja;
