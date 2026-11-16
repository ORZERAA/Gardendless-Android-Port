# Gardendless 安卓个人适配代码（Alpha 4）

本包仅用于公开代码审阅和维护，不包含 APK、EXE、游戏构建产物、游戏媒体素材、用户存档或签名私钥。与 Alpha 4 对应的适配逻辑包含在本包中；原游戏启动图标已替换成通用几何矢量图标。

## 来源和许可

基于 https://github.com/Cateners/gardendless-android ，保留原版权声明和 GPL-3.0-or-later 许可证。新增适配代码按 GPL-3.0-or-later 提供。保留许可证并不表示全部第三方游戏素材均获准分发，本包不提供这些素材。
compat/legacy-polyfill.js 和 compat/legacy-shim.js 源自既有移植版本的兼容代码（不是游戏关卡资源），含后续修正；不得将它们误称为全新原创。正式发布前仍应确认这些兼容文件的来源与许可适用范围。

## 构建

本包不能单独生成可玩的完整游戏。合法自行准备已提取的 0.16.26 前端目录（不得提交到仓库），然后运行：

python tools/prepare_game.py --game-dir <本机合法准备的资源目录>

再用 Android Studio 或本机 Android SDK Platform 36、Build Tools 35.0.0、JDK 17+ 编译：

gradlew.bat assembleDebug

运行 JS 测试：bun test tests。

Gradle 8.13 分发配置使用镜像并固定官方 SHA-256。不要把 local.properties、签名私钥、游戏 ZIP、编译日志、存档和 .smoke-data 测试数据上传。

## 验证状态

原 Alpha 4 工程编译通过，26 项 JS 测试通过。本公开副本替换了图标、移除了资源与机器配置，未单独重建 APK。
此前实机反馈关卡可运行，弹窗修复有效；不能推断所有机型均正常。触控、弹窗和本地模组兼容代码可在 compat/ 和 app/src/main/java/ 中查看。

## 隐私

本包按白名单/排除规则整理，未收录本地构建日志和机器配置。文本扫描未检出创建者本机用户名路径、CherryStudio 路径、常见访问令牌形态或私钥头。该扫描不是专业安全审计或绝对无泄漏保证。

本包不含安装签名私钥。其他人自行构建的签名通常不同，无法直接覆盖已有调试签名安装；不要因此让用户直接卸载丢失存档。
