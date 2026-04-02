# MacroPulse 总经分析仪表板

MacroPulse 是一款 macOS 桌面应用，汇整美国主要宏观经济指标，计算综合评分（0-100），给出买入/观望/风险回避的量化建议。

![Platform](https://img.shields.io/badge/platform-macOS%2014%2B-blue)
![Swift](https://img.shields.io/badge/Swift-5.9-orange)

## 功能特色

- **10 项宏观指标** — 联邦基金利率、殖利率曲线、CPI、失业率、PMI、GDP、VIX、CNN Fear & Greed、S&P 500 趋势等
- **加权综合评分** — 货币政策 30%、经济基本面 30%、市场情绪 40%
- **逆向情绪策略** — 恐惧与贪婪指数采用逆向思维（极度恐惧 = 买入信号）
- **历史趋势追踪** — 每日快照自动保存，支持 30 天回溯补齐
- **信号变化时间轴** — 追踪买入/观望/风险信号的转变时间点
- **可展开的每日明细** — 查看任一天各指标的详细数值与评分

## 截图

（启动后在侧边栏切换「总览」「历史趋势」「货币与利率」等页面）

## 数据来源

| 来源 | 用途 | 认证 |
|------|------|------|
| [FRED API](https://fred.stlouisfed.org/docs/api/api_key.html) | 利率、CPI、失业率、VIX、GDP 等 | API Key（必填，免费） |
| [Alpha Vantage](https://www.alphavantage.co/support/#api-key) | S&P 500 价格、200 日均线 | API Key（选填，免费 25 次/天） |
| CNN Fear & Greed | 恐惧与贪婪指数 | 无需认证 |

## 安装与运行

### 前置需求

- macOS 14 (Sonoma) 或更高版本
- Swift 5.9+（Xcode 15+ 或独立安装）
- FRED API Key（免费注册即可获得）

### 开发运行

```bash
cd MacroPulse
swift run
```

### 打包为 .app

```bash
cd MacroPulse
chmod +x build.sh
./build.sh
open MacroPulse.app
```

### 设置 API Key

1. 启动应用后，在侧边栏点击「设置」
2. 输入 FRED API Key（必填）
3. 可选：输入 Alpha Vantage API Key
4. 点击「保存 API Keys」
5. 回到「总览」页面，点击工具栏的刷新按钮

## 评分逻辑

综合评分基于三大类别的加权平均：

### 货币与利率（30%）
- Fed 利率趋势：降息 = 看多
- 殖利率曲线（10Y-2Y）：正斜率 = 健康，反转 = 衰退预警
- 10 年期国债：适中最佳，过高压制估值

### 经济基本面（30%）
- CPI 通胀率：2-3% 温和通胀为理想区间
- 失业率：低失业支撑消费与企业盈利
- ISM PMI：>50 扩张，<50 收缩
- GDP 增长率：正增长 = 经济活力

### 市场情绪（40%）
- VIX 恐慌指数：低波动看多，但极低需警惕自满
- CNN Fear & Greed：**逆向操作** — 极度恐惧时买入
- S&P 500 vs 200 日均线：高于均线 = 多头格局

## 历史数据持久化

- 每次刷新自动保存当天完整快照
- 自动补齐最近 30 个交易日的历史数据
- 数据存储于 `~/Library/Application Support/MacroPulse/history.json`
- 月频/季频指标使用 forward-fill 补齐每日数据

## 项目结构

```
MacroPulse/
├── Package.swift
├── build.sh                    # 打包为 .app 的脚本
└── Sources/
    ├── MacroPulseApp.swift      # 应用入口
    ├── Models/
    │   ├── Indicator.swift      # 指标模型、类别、信号等级
    │   ├── ScoreEngine.swift    # 评分引擎（纯函数）
    │   └── DailySnapshot.swift  # 每日快照模型
    ├── Services/
    │   ├── FREDService.swift    # FRED API 服务
    │   ├── FearGreedService.swift
    │   ├── MarketDataService.swift
    │   ├── DataManager.swift    # 中央状态管理 + 补齐逻辑
    │   └── HistoryStore.swift   # JSON 持久化
    ├── Views/
    │   ├── ContentView.swift    # 侧边栏导航
    │   ├── DashboardView.swift  # 总览仪表板
    │   ├── HistoryView.swift    # 历史趋势图
    │   ├── ScoreGaugeView.swift # 圆弧评分仪表
    │   ├── IndicatorCardView.swift
    │   ├── CategoryDetailView.swift
    │   └── SettingsView.swift
    └── Resources/
        └── AppIcon.icns         # 应用图标
```

## 免责声明

本工具仅供学习与参考，不构成投资建议。宏观经济指标分析存在滞后性和局限性，投资决策应结合个人风险承受能力和专业顾问意见。
