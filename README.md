# RKHP

デザイン・操作確認用のデモサイトです。ニュース・紹介文にはサンプルが含まれます。正式な本番サイトではありません。

## 公開先

- デモ：[GitHub Pages](https://ryumii.github.io/RKHP/)
- ソース：[Ryumii/RKHP](https://github.com/Ryumii/RKHP)
- 本番：Cloudflareを予定。プロジェクトと独自ドメインは未設定です。

現在のGitHubプランではPrivateリポジトリからPagesを公開できないため、デモ共有期間はPublicにします。`RKHP`という名前や`noindex`はアクセス制限ではありません。公開中にコピーされたソース・画像・資料は回収できません。

## 公開用ファイルの生成

Node.js 22を使います。npmの依存追加は不要です。

```powershell
node --test ".\tests\build-site.test.mjs"
node ".\scripts\build-site.mjs"
```

生成される`dist`にはHTML・CSS・JavaScriptと、表示用の人物写真・SNSロゴ・掲載中の番組バナーだけを入れます。番組画像は[content.js](./content.js)の設定から取得します。

仕様書・テスト・作業用設定はWeb配信しません。人物写真の原本、スキル設定、作業メモ、未使用の仮ロゴはGitHubへのアップロードからも除外しています。

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
