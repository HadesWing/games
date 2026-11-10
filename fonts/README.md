# 字体说明

工程默认使用 Godot 4 内置字体 + 系统字体回退（TextServerAdvanced 的
`allow_system_fallback`）。已用 headless 探测验证：汉字、拼音字母与 `★` 均有字形，
因此不需要随仓库附带任何字体文件。

本机若想统一字形，请放入**允许再分发**的开源中文字体（OFL 许可，如思源黑体、
霞鹜文楷），并在 `project.godot` 的 `[gui]` 段加一行：

```
theme/custom_font="res://fonts/<文件名>.ttf"
```

⚠️ 不要把 Windows 系统自带字体（如 `C:\Windows\Fonts\simhei.ttf`）提交到仓库：
那是 Microsoft 的专有字体，不可随公开仓库分发，已在 `.gitignore` 中排除。
