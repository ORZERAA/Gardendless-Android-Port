# Alpha 5 更新记录

版本：0.16.26-offline-alpha5-webviewfix（162605）。

针对 beforeEngineImport: structuredClone is not defined 的启动错误，增加平台 API 回退。
针对 write_text_file failed: gp-next-startup-diagnostics.json，新增安卓原生系统文档保存桥。
保留 Alpha 4 触控、弹窗和署名说明。

新增：compat/webview-platform.entry.js、compat/webview-platform.js、compat/structured-clone-LICENSE.txt、compat/android-export.js、tests/webview.test.js、bun.lock。
修改：GameActivity.kt、app/build.gradle.kts、tools/prepare_game.py、package.json。
30 项测试通过；原完整工程编译、签名、zipalign 通过。公开副本不含资源，不等同于机型实测通过。

从 Alpha 4 公开包更新：把更新 ZIP 中的文件按相同路径覆盖到仓库；按 DELETIONS.txt 删除已移除文件，合并自己的 README 改动。不要把原本机工程整个复制到仓库。

第三方依赖 @ungap/structured-clone 1.3.0（MIT）需保留许可证。游戏资源与 APK 不在公开包内。
