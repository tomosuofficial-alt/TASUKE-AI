require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CONTENT_DB = '942d70a4-e645-464e-a1ab-5176bce10939';

// ─── 月名ヘルパー ────────────────────────────────────────────────

const SEASON_MAP = {
  1: '冬', 2: '冬', 3: '春',
  4: '春', 5: '春', 6: '夏',
  7: '夏', 8: '夏', 9: '秋',
  10: '秋', 11: '秋', 12: '冬',
};

// ─── クライアント設定 ───────────────────────────────────────────

const CLIENT_CONFIGS = {
  'Mz cafe': {
    postsPerMonth: 6,
    goal: '予約増加',
    concept: '夜カフェの顔をした、大人の洋風酒場',
    preferredTimes: ['12:00', '19:00'],
    baseDays: [1, 5, 10, 15, 20, 25],
    locationTag: "M'z cafe（高崎駅東口 徒歩5分）",
    instagramAccount: '@mzcafe_takasaki',
    materialBasePath: '/Volumes/Home_Mac_SSD/01_Projects/Mz_cafe/03_Material',

    themeRotation: [
      '人気No.1メニュー',
      '新作・限定メニュー',
      '調理シーン・盛付け',
      'ドリンク・スイーツ',
      'ランチセット紹介',
      'お客様の注文風景',
    ],
    hookTemplates: [
      'カフェだと思った？ 実はここ、大人の洋風酒場です',
      '1軒目にも2軒目にもなる店、知ってる？',
      'このピザ、居酒屋じゃないよ。カフェだよ',
      '仕事終わりの一杯、こんな場所で飲みたくない？',
      '〆のラーメングラタン、これが正解',
      '女子会の場所、まだ決まってないなら',
    ],
    ctaTemplates: [
      'プロフィールのリンクから予約できます',
      '気になったら保存してね',
      '今週の女子会ここにしない？ タグ付けして教えて',
      'DMで予約も受付中',
    ],
    hashtagSets: {
      A: '#夜カフェ #大人の隠れ家 #カフェ巡り #クラフトビール #高崎カフェ',
      B: '#女子会 #隠れ家カフェ #カフェ好きな人と繋がりたい #デートスポット #高崎グルメ',
      C: '#カフェごはん #おしゃれカフェ #お酒好きな人と繋がりたい #夜カフェスイーツ #高崎',
    },
    bgmOptions: ['おしゃれカフェ系', '落ち着きジャズ系'],

    // ── テーマ別キャプションテンプレ（{season}は自動置換） ──
    captionTemplates: {
      '人気No.1メニュー': `カフェだと思った？\n実はここ、大人の洋風酒場です。\n\n看板メニューのマルゲリータピザ。\nカフェの気軽さで、本格的な味。\n\n1軒目のしっかりご飯にも、\n2軒目の軽い一杯にも。\n\nどんな夜にもフィットする、\n「自分のための場所」がここにあります。\n\n📍高崎駅東口 徒歩5分\n🕐 17:00〜翌0:00（年中無休）`,
      '新作・限定メニュー': `{season}だけの、特別なひと皿。\n\n新メニューが登場しました。\n定番も好きだけど、\n今しか食べられないものにも惹かれる。\n\n来週にはもうないかもしれない。\nそういうものって、\n今日食べるのが正解だと思う。\n\n📍高崎駅東口 徒歩5分\n🕐 17:00〜翌0:00（年中無休）`,
      '調理シーン・盛付け': `チーズがとろける、この瞬間。\n\n目の前で仕上がっていく料理は、\nそれだけでもう「ごちそう」。\n\nカフェの雰囲気で、\n本格的な調理を楽しめる。\nそれがM'z cafeのスタイル。\n\n📍高崎駅東口 徒歩5分\n🕐 17:00〜翌0:00（年中無休）`,
      'ドリンク・スイーツ': `仕事終わりの一杯、\nこんな場所で飲みたくない？\n\nタップマルシェのクラフトビール、\nフルーツサワー、ワイン。\n\n〆にはハニートーストか\nアフォガートを。\n\nカフェなのにちゃんと酔える。\nそれがこの店のいいところ。\n\n📍高崎駅東口 徒歩5分\n🕐 17:00〜翌0:00（年中無休）`,
      'ランチセット紹介': `このボリュームでこの価格、\n知らないのはもったいない。\n\nM'z cafeのランチセット。\nメイン＋サラダ＋ドリンクで\nしっかりお腹も心も満たされる。\n\n平日のランチに迷ったら、\nここに来ればいい。\n\n📍高崎駅東口 徒歩5分\n🕐 ランチ 11:30〜14:00`,
      'お客様の注文風景': `「何にする？」\n「全部おいしそうで決まらない」\n\nテーブルに並ぶ料理を見れば、\nこの店の実力がわかる。\n\nリアルな食事風景から伝わる、\n「また来たい」の空気感。\n\n📍高崎駅東口 徒歩5分\n🕐 17:00〜翌0:00（年中無休）`,
    },

    // ── テーマ別編集手順（1ステップ=1ツール=1アクション） ──
    // CapCutテンプレート: 「MZ_単品」「MZ_スライド」を事前に作成して使い回す
    materialInstructions: {
      '人気No.1メニュー': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/01_Food/
選び方: ピザ系（001〜044番台）からチーズが見える写真を1枚

【STEP 2: 画像を加工する】
ツール: Google AI Studio → ImageFX
やること: 写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（シズル強調）:
┌────────────────────────
│ この料理写真を縦9:16にリフレーム。彩度を上げてシズル感を強調。背景はカフェの暖かい照明
└────────────────────────

プロンプトB（湯気・臨場感）:
┌────────────────────────
│ この料理写真を縦9:16にリフレーム。湯気を足して出来たて感を演出。暖色の間接照明で奥行きを出す
└────────────────────────

プロンプトC（俯瞰・テーブル演出）:
┌────────────────────────
│ この料理写真を縦9:16にリフレーム。真上からの俯瞰アングルに変換。木目テーブルとカトラリーを追加してカフェの食卓感を演出
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: 動画にする】
ツール: Google AI Studio → Veo 3.1（1日3回まで）
やること: STEP2の画像をアップロード → 下のプロンプトをコピペ入力
┌────────────────────────
│ 料理の写真がゆっくりズームインする動画。湯気が立ち上る。9:16縦。3秒
└────────────────────────
Veo使えない日 → CapCutテンプレ内のKen Burns効果がそのまま使えるのでSTEP3はスキップ

【STEP 4: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「MZ_単品」を開く
やること:
1. メイン素材を差し替え → STEP3の動画（またはSTEP2の画像）をドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,

      '新作・限定メニュー': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/01_Food/
選び方: グラタン・チャーハン系の写真を1枚

【STEP 2: 画像を加工する】
ツール: Google AI Studio → ImageFX
やること: 写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（{season}感＋暖色）:
┌────────────────────────
│ この料理写真を縦9:16。暖色寄りに。コントラストUP。{season}の雰囲気を追加
└────────────────────────

プロンプトB（限定感・スポットライト）:
┌────────────────────────
│ この料理写真を縦9:16。背景を暗くして料理にスポットライト。特別感・限定感を演出。{season}の色味を追加
└────────────────────────

プロンプトC（ナチュラル・窓際光）:
┌────────────────────────
│ この料理写真を縦9:16。窓から差し込む自然光で明るく。{season}の植物や花をテーブルに追加して季節感を演出
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: テキスト入り画像を作る】
ツール: ChatGPT（画像生成）
やること: 下のプロンプトをコピペ入力
┌────────────────────────
│ この画像に「{season}限定」のテキストを入れて。フォントは明朝体、白文字、右下配置
└────────────────────────
→ ChatGPTが使えない場合: Canvaでテキスト追加

【STEP 4: 動画にする】
ツール: Google AI Studio → Veo 3.1（1日3回まで）
やること: STEP3の画像をアップロード → 下のプロンプトをコピペ入力
┌────────────────────────
│ 料理がフレームの右からスライドインする動画。暖かい光。9:16縦。3秒
└────────────────────────
Veo使えない日 → CapCutテンプレ内のスライドイン効果を使うのでSTEP4はスキップ

【STEP 5: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「MZ_単品」を開く
やること:
1. メイン素材を差し替え → STEP4の動画（またはSTEP3の画像）をドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,

      '調理シーン・盛付け': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/01_Food/
選び方: チーズがとろける・伸びている写真を1枚（最優先で選ぶ）

【STEP 2: 画像を加工する】
ツール: Google AI Studio → ImageFX
やること: 写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（チーズ＋湯気強調）:
┌────────────────────────
│ この料理写真の湯気感とチーズのとろけ感を強調。縦9:16。暖色系の照明
└────────────────────────

プロンプトB（クローズアップ・シズル）:
┌────────────────────────
│ この料理写真を超クローズアップに。チーズが糸を引く瞬間を強調。縦9:16。背景ぼかしで料理に集中
└────────────────────────

プロンプトC（調理中の臨場感）:
┌────────────────────────
│ この料理写真にキッチンの臨場感を追加。湯気・鉄板の熱・暖色の照明。縦9:16。ライブ感のある仕上がり
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: 動画にする】★ このテーマはVeo優先で使う
ツール: Google AI Studio → Veo 3.1（1日3回まで）
やること: STEP2の画像をアップロード → 下のプロンプトをコピペ入力
┌────────────────────────
│ チーズがとろけて伸びる料理のクローズアップ動画。湯気が立ち上る。9:16縦。3秒
└────────────────────────
Veo使えない日 → CapCutテンプレ内のズームイン効果を使うのでSTEP3はスキップ

【STEP 4: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「MZ_単品」を開く
やること:
1. メイン素材を差し替え → STEP3の動画（またはSTEP2の画像）をドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,

      'ドリンク・スイーツ': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/01_Food/
選び方: スイーツ系の写真を1枚（ハニートースト系を優先）
※ ドリンク単体写真はないので、STEP 3で生成する

【STEP 2: スイーツ画像を加工する】
ツール: Google AI Studio → ImageFX
やること: 写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（ふんわり映え）:
┌────────────────────────
│ この料理写真を明るくスイーツ映え加工。縦9:16。柔らかい光
└────────────────────────

プロンプトB（カフェタイム演出）:
┌────────────────────────
│ この料理写真を縦9:16。コーヒーカップとカトラリーを追加してカフェタイムの雰囲気に。パステル調の柔らかい色味
└────────────────────────

プロンプトC（夜カフェ・ムーディー）:
┌────────────────────────
│ この料理写真を縦9:16。キャンドルの灯りと暗めの背景で夜カフェの雰囲気に。甘さと大人っぽさを両立
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: ドリンク画像を生成する】
ツール: ChatGPT（画像生成）
やること: 下のプロンプトをコピペ入力
┌────────────────────────
│ おしゃれなカフェのクラフトビールとフルーツサワー。暖かい照明。木のカウンター。フォトリアル。縦9:16
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 4: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「MZ_スライド」を開く
やること:
1. スライド素材を差し替え → STEP2画像・STEP3画像・店舗情報画像の順にドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,

      'ランチセット紹介': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/01_Food/
選び方: 3〜4枚の料理写真（バラエティ重視。ピザ・パスタ・グラタン・サラダ等）

【STEP 2: 各写真を加工する】
ツール: Google AI Studio → ImageFX
やること: 各写真を1枚ずつアップロード → 下の3つから1つ選んでコピペ入力（全枚同じプロンプトで統一感を出す）

プロンプトA（暖色統一）:
┌────────────────────────
│ この料理写真を暖色系に統一。彩度UP。縦9:16
└────────────────────────

プロンプトB（ナチュラル・明るめ）:
┌────────────────────────
│ この料理写真を自然光で明るく。白いお皿が映える清潔感のある仕上がり。縦9:16
└────────────────────────

プロンプトC（ボリューム感・寄り）:
┌────────────────────────
│ この料理写真をやや寄りにリフレーム。ボリューム感と具材の彩りを強調。暖色系。縦9:16
└────────────────────────
→ 3〜4枚分を繰り返す

【STEP 3: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「MZ_スライド」を開く
やること:
1. スライド素材を差し替え → STEP2の加工済み写真を順番にドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. 価格テキストを差し替え → メニュー名と価格を入力
4. BGMはテンプレ固定（変更不要）
5. 書き出し → 1080x1920, MP4`,

      'お客様の注文風景': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/01_Food/
選び方: テーブルに並べたように見える複数の料理写真を3〜4枚
※ 人物は不要。料理の並びで「テーブル風景」を演出する

【STEP 2: テーブル俯瞰画像を生成する】
ツール: ChatGPT（画像生成）
やること: 下の3つから1つ選んでコピペ入力

プロンプトA（俯瞰・自然光）:
┌────────────────────────
│ おしゃれなカフェのテーブルに複数の料理が並ぶ俯瞰写真。ピザ、グラタン、サラダ。暖かい自然光。フォトリアル。縦9:16
└────────────────────────

プロンプトB（斜め上アングル・夜カフェ）:
┌────────────────────────
│ 夜カフェのテーブルに料理が並ぶ斜め上からの写真。ピザ、パスタ、ワイングラス。キャンドルの暖かい光。フォトリアル。縦9:16
└────────────────────────

プロンプトC（手元・ライブ感）:
┌────────────────────────
│ カフェで友人と食事中のテーブル写真。手がフォークを持っている。ピザ、グラタン、ビール。賑やかで楽しい雰囲気。フォトリアル。縦9:16
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: 動画にする】
ツール: Google AI Studio → Veo 3.1（1日3回まで）
やること: STEP2の画像をアップロード → 下のプロンプトをコピペ入力
┌────────────────────────
│ テーブルに料理が並ぶシーンをゆっくり左から右にパンする動画。9:16縦。3秒
└────────────────────────
Veo使えない日 → CapCutテンプレ内のパン効果を使うのでSTEP3はスキップ

【STEP 4: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「MZ_単品」を開く
やること:
1. メイン素材を差し替え → STEP3の動画（またはSTEP2の画像）をドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,
    },

    // ── 成長アクション（投稿後の具体的手順） ──
    growthActions: {
      '人気No.1メニュー': `【投稿直後〜2時間以内に必ず実行】
□ #高崎カフェ の最新投稿30件に「いいね」
□ そのうち5件に具体的コメント（2文以上、定型文禁止）
  例:「このお店の雰囲気素敵ですね！ピザも美味しそう🍕」
□ #カフェ巡り の投稿10件に「いいね」
□ 同エリア飲食店アカウント3件をフォロー`,
      default: `【投稿直後〜2時間以内に必ず実行】
□ #高崎カフェ #カフェ巡り の最新投稿30件に「いいね」
□ そのうち5件に具体的コメント（2文以上、定型文禁止）
□ ストーリーズに投稿リンクをシェア
□ 同エリア飲食店アカウント3件をフォロー`,
    },

    // ── 投稿前チェックリスト ──
    prePostChecklist: `【投稿前チェック ✅】
□ リールのカバー画像を選定（料理が一番映えるフレーム）
□ 位置情報を設定 → 「M'z cafe」で検索
□ ALTテキストを入力（例: 「M'z cafeのマルゲリータピザ。チーズがとろける瞬間」）
□ コピペ用テキストからキャプションを貼り付け
□ アカウント設定: ビジネスアカウント確認
□ 投稿時間を確認（この投稿の指定時間に予約投稿）
□ BGMを設定（指定の方向性で検索）
□ リール再生して最終チェック（冒頭1秒でフックが見えるか）`,

    // ── 投稿後チェックリスト ──
    postPostChecklist: `【投稿後チェック ✅】
□ ストーリーズにリール投稿をシェア
□ 成長アクションを実行（別欄参照）
□ 24時間後: いいね数・保存数をメモ欄に記録
□ 48時間後: リーチ数・プロフ訪問数をメモ欄に記録`,
  },

  'Niki★DINER': {
    postsPerMonth: 4,
    goal: '認知拡大・来店促進',
    concept: '吉澤清太氏プロデュース本格クラフトバーガー専門店',
    preferredTimes: ['12:00', '18:00'],
    baseDays: [1, 8, 16, 24],
    locationTag: 'Niki★DINER（高崎モントレー5F・高崎駅直結）',
    instagramAccount: '@niki_diner',
    materialBasePath: '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/03_Material',

    themeRotation: [
      '看板バーガー',
      '調理ライブ',
      'ライスプレート・夜ダイナー',
      '空間・映えドリンク',
    ],
    hookTemplates: [
      '上州牛を鉄板にギュッと押し付けると…',
      'グルメバーガーの最高峰、高崎にあります',
      'ソースもベーコンも全部手作り。これがクラフトバーガー',
      'ハンバーガー屋のロコモコ、食べたことある？',
    ],
    ctaTemplates: [
      'フォローして最新メニューをチェック',
      '高崎モントレー5F。駅直結です',
      '友達をタグ付けして教えてあげて',
      '気になったら保存 📌',
    ],
    hashtagSets: {
      A: '#クラフトバーガー #スマッシュバーガー #高崎グルメ #ハンバーガー #アメリカンダイナー',
      B: '#高崎ランチ #高崎モントレー #群馬グルメ #グルメバーガー #駅ナカグルメ',
      C: '#ハンバーガー好きな人と繋がりたい #肉スタグラム #高崎 #ダイナー飲み #ロコモコ',
    },
    bgmOptions: ['元気ポップ系'],

    captionTemplates: {
      '看板バーガー': `上州牛を鉄板にギュッと押し付けると…\n\n表面はカリッと香ばしく、\n中は肉汁がジュワッと溢れ出す。\n\nこれが「スマッシュ製法」。\n上州牛×オージービーフ配合の\n100%ビーフパティ。\n\nグルメバーガーのパイオニア\n吉澤清太氏がプロデュースした\n本格クラフトバーガー。\n\nジャンクに見えて、実は本格派。\n\n📍高崎モントレー5F（高崎駅直結）\n🕐 11:00〜21:30`,
      '調理ライブ': `ソースもベーコンも全部手作り。\nこれがクラフトバーガー。\n\nパティを鉄板にギュッと押し付ける。\n燻製ベーコンの香りが立ち上る。\n特製ソースを丁寧に重ねる。\n\nひとつひとつの工程に、\n「本物」へのこだわりがある。\n\n📍高崎モントレー5F（高崎駅直結）\n🕐 11:00〜21:30`,
      'ライスプレート・夜ダイナー': `ハンバーガー屋のロコモコ、\n食べたことある？\n\nNYチキンオーバーライス、\nロコモコ、バッファローウイング。\n\nバーガーだけじゃない。\nダイナー飲みも、ガッツリ飯も。\n\nランチもディナーも、\n全時間帯で攻めてます。\n\n📍高崎モントレー5F（高崎駅直結）\n🕐 11:00〜21:30`,
      '空間・映えドリンク': `NYスタイルの空間で、\nクリームソーダを。\n\nネオンサインが光るダイナー。\nアメリカの空気感を、\n高崎駅で味わえる。\n\nバーガーの後は\n自家製アップルパイと\nクリームソーダで〆。\n\n📍高崎モントレー5F（高崎駅直結）\n🕐 11:00〜21:30`,
    },

    // ── テーマ別編集手順（1ステップ=1ツール=1アクション） ──
    // CapCutテンプレート: 「NIKI_単品」「NIKI_スライド」「NIKI_調理ライブ」を事前に作成して使い回す
    materialInstructions: {
      '看板バーガー': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/10_Menu_Photos_Edit/2_Niki_burgers/
選び方: パティ断面・肉汁が見えるカットを1枚
予備: 02_Photos/11_Menu_Cutouts/2_Niki_burgers/（切り抜き素材）

【STEP 2: 画像を加工する】
ツール: Google AI Studio → ImageFX
やること: 写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（黒背景・スポットライト）:
┌────────────────────────
│ このバーガー写真のシズル感を強調。肉汁と彩度UP。縦9:16。黒背景にスポットライト
└────────────────────────

プロンプトB（肉汁クローズアップ）:
┌────────────────────────
│ このバーガー写真を超クローズアップ。パティの断面と肉汁が滴る瞬間を強調。縦9:16。背景ぼかし
└────────────────────────

プロンプトC（ダイナー雰囲気）:
┌────────────────────────
│ このバーガー写真を縦9:16。アメリカンダイナーのカウンターに置かれた雰囲気に。ネオンの反射光。ポテトとドリンクを追加
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: 動画にする】★ 看板メニューなのでVeo優先で使う
ツール: Google AI Studio → Veo 3.1（1日3回まで）
やること: STEP2の画像をアップロード → 下のプロンプトをコピペ入力
┌────────────────────────
│ バーガーの断面にゆっくりズームインする動画。肉汁が滴る。9:16縦。3秒
└────────────────────────
Veo使えない日 → CapCutテンプレ内のズームイン効果を使うのでSTEP3はスキップ

【STEP 4: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「NIKI_単品」を開く
やること:
1. メイン素材を差し替え → STEP3の動画（またはSTEP2の画像）をドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,

      '調理ライブ': `【STEP 1: 動画素材を選ぶ】※ Veo不要。既存動画を使う
フォルダ: 03_Movies/02_People/（調理動画8本 .mov）
選び方: スマッシュ瞬間・ソース仕込み・燻製ベーコンのシーンを含む動画を2〜3本

【STEP 2: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「NIKI_調理ライブ」を開く
やること:
1. 動画素材を差し替え → STEP1の動画をタイムラインにドラッグ（2〜3本）
2. 各クリップの長さを2〜3秒に調整（テンプレのカット位置ガイドに合わせる）
3. フック文テキストを差し替え → この投稿のフック文をコピペ
4. BGMはテンプレ固定（変更不要）
5. 書き出し → 1080x1920, MP4

★ このテーマは動画素材があるのでVeo枠を使わない。他のテーマに温存する`,

      'ライスプレート・夜ダイナー': `【STEP 1: 写真を選ぶ】
フォルダ: 02_Photos/10_Menu_Photos_Edit/4_Riceplate_Salad/
選び方: ロコモコ・チキンオーバーライス系の写真を3枚
予備: 02_Photos/11_Menu_Cutouts/4_Riceplate_Salad/（切り抜き素材）

【STEP 2: 各写真を加工する】
ツール: Google AI Studio → ImageFX
やること: 各写真を1枚ずつアップロード → 下の3つから1つ選んでコピペ入力（全枚同じプロンプトで統一感を出す）

プロンプトA（ボリューム・暖色）:
┌────────────────────────
│ この料理写真のボリューム感を強調。暖色系。縦9:16
└────────────────────────

プロンプトB（ダイナープレート感）:
┌────────────────────────
│ この料理写真を縦9:16。アメリカンダイナーの鉄板プレートに盛り付けた雰囲気に。彩度UP。湯気を追加
└────────────────────────

プロンプトC（ガッツリ飯・迫力）:
┌────────────────────────
│ この料理写真を縦9:16。真正面からのアングルでボリューム感を最大化。背景を暗くして料理を際立たせる
└────────────────────────
→ 3枚分を繰り返す

【STEP 3: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「NIKI_スライド」を開く
やること:
1. スライド素材を差し替え → STEP2の加工済み写真を順番にドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. 価格テキストを差し替え → メニュー名と価格を入力
4. BGMはテンプレ固定（変更不要）
5. 書き出し → 1080x1920, MP4`,

      '空間・映えドリンク': `【STEP 1: 写真を選ぶ（2種類）】
内装: 02_Photos/02_Interior/ からネオンサイン・カウンター写真を1枚
ドリンク: 02_Photos/10_Menu_Photos_Edit/6_Dersert_Drink/ からドリンク写真を1枚

【STEP 2: 内装画像を加工する】
ツール: Google AI Studio → ImageFX
やること: 内装写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（NYダイナー・クール）:
┌────────────────────────
│ この内装写真をNYダイナー風に強調。コントラスト強め、青みがかった影。縦9:16
└────────────────────────

プロンプトB（ネオン・ナイト）:
┌────────────────────────
│ この内装写真を縦9:16。ネオンサインの光を強調してナイトシーンの雰囲気に。赤と青のネオン反射
└────────────────────────

プロンプトC（レトロアメリカン）:
┌────────────────────────
│ この内装写真を縦9:16。50sアメリカンダイナーのレトロ感を強調。暖色のヴィンテージフィルター
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 3: ドリンク画像を加工する】
ツール: Google AI Studio → ImageFX
やること: ドリンク写真をアップロード → 下の3つから1つ選んでコピペ入力

プロンプトA（映え・彩度UP）:
┌────────────────────────
│ このドリンク写真を映え加工。彩度UP。縦9:16
└────────────────────────

プロンプトB（クリームソーダ・ポップ）:
┌────────────────────────
│ このドリンク写真を縦9:16。ポップで鮮やかな色味に。背景にネオンのボケ感を追加
└────────────────────────

プロンプトC（大人のバードリンク）:
┌────────────────────────
│ このドリンク写真を縦9:16。バーカウンターに置かれた雰囲気に。氷の透明感と光の反射を強調
└────────────────────────
→ 生成された画像をダウンロード保存

【STEP 4: 動画にする】
ツール: Google AI Studio → Veo 3.1（1日3回まで）
やること: STEP2の内装画像をアップロード → 下のプロンプトをコピペ入力
┌────────────────────────
│ ネオンサインが光るアメリカンダイナー。カメラがゆっくりパンして店内を映す。9:16縦。3秒
└────────────────────────
Veo使えない日 → CapCutテンプレ内のパン効果を使うのでSTEP4はスキップ

【STEP 5: CapCutテンプレで仕上げる】
ツール: CapCut → テンプレート「NIKI_スライド」を開く
やること:
1. スライド素材を差し替え → STEP4動画（or STEP2画像）・STEP3画像の順にドラッグ
2. フック文テキストを差し替え → この投稿のフック文をコピペ
3. BGMはテンプレ固定（変更不要）
4. 書き出し → 1080x1920, MP4`,
    },

    growthActions: {
      '看板バーガー': `【投稿直後〜2時間以内に必ず実行】
□ #高崎グルメ の最新投稿30件に「いいね」
□ #ハンバーガー の投稿20件に「いいね」
□ そのうち5件に具体的コメント（2文以上、定型文禁止）
  例:「スマッシュバーガー最高ですよね！うちも上州牛で作ってます🍔」
□ 高崎エリアの飲食店アカウント3件をフォロー`,
      default: `【投稿直後〜2時間以内に必ず実行】
□ #高崎グルメ #ハンバーガー の最新投稿30件に「いいね」
□ そのうち5件に具体的コメント（2文以上、定型文禁止）
□ ストーリーズに投稿リンクをシェア
□ 高崎エリアの飲食店アカウント3件をフォロー`,
    },

    prePostChecklist: `【投稿前チェック ✅】
□ リールのカバー画像を選定（バーガーが一番映えるフレーム）
□ 位置情報を設定 → 「Niki★DINER」または「高崎モントレー」で検索
□ ALTテキストを入力（例: 「上州牛スマッシュバーガーの断面。肉汁が溢れる瞬間」）
□ コピペ用テキストからキャプションを貼り付け
□ アカウント設定: ビジネスアカウント確認
□ 投稿時間を確認（この投稿の指定時間に予約投稿）
□ BGMを設定（指定の方向性で検索）
□ リール再生して最終チェック（冒頭1秒でフックが見えるか）`,

    postPostChecklist: `【投稿後チェック ✅】
□ ストーリーズにリール投稿をシェア
□ 成長アクションを実行（別欄参照）
□ 24時間後: いいね数・保存数をメモ欄に記録
□ 48時間後: リーチ数・プロフ訪問数をメモ欄に記録`,
  },
};

// ─── ハッシュタグローテーション（A→B→C→A…） ─────────────────

const HASHTAG_KEYS = ['A', 'B', 'C'];

function getHashtagSet(config, postIndex) {
  const key = HASHTAG_KEYS[postIndex % HASHTAG_KEYS.length];
  // セットラベルなし。コピペでそのまま使える形。
  return config.hashtagSets[key];
}

// ─── 投稿日計算（月曜回避→火曜にずらす） ──────────────────────

function calculatePostDates(year, month, baseDays) {
  const dates = [];
  const lastDay = new Date(year, month, 0).getDate();

  for (const day of baseDays) {
    const d = Math.min(day, lastDay);
    const date = new Date(year, month - 1, d);

    // 月曜日（1）なら火曜日にずらす
    if (date.getDay() === 1) {
      date.setDate(date.getDate() + 1);
    }

    dates.push(date);
  }

  return dates;
}

function formatDateISO(date) {
  return date.toISOString().split('T')[0];
}

// ─── 重複チェック（同月のエントリが既にあるか） ───────────────

async function checkDuplicates(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  try {
    const res = await notion.databases.query({
      database_id: CONTENT_DB,
      filter: {
        and: [
          { property: '投稿日', date: { on_or_after: startDate } },
          { property: '投稿日', date: { before: endDate } },
        ],
      },
    });
    return res.results.length;
  } catch {
    return 0;
  }
}

// ─── DBプロパティ自動セットアップ ────────────────────────────────

async function setupDatabaseProperties() {
  console.log('📋 Content DB プロパティをセットアップ中...');

  try {
    const db = await notion.databases.retrieve({ database_id: CONTENT_DB });
    const existingProps = Object.keys(db.properties);

    // 追加が必要なプロパティ定義
    const requiredProps = {
      'クライアント': { select: { options: [{ name: 'Mz cafe' }, { name: 'Niki★DINER' }] } },
      '投稿日': { date: {} },
      '投稿時間': { select: { options: [{ name: '12:00' }, { name: '18:00' }, { name: '19:00' }, { name: '21:00' }] } },
      'ステータス': { select: { options: [
        { name: '企画中' }, { name: '素材準備' }, { name: '編集中' },
        { name: '確認待ち' }, { name: '投稿済み' },
      ] } },
      'コンテンツ種別': { select: { options: [{ name: 'Reel' }] } },
      'テーマカテゴリ': { select: { options: [
        // M'z cafe テーマ
        { name: '人気No.1メニュー' }, { name: '新作・限定メニュー' },
        { name: '調理シーン・盛付け' }, { name: 'ドリンク・スイーツ' },
        { name: 'ランチセット紹介' }, { name: 'お客様の注文風景' },
        // Niki★DINER テーマ
        { name: '看板バーガー' }, { name: '調理ライブ' },
        { name: 'ライスプレート・夜ダイナー' }, { name: '空間・映えドリンク' },
      ] } },
      'フック（冒頭3秒）': { rich_text: {} },
      'CTA': { rich_text: {} },
      'キャプション': { rich_text: {} },
      'ハッシュタグセット': { rich_text: {} },
      'BGM方向性': { select: { options: [
        { name: 'おしゃれカフェ系' }, { name: '落ち着きジャズ系' }, { name: '元気ポップ系' },
      ] } },
      '素材チェックリスト': { rich_text: {} },
      '成長アクション': { rich_text: {} },
      'コピペ用テキスト': { rich_text: {} },
      '編集手順': { rich_text: {} },
      '投稿前チェック': { rich_text: {} },
      '投稿後チェック': { rich_text: {} },
      'メモ': { rich_text: {} },
    };

    // 足りないプロパティだけ追加
    const propsToAdd = {};
    for (const [name, config] of Object.entries(requiredProps)) {
      if (!existingProps.includes(name)) {
        propsToAdd[name] = config;
      }
    }

    if (Object.keys(propsToAdd).length === 0) {
      console.log('  ✓ プロパティは全て揃っています');
      return;
    }

    await notion.databases.update({
      database_id: CONTENT_DB,
      properties: propsToAdd,
    });

    console.log(`  ✓ ${Object.keys(propsToAdd).length}個のプロパティを追加しました`);
  } catch (err) {
    console.error('  ✗ プロパティセットアップエラー:', err.message);
    console.error('  → Notion APIの権限を確認してください');
    process.exit(1);
  }
}

// ─── キャプション生成（季節プレースホルダ置換） ─────────────────

function generateCaption(config, theme, month) {
  const template = config.captionTemplates?.[theme] || '';
  const season = SEASON_MAP[month] || '';
  return template.replace(/\{season\}/g, season);
}

// ─── コピペ用テキスト生成（キャプション + ハッシュタグ結合） ────

function generateCopyPasteText(caption, hashtags) {
  if (!caption) return hashtags;
  return `${caption}\n\n${hashtags}`;
}

// ─── Notion にページ作成 ─────────────────────────────────────────

async function createPostEntry(config, clientName, postIndex, date, month) {
  const theme = config.themeRotation[postIndex % config.themeRotation.length];
  const hook = config.hookTemplates[postIndex % config.hookTemplates.length];
  const cta = config.ctaTemplates[postIndex % config.ctaTemplates.length];
  const hashtags = getHashtagSet(config, postIndex);
  const bgm = config.bgmOptions[postIndex % config.bgmOptions.length];
  const time = config.preferredTimes[postIndex % config.preferredTimes.length];
  const season = SEASON_MAP[month] || '';

  // 新規追加: キャプション自動生成
  const caption = generateCaption(config, theme, month);

  // 新規追加: コピペ用テキスト（キャプション + ハッシュタグ結合済み）
  const copyPasteText = generateCopyPasteText(caption, hashtags);

  // 新規追加: 具体的な編集手順
  const editInstructions = (config.materialInstructions?.[theme] || '')
    .replace(/\{season\}/g, season);

  // 新規追加: 成長アクション（テーマ別 or デフォルト）
  const growth = config.growthActions?.[theme] || config.growthActions?.default || '';

  // 新規追加: 投稿前後チェックリスト
  const preCheck = config.prePostChecklist || '';
  const postCheck = config.postPostChecklist || '';

  // 素材パスは編集手順に含まれるので、シンプルなサマリーだけ
  const materialSummary = editInstructions
    ? `📂 素材パス: ${config.materialBasePath}\n詳細は「編集手順」を参照`
    : '';

  const dateStr = formatDateISO(date);
  const title = `${clientName}｜${theme}`;

  // Notion rich_text は2000文字制限があるので、truncate関数
  const rt = (text) => {
    if (!text) return [];
    const truncated = text.length > 1900 ? text.substring(0, 1900) + '…' : text;
    return [{ text: { content: truncated } }];
  };

  try {
    await notion.pages.create({
      parent: { database_id: CONTENT_DB },
      properties: {
        title: { title: [{ text: { content: title } }] },
        'クライアント': { select: { name: clientName } },
        '投稿日': { date: { start: dateStr } },
        '投稿時間': { select: { name: time } },
        'ステータス': { select: { name: '企画中' } },
        'コンテンツ種別': { select: { name: 'Reel' } },
        'テーマカテゴリ': { select: { name: theme } },
        'フック（冒頭3秒）': { rich_text: rt(hook) },
        'CTA': { rich_text: rt(cta) },
        'キャプション': { rich_text: rt(caption) },
        'ハッシュタグセット': { rich_text: rt(hashtags) },
        'BGM方向性': { select: { name: bgm } },
        '素材チェックリスト': { rich_text: rt(materialSummary) },
        '成長アクション': { rich_text: rt(growth) },
        'コピペ用テキスト': { rich_text: rt(copyPasteText) },
        '編集手順': { rich_text: rt(editInstructions) },
        '投稿前チェック': { rich_text: rt(preCheck) },
        '投稿後チェック': { rich_text: rt(postCheck) },
      },
    });

    console.log(`  ✓ ${dateStr} ${clientName}｜${theme}`);
    return true;
  } catch (err) {
    console.error(`  ✗ 作成失敗 ${dateStr} ${title}:`, err.message);
    return false;
  }
}

// ─── メイン処理 ──────────────────────────────────────────────────

async function main() {
  // CLI引数: node content-calendar.js [YYYY-MM] [--start-day N]
  const args = process.argv.slice(2);
  let year, month, startDay = 1;

  const monthArg = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  const startDayIdx = args.indexOf('--start-day');
  if (startDayIdx !== -1 && args[startDayIdx + 1]) {
    startDay = parseInt(args[startDayIdx + 1], 10);
  }

  if (monthArg) {
    [year, month] = monthArg.split('-').map(Number);
  } else {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    year = next.getFullYear();
    month = next.getMonth() + 1;
  }

  const monthStr = `${year}年${month}月`;
  console.log(`\n=== Instagram 投稿カレンダー生成 ===`);
  console.log(`対象: ${monthStr}${startDay > 1 ? `（${startDay}日以降）` : ''}\n`);

  // 重複チェック（--start-day 指定時はスキップ）
  if (startDay <= 1) {
    const existing = await checkDuplicates(year, month);
    if (existing > 0) {
      console.error(`⚠ ${monthStr}のエントリが既に${existing}件あります。`);
      console.error('  重複を避けるため処理を中断します。');
      console.error('  既存エントリを削除してから再実行してください。');
      process.exit(1);
    }
  }

  // DBプロパティセットアップ（初回のみ実質動作）
  await setupDatabaseProperties();

  console.log('');

  let totalCreated = 0;
  let totalFailed = 0;

  for (const [clientName, config] of Object.entries(CLIENT_CONFIGS)) {
    const dates = calculatePostDates(year, month, config.baseDays);
    const filteredDates = dates.filter((d) => d.getDate() >= startDay);

    if (filteredDates.length === 0) continue;

    console.log(`📱 ${clientName}（${filteredDates.length}本）`);

    for (let i = 0; i < filteredDates.length; i++) {
      const originalIdx = dates.indexOf(filteredDates[i]);
      const success = await createPostEntry(config, clientName, originalIdx, filteredDates[i], month);
      if (success) {
        totalCreated++;
      } else {
        totalFailed++;
      }

      await new Promise(r => setTimeout(r, 350));
    }

    console.log('');
  }

  console.log(`=== 生成完了 ===`);
  console.log(`作成: ${totalCreated}件 / 失敗: ${totalFailed}件`);
  console.log(`\n→ Notion Content DB で確認してください`);
  console.log(`→ 各投稿のステータスを「素材準備」に変えたら撮影開始！`);
}

main().catch(err => {
  console.error('予期しないエラー:', err.message);
  process.exit(1);
});
