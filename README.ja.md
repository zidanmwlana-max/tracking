# BMI 物流フリート・整備工場統合管理システム v3.0 (Logistics & Fleet Maintenance DX)

[![OWASP ASVS Level 2](https://img.shields.io/badge/Security-OWASP_ASVS_L2-0A2547)](./server.ts)
[![WCAG 2.2 AA](https://img.shields.io/badge/Accessibility-WCAG_2.2_AA-059669)](./src/components/ui/Modal.tsx)
[![Automated Tests](https://img.shields.io/badge/Tests-34%2F34_Passing-10B981)](./tests/workshop-remediation.test.mjs)
[![APPI Compliant](https://img.shields.io/badge/Privacy-APPI_%E5%8C%BF%E5%90%8D%E5%8C%96%E5%AF%BE%E5%BF%9C-2563EB)](./src/services/demoSeedData.ts)

> 🇬🇧 / 🇮🇩 **English & Indonesian Documentation:** [README.md](./README.md)

---

## 1. プロジェクト概要 (Executive Overview)

**BMI 整備・車両DX (Workshop Management System v3.0)** は、大型物流車両（トラクターヘッド、20ft/40ftシャーシ、リーファー用発電機 Genset）の稼働率最大化と整備工場業務のデジタル化（DX）を実現するフルスタックWebアプリケーションです。

日本の物流・商用車フリート管理（**「2024年問題」に伴う車両稼働率向上・予防整備の高度化**）と共通する現場課題を解決するため、以下の機能とアーキテクチャを備えています。

### 主なドメイン機能
1. **車両・資産管理（車検・法定点検 / Shaken & Preventive Maintenance）：** 走行距離（オドメーター）および稼働時間に基づく予防整備アラートとダウンタイム追跡。
2. **シャーシ13項目日常点検（Nichijō Tenken）：** ツイストロック、ブレーキ系統、灯火類、アクスル等の13項目デジタル点検表と即座のPDF出力（`jsPDF` 動的ロード）。
3. **タイヤ摩耗・CPK（1kmあたりコスト）管理：** 溝深さ（`mm`）、空気圧（`PSI`）、装着位置、および倉庫内予備タイヤの滞留日数（アイドルダウンタイム）の一元管理。
4. **整備指示書（Work Order / Seibi Shijisho）＆部品在庫連動：** 優先度別タスク管理、ベイ割り当て、およびパーツ出庫承認ワークフロー。

---

## 2. 技術的ハイライト（設計・セキュリティ・信頼性）

### ① 楽観的排他制御（Optimistic Concurrency Control）によるデータ消失防止
複数の現場整備士が同時に整備指示書やタイヤ点検データを更新した際、後勝ち上書き（Lost Update）を防ぐため、`stateVersion` によるバージョン検証を実装しています。競合発生時は `HTTP 409 Conflict` を返し、サーバー側でスナップショットを自動退避しつつ、クライアント側でエンティティ単位の自動マージを実行します。また、ファイル永続化には一時ファイル書き込み後のアトミックリネーム（`.tmp` $\rightarrow$ `fs.promises.rename`）を採用しています。

### ② OWASP ASVS Level 2 準拠のセキュリティ設計
- **サーバー主導認証と暗号化：** パスワードはサーバー側で `crypto.scryptSync` + `crypto.timingSafeEqual` により検証され、HMAC-SHA256 署名付きセッショントークンを発行します。ブラウザの `localStorage` に平文パスワードは一切保存されません。
- **ロールベースアクセス制御（RBAC）：** 運行管理者（Supervisor）、システム管理者（Admin）、現場整備士（Mekanik）の権限をサーバーAPI（`requireAuth` / `requireSupervisor`）とUIの双方で厳格に分離。
- **SSRF対策：** 外部アダプターURL検証（`validateSafeExternalAdapterUrl`）により、プライベートIP帯（`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`）へのリクエストを遮断。

### ③ オフライン耐性（IndexedDB 非同期ストレージ）とバンドル最適化
通信環境が不安定な整備ピットやヤード内でも業務を継続できるよう、400msデバウンス付きの **IndexedDB (`bmi_workshop_idb_v3`)** を実装。大容量の点検データや64輪分のタイヤ履歴でも `QuotaExceededError` を起こさず高速に動作します。

### ④ 採用担当者向け「ワンクリック・デモログイン」＆ APPI（個人情報保護法）対応
ログイン画面に **日本語・英語・インドネシア語 (`JP / EN / ID`)** の切り替えボタンと、パスワード入力不要の **ワンクリック・デモログイン** を搭載。デモモード時は日本の個人情報保護法（APPI）およびインドネシアPDP法に準拠し、実在のナンバープレートや個人名を匿名化した安全な検証用データセット（[`src/services/demoSeedData.ts`](./src/services/demoSeedData.ts)）が適用されます。

---

## 3. テスト・検証方法 (Verification)

外部バイナリに依存しない Node.js 標準テストランナー（`node:test`）により、セキュリティ・排他制御・ドメイン計算・多言語対応の全34テストを実行できます。

```bash
node --test tests/workshop-remediation.test.mjs
```
