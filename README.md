# 🚗 Car Vault — Dealership Management Dashboard

A **premium, fully offline** car dealership management system built with pure HTML, CSS & JavaScript. Replace your Excel spreadsheets with a beautiful, feature-rich dashboard.

🔗 **Live Demo:** [malikmaax96-design.github.io/car-vault](https://malikmaax96-design.github.io/car-vault)

---

## ✨ Features

| Module | What It Does |
|---|---|
| 🏠 **Dashboard** | Live KPIs, revenue/profit charts, stock status donut chart, alerts |
| 🚗 **Stock** | Add/edit/delete vehicles, filter by status, profit auto-calculation |
| 🔧 **Workshop** | Log repair jobs, LWN numbers, parts & labour costs, mechanic tracking |
| ✅ **Inspections** | Alloy & mechanical condition, inspector, pass/advisory/fail |
| 💰 **Sales** | Record sales, auto-fill from stock, profit calculation |
| 😤 **Complaints** | Track customer complaints with status & resolution notes |
| 📈 **Reports** | 12-month profit trend, top makes sold, export CSV & JSON backup |

## 🚀 How to Use

1. Open `index.html` in any browser — **no server or internet required**
2. All data is saved in your browser's `localStorage`
3. Use **Backup All Data** in Reports to download a `.json` backup file
4. Use **Restore Backup** to import it back anytime

## 📁 Project Structure

```
car-vault/
├── index.html       ← Main entry point
├── css/
│   └── style.css    ← Premium dark theme
└── js/
    └── app.js       ← Full application logic
```

## 🛠️ Tech Stack

- **HTML5** — Semantic structure
- **CSS3** — Custom dark theme with glassmorphism effects
- **Vanilla JavaScript** — SPA routing, CRUD, localStorage
- **Chart.js** — Interactive charts (CDN)
- **Font Awesome** — Icons (CDN)
- **Inter** — Typography (Google Fonts CDN)

## 💾 Data Storage

All data is stored in `localStorage` — no backend, no database, no internet needed. Data persists across browser sessions. Export/import JSON backups for data safety.

---

Built with ❤️ by [malikmaax96-design](https://github.com/malikmaax96-design)
