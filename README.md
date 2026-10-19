# reaction-voltage-calculator

Materials Project の計算結果 (thermo entries) から、指定組成を作動イオン (Li, Na, Mg …) の開放系に置いたときの
相平衡と反応電位プロファイル、電気化学的安定性ウィンドウを計算する静的 Web アプリです。
計算はすべてブラウザ内で行われ、ビルド成果物は HTML/JS/CSS のみです。

## 使い方

1. 組成 (例: `Li6PS5Cl`)、作動イオン、thermo type を選ぶ
2. Materials Project の API key を入れて「MP から取得して計算」
   (key は MP API への `X-API-KEY` ヘッダにのみ使用。「このブラウザに保存」を選んだ場合のみ localStorage に保存)
3. 電位プロファイル (左) と電位ごとの平衡相 (右)、反応表が表示されます。SVG / CSV / JSON でダウンロード可能
4. 取得したエントリは「エントリ JSON」で保存し、「JSON を読み込む」でオフライン再計算できます。
   pymatgen の `ComputedEntry.as_dict()` のリストも読み込めます

準安定相 (E_hull > 0) は「対象相を hull 上に置く」で hull − δ に安定化して評価できます。

## 計算方法

作動イオン A の化学ポテンシャル μ を固定した grand potential
Φ(μ) = min Σ nᵢ (E_f,i − μ N_A,i) (A 以外の元素量は対象組成に固定) を線形計画で解き、
Φ(μ) の折れ点 (= 二相共存の電位プラトー) をパラメトリック LP の二分探索で厳密に列挙します。
電位は V = −(μ − μ_A,metal)/z。pymatgen の `PhaseDiagram.get_element_profile` と同じ結果になることを
`tests/pymatgen.test.ts` で照合しています。

## 開発

[Vite+](https://viteplus.dev/) (`vp`) を使います。

```bash
vp install
```

```bash
vp dev
```

```bash
vp check && vp test && vp build
```

`vp build` の `dist/` は相対パスで構成されるので、任意の静的ホスティング (サブパス可) に置けます。

### pymatgen 参照 fixture

`tests/fixtures/*.json` は pymatgen で生成した参照データです (Python 3.14 + uv)。

```bash
uv run reaction-voltage-calculator --out tests/fixtures
```

Materials Project の実データから fixture を作る場合 (要 `MP_API_KEY`):

```bash
uv run --extra mp reaction-voltage-calculator --mp Li6PS5Cl --out tests/fixtures
```
