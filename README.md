# zhihu-ai

Chrome 扩展：在知乎回答旁添加「AI总结」按钮并调用 OpenAI-compatible API 生成总结。

代码在 `extension/`，安装与使用说明见 `extension/README.md`。

## 打包分发

生成一个便于分发的 zip（收件人解压后可直接在 `chrome://extensions` 里「加载已解压的扩展程序」）：

```bash
./scripts/package.sh
```

