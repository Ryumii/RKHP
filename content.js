// ご提供のレギュラーメディアと表示確認用ニュース。未公開原稿は入れない。
window.RK_CONTENT = Object.freeze({
  contact: {
    // Web3Formsの公開用フォーム識別子。受信先アドレスや秘密のAPIキーではない。
    accessKey: "6cca681d-c351-4597-95b0-2820aeb45c3e",
    fromName: "岸谷蘭丸公式サイト",
    subject: "[お問い合わせ] 岸谷蘭丸公式サイト"
  },
  regularMedia: [
    {
      id: "regular-black-or-white",
      category: "internet",
      title: "IN MY OPINION presents「BLACK or WHITE」",
      url: "https://www.youtube.com/playlist?list=PLDxonNcxMgrvoW0Dnj2N5Gm0QzC7rNoTd",
      image: "assets/regular-media/BoW.jpg",
      imageAlt: "IN MY OPINION presents「BLACK or WHITE」の番組バナー"
    },
    {
      id: "regular-newznew",
      category: "internet",
      title: "newZnew",
      url: "https://newspicks.com/movie-series/208/",
      image: "assets/regular-media/newZnewバナー.jpeg",
      imageAlt: "newZnewの番組バナー"
    },
    {
      id: "regular-abema-prime",
      category: "internet",
      title: "ABEMA Prime（アベプラ）",
      url: "https://abema.tv/video/title/89-66",
      image: "assets/regular-media/Abemaバナー画像.webp",
      imageAlt: "ABEMA Prime（アベプラ）の番組バナー"
    },
    {
      id: "regular-maruku",
      category: "radio",
      title: "岸谷蘭丸の丸くおさまらない話",
      url: "https://www.tfm.co.jp/maruku/",
      image: "assets/regular-media/maruku_kv_2026-06-23-031146_qhdt.jpg",
      imageAlt: "岸谷蘭丸の丸くおさまらない話の番組バナー"
    },
    {
      id: "regular-namarriage",
      category: "internet",
      title: "ナマリッジ！",
      url: "https://naresome.co.jp/namarriage/",
      image: "assets/regular-media/ナマリッジ　バナー.jpg",
      imageAlt: "ナマリッジ！の番組バナー"
    }
  ],
  news: [
    {
      id: "sample-talk",
      category: "media",
      title: "トーク番組への出演情報",
      publishedAt: "2026-10-28T09:00:00+09:00",
      startsAt: "2026-11-02T20:00:00+09:00",
      medium: "TV・配信",
      summary: "番組名や放送時間、視聴先をここに掲載します。",
      paragraphs: [
        "これは表示確認用のサンプルです。実際の出演告知ではありません。",
        "本公開では、番組名、放送局・配信サービス、放送日時、公式の視聴先を掲載します。情報解禁の確認後に公開します。"
      ],
      image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
      imageAlt: "録音スタジオのイメージ写真。本人の出演現場ではありません。"
    },
    {
      id: "sample-event",
      category: "event",
      title: "トークイベントの開催情報",
      publishedAt: "2026-10-26T10:00:00+09:00",
      startsAt: "2026-11-07T14:00:00+09:00",
      medium: "イベント",
      summary: "会場、開催日時、参加方法をまとめてご案内します。",
      paragraphs: [
        "これは架空のイベント情報です。チケット販売や予約の受け付けはありません。",
        "本公開では会場・開催形式・主催者の案内先を掲載します。変更や中止があった場合は、元の告知に更新内容を残します。"
      ],
      image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
      imageAlt: "打ち合わせをイメージした写真。本人や実際のイベントの写真ではありません。"
    },
    {
      id: "sample-radio",
      category: "media",
      title: "ラジオ番組の放送予定",
      publishedAt: "2026-10-24T11:00:00+09:00",
      startsAt: "2026-11-10T18:30:00+09:00",
      medium: "ラジオ",
      summary: "放送日時と、聴取方法の案内を掲載するサンプルです。",
      paragraphs: [
        "これは表示確認用のサンプルです。実際の番組名・出演予定は未設定です。",
        "放送日と告知の公開日は別々に管理します。深夜番組や海外の予定も、日付とタイムゾーンを明確にして掲載します。"
      ]
    },
    {
      id: "sample-web",
      category: "media",
      title: "インタビュー掲載のお知らせ",
      publishedAt: "2026-10-22T12:00:00+09:00",
      startsAt: null,
      medium: "Web",
      summary: "掲載媒体と記事の見どころを紹介します。",
      paragraphs: [
        "これは架空の掲載情報です。実在の媒体への掲載実績を示すものではありません。",
        "実際の記事公開後に、媒体名、公開日、掲載先へのリンクを追加します。記事本文や写真は、利用許諾を確認して扱います。"
      ]
    },
    {
      id: "sample-site",
      category: "info",
      title: "公式サイトのデザインを準備中",
      publishedAt: "2026-10-20T09:00:00+09:00",
      startsAt: null,
      medium: "お知らせ",
      summary: "このページは、色・文字・写真・情報の並びを確認するベータです。",
      paragraphs: [
        "人物写真は提供素材を使用しています。紹介文、SNSの移動先、問い合わせの宛先は確認・設定前です。",
        "オンラインサロンや会員機能は含みません。問い合わせは、受信先アドレスを公開しないWeb3Forms方式で準備しています。"
      ]
    }
  ]
});
