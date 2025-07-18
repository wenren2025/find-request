console.log('[API捕获器] Popup已加载');

// DOM元素
const openWindowBtn = document.getElementById('openWindowBtn');

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('[API捕获器] Popup DOM加载完成');
  
  // 绑定事件
  if (openWindowBtn) {
    openWindowBtn.addEventListener('click', openCaptureWindow);
  }
});

// 打开捕获窗口
function openCaptureWindow() {
  console.log('[API捕获器] 准备打开捕获窗口');
  
  // 发送消息给background script打开窗口
  chrome.runtime.sendMessage({
    type: 'OPEN_CAPTURE_WINDOW'
  }).then(response => {
    if (response && response.success) {
      console.log('[API捕获器] 捕获窗口已打开');
      // 关闭popup
      window.close();
    } else {
      console.error('[API捕获器] 打开窗口失败:', response?.error);
      alert('打开窗口失败，请重试');
    }
  }).catch(err => {
    console.error('[API捕获器] 发送消息失败:', err);
    // 作为备用方案，尝试直接打开
    chrome.windows.create({
      url: chrome.runtime.getURL('window.html'),
      type: 'popup',
      width: 900,
      height: 700
    }).then(() => {
      window.close();
    }).catch(error => {
      console.error('[API捕获器] 直接打开窗口也失败:', error);
      alert('无法打开捕获窗口');
    });
  });
} 