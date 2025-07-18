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

// 打开捕获窗口并自动开始监听
function openCaptureWindow() {
  console.log('[API捕获器] 准备打开捕获窗口并自动开始监听');
  
  // 更新按钮状态，显示正在处理
  const btn = document.getElementById('openWindowBtn');
  if (btn) {
    btn.textContent = '正在启动监听...';
    btn.disabled = true;
  }
  
  // 先开始监听
  chrome.runtime.sendMessage({
    type: 'START_LISTENING_ALL_TABS'
  }).then(startResponse => {
    if (startResponse && startResponse.success) {
      console.log('[API捕获器] 🎉 监听已自动启动');
      if (btn) {
        btn.textContent = '正在打开窗口...';
      }
      
      // 然后打开窗口
      return chrome.runtime.sendMessage({
        type: 'OPEN_CAPTURE_WINDOW'
      });
    } else {
      console.error('[API捕获器] 自动启动监听失败:', startResponse?.error);
      if (btn) {
        btn.textContent = '监听启动失败，仍在打开窗口...';
      }
      // 即使监听启动失败，也尝试打开窗口
      return chrome.runtime.sendMessage({
        type: 'OPEN_CAPTURE_WINDOW'
      });
    }
  }).then(response => {
    if (response && response.success) {
      console.log('[API捕获器] 🎉 捕获窗口已打开');
      if (btn) {
        btn.textContent = '✅ 启动成功！';
        btn.style.backgroundColor = '#28a745';
      }
      // 延迟关闭popup，让用户能看到成功状态
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      console.error('[API捕获器] 打开窗口失败:', response?.error);
      if (btn) {
        btn.textContent = '❌ 启动失败';
        btn.style.backgroundColor = '#dc3545';
        btn.disabled = false;
      }
      alert('打开窗口失败，请重试');
    }
  }).catch(err => {
    console.error('[API捕获器] 发送消息失败:', err);
    
    if (btn) {
      btn.textContent = '使用备用方案...';
    }
    
    // 作为备用方案，先尝试启动监听，然后直接打开窗口
    chrome.runtime.sendMessage({
      type: 'START_LISTENING_ALL_TABS'
    }).then(() => {
      console.log('[API捕获器] 备用方案：监听已启动');
      if (btn) {
        btn.textContent = '备用方案：正在打开窗口...';
      }
    }).catch(() => {
      console.log('[API捕获器] 备用方案：启动监听失败，但继续打开窗口');
      if (btn) {
        btn.textContent = '备用方案：直接打开窗口...';
      }
    }).finally(() => {
      // 无论监听是否成功，都打开窗口
      const windowWidth = 320;
      const windowHeight = 360;
      const left = Math.max(0, window.screen.width - windowWidth - 20); // 距离右边缘20px
      const top = 20; // 距离顶部20px
      
      chrome.windows.create({
        url: chrome.runtime.getURL('window.html'),
        type: 'popup',
        width: windowWidth,
        height: windowHeight,
        focused: true,
        left: left,
        top: top
              }).then(() => {
          console.log('[API捕获器] 🎉 备用方案成功！');
          if (btn) {
            btn.textContent = '✅ 备用方案成功！';
            btn.style.backgroundColor = '#28a745';
          }
          setTimeout(() => {
            window.close();
          }, 1500);
        }).catch(error => {
          console.error('[API捕获器] 直接打开窗口也失败:', error);
          if (btn) {
            btn.textContent = '❌ 所有方案都失败';
            btn.style.backgroundColor = '#dc3545';
            btn.disabled = false;
          }
          alert('无法打开捕获窗口');
        });
    });
  });
} 