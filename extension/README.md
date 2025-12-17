# Zhihu AI Summary (Chrome Extension)

在知乎问题页/回答页的每条回答操作栏旁增加一个「AI总结」按钮，点击后调用 AI 总结该回答正文。

## 安装（开发版）

1. 打开 Chrome：`chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目目录：`extension/`
5. 打开扩展的 Options，填写 `Base URL`、`OpenAI API Key` 和模型名

## 使用

- 打开任意知乎问题/回答页（例如：`https://www.zhihu.com/question/...`）
- 在回答底部操作栏（赞同/评论/分享…那一行）会出现 `AI总结`
- 点击后会在回答正文下方插入总结框；再次点击会收起

## 开发说明

- 内容脚本：`extension/src/contentScript.js`
- 样式：`extension/src/contentStyles.css`
- 后台（调用 OpenAI）：`extension/src/background.js`
