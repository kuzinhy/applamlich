import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Chỉ đăng ký ở bản build thật: bản dev có HMR và dữ liệu demo, cache vỏ sẽ gây nhiễu.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Chrome chặn service worker trên http không phải localhost — app vẫn chạy, chỉ mất tính năng cài đặt. */
    });
  });
}
