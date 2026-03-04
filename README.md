# 🧭 Safari Web Proxy Clone

A functional browser-in-a-browser web application built with vanilla web technologies. This project atempts to mimic the Safari experience—complete with glassmorphism UI, real tabbed browsing, and a built-in proxy engine that allows you to bypass CORS and surf the web directly within the app.

<img width="1202" height="618" alt="image" src="https://github.com/user-attachments/assets/3d0327ff-d9a0-4333-a57f-e3fd93aa9a76" />


## ✨ Features

### 🎨 Authentic Safari UI
* **Glassmorphism Design:** Accurately replicates macOS/iOS translucency using `backdrop-filter` for the toolbar, menus, and status bar.
* **Dynamic Theming:** Seamlessly toggle between Light Mode and Dark Mode (default). Wallpapers and UI colors automatically adjust to match the theme.
* **Responsive Omnibox:** The URL bar automatically formats links, displays loading spinners, and visually highlights when focused.

<img width="1202" height="618" alt="image" src="https://github.com/user-attachments/assets/6b000cab-6061-47e5-8ed2-28f7b5a41c8d" />

### 📑 Advanced Tab Management
* **Real Tabbed Browsing:** Open, close, and switch between multiple tabs. The tab strip dynamically hides when only one tab is active.
* **Isolated Sessions:** Each tab loads inside its own secure, sandboxed `iframe`.
* **Per-Tab History:** Navigate backward and forward with ease. The app tracks the `historyStack` individually for every tab.
* **Dynamic Favicons:** Automatically fetches high-quality site icons via the Google S2 Favicons API.

### 🌐 Built-in Web Proxy Engine
* **CORS Bypass:** Renders external websites without throwing cross-origin errors by routing requests through public APIs.
* **Proxy Racing:** Uses `Promise.any()` to simultaneously ping multiple proxies (AllOrigins, CORSProxy.io, and CodeTabs), rendering the page using whichever proxy responds the fastest.
* **Smart URL Routing:** Automatically prepends `https://` to URLs or routes standard text queries through a Bing search.
* **Path Correction:** Injects `<base href="...">` into proxied HTML to ensure relative images, styles, and scripts load correctly.

### 🏠 Native Internal Pages
* **Start Page (`about:home`):** Features a customizable Favorites grid (Apple, GitHub, Reddit, Steam, etc.) and a mock Safari Privacy Report card.
* **Graceful Error Handling:** If all proxies time out or fail, the browser renders a native-looking "Connection Failed" error card with a reload option.

---

## 🚀 Getting Started

Because this project is built entirely with vanilla web technologies, there are no dependencies to install, package managers to configure, or build steps to run.
Download and do whatever.
