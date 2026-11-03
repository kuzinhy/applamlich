import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import KioskScreen from './components/KioskScreen.jsx';
import './index.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { BrowserRouter } from 'react-router-dom';

/** Màn TV mở bằng link công khai: không vỏ ứng dụng, không đăng nhập, không hiệu ứng nền. */
const kioskToken = /^\/kiosk\/([a-f0-9]{16,48})\/?$/i.exec(window.location.pathname)?.[1] || '';

const rootContent = kioskToken
  ? <KioskScreen token={kioskToken} />
  : (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppErrorBoundary><App /></AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {rootContent}
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
