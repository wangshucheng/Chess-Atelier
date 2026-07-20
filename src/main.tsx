import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 注意：react-chessboard 4.7.2 在 React 18 StrictMode 下存在兼容缺陷
// （双挂载会使库内部 boardWidth 状态被 ResizeObserver 重置为 undefined，导致棋盘不渲染）。
// 故此处不包裹 StrictMode。
createRoot(document.getElementById('root')!).render(<App />)
