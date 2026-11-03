import React from 'react';

export default class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Application render failed:', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-recovery" role="alert">
        <h1>Không thể mở màn hình này</h1>
        <p>Hãy tải lại ứng dụng để khôi phục kết nối và cập nhật phiên bản mới nhất. Nội dung chưa lưu có thể cần nhập lại.</p>
        <button onClick={() => window.location.reload()}>Tải lại ứng dụng</button>
      </main>
    );
  }
}
