# RKHP

デザイン・操作確認用のデモサイトです。ニュース・紹介文にはサンプルが含まれます。正式な本番サイトではありません。

## 公開先

- デモ：[GitHub Pages](https://ryumii.github.io/RKHP/)
- ニュース連携テスト：[CloudflareのテストHP](https://rkhp-news-test.rkhp-preview-d0f68d.workers.dev/)。実シートから手動反映した架空ニュースを表示します。
- ソース：[Ryumii/RKHP](https://github.com/Ryumii/RKHP)
- 本番：Cloudflareで公開予定。独自ドメインは指定済みですが、サイト本体の配信設定は未実施です。

現在のGitHubプランではPrivateリポジトリからPagesを公開できないため、デモ共有期間はPublicにします。`RKHP`という名前や`noindex`はアクセス制限ではありません。公開中にコピーされたソース・画像・資料は回収できません。

## 公開用ファイルの生成

Node.js 22を使います。npmの依存追加は不要です。

```powershell
node --test ".\tests\build-site.test.mjs" ".\tests\news-sync.test.mjs" ".\tests\google-news-sheet.test.mjs" ".\tests\browser-unit.test.mjs"
node ".\scripts\build-site.mjs"
```

生成される`dist`にはHTML・CSS・JavaScriptと、表示用の人物写真・SNSロゴ・掲載中の番組バナーだけを入れます。番組画像は[content.js](./content.js)の設定から取得します。

仕様書・テスト・作業用設定はWeb配信しません。人物写真の原本、スキル設定、作業メモ、未使用の仮ロゴはGitHubへのアップロードからも除外しています。

## ニュース管理

非公開のGoogle Sheets・Forms・Driveを、所有者が認可したApps ScriptからCloudflare WorkersとR2へ連携します。Googleの秘密鍵は使わず、公開対象だけを送信します。テストと本番で、シート・画像フォルダー・所有者・列名の対応を切り替えられます。HPの表示は掲載日時の新しい順です。

設定手順は[ニュース管理](./docs/news-management.md)、入力列は[テスト用CSV](./docs/news-sheet-template.csv)を参照してください。実シートの入力6行を読み取り、公開対象4件をテスト用API・HPへ手動反映できることを確認しました。下書き・未来の記事は公開しません。

Apps Scriptによる定期更新と実画像の取り込みは未確認です。既存のGitHub Pagesデモと通常のソース設定はサンプルモードのままで、本番DNSも変更していません。

`workers` は静的サイトの公開用フォルダーへ含めません。ニュースWorkerは、制作資料や秘密設定を含めずに別途デプロイします。

## デモの更新

GitHub Actionsの「Publish demo」を手動実行します。pushだけでは再公開しません。公開用ファイルは`public-site`アーティファクトにも保存されます。

公開デモの問い合わせはWeb3Formsの登録先へ実際に通知する構成です。送信にはhCaptcha認証が必要です。受信箱への到着とReply-Toは運営担当者が確認してください。

## 共有終了後に閉じる

クライアントの確認が終わったら、次の順でPagesを停止し、リポジトリをPrivateにします。

```powershell
gh api --method DELETE "repos/Ryumii/RKHP/pages"
gh repo edit "Ryumii/RKHP" --visibility private --accept-visibility-change-consequences
```

公開URLが閲覧できなくなったことを確認します。以後はPagesを再設定して手動デプロイするまで再公開しません。Private化は、公開済みのコピーを削除する操作ではありません。

## Cloudflareへ移行する場合

資料をCloudflareのビルド環境にも渡さない場合は、Git連携を使わず[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)を選びます。GitHub Actionsまたは手元で生成した`dist`だけをアップロードしてください。リポジトリ全体は渡しません。

Direct Uploadのプロジェクトは、あとから同じプロジェクトをGit連携に切り替えられません。Git連携へ変更する場合は新しいCloudflareプロジェクトが必要です。

## 制作資料

- [ベータの仕様・確認事項](./docs/beta-ui.md)
- [要件定義書](./docs/requirements-definition.md)
- [公式サイト比較レポート](./docs/research-report.md)
- [非エンジニア向けの更新方法](./docs/media-update-options.md)
- [Sheets・Formsのニュース管理と切替手順](./docs/news-management.md)
