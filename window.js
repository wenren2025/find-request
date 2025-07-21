console.log('[API捕获器] 🚀 Window Script已加载');

// DOM元素
const clearBtn = document.getElementById('clearBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const requestCount = document.getElementById('requestCount');
const activeTab = document.getElementById('activeTab');
const requestsList = document.getElementById('requestsList');

// 状态变量
let currentRequests = [];
let isListening = false;
let currentActiveTabId = null;

// 初始化
async function init() {
  console.log('[API捕获器] 初始化Window界面');
  
  // 绑定事件
  clearBtn.addEventListener('click', clearRequests);
  
  // 监听来自Background的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[API捕获器] Window收到消息:', message);
    
    switch (message.type) {
      case 'REQUEST_UPDATED':
        refreshRequests();
        break;
    }
  });
  
  // 窗口关闭时停止监听
  window.addEventListener('beforeunload', async () => {
    console.log('[API捕获器] 窗口关闭，停止监听');
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_LISTENING_ALL_TABS' });
    } catch (error) {
      console.log('[API捕获器] 停止监听失败:', error);
    }
  });
  
  // 初始加载
  await refreshRequests();
  
  // 自动开始监听
  await autoStartListening();
  
  // 定期更新状态
  setInterval(updateStatus, 5000);
  
  console.log('[API捕获器] Window界面初始化完成');
}

// 自动开始监听（窗口打开时）
async function autoStartListening() {
  console.log('[API捕获器] 自动开始监听POST请求');
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'START_LISTENING_ALL_TABS' });
    
    if (response.success) {
      console.log('[API捕获器] 自动监听已启动，活动标签页:', response.activeTabId);
      currentActiveTabId = response.activeTabId;
      
      // 如果有警告信息，在控制台记录但不弹窗
      if (response.warning) {
        console.warn('[API捕获器] 警告:', response.warning);
        const warningMsg = response.mode === 'webRequest' 
          ? 'Content Script不可用，使用WebRequest模式。只能捕获POST请求。'
          : response.warning;
        
        console.log('[API捕获器] 运行模式提示:', warningMsg);
      }
      
      await updateStatus();
    } else {
      console.log('[API捕获器] 自动启动监听失败:', response.error);
      // 自动启动失败时不弹窗，只记录日志
    }
  } catch (error) {
    console.error('[API捕获器] 自动启动监听异常:', error);
    // 自动启动异常时不弹窗，只记录日志
  }
}



// 清空请求
async function clearRequests() {
  console.log('[API捕获器] 清空请求');
  clearBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_REQUESTS' });
    
    if (response.success) {
      console.log('[API捕获器] 请求已清空');
      await refreshRequests();
    } else {
      console.error('[API捕获器] 清空请求失败:', response.error);
      alert('清空请求失败: ' + response.error);
    }
  } catch (error) {
    console.error('[API捕获器] 清空请求异常:', error);
    alert('清空请求异常: ' + error.message);
  }
  
  clearBtn.disabled = false;
}

// 刷新请求列表
async function refreshRequests() {
  console.log('[API捕获器] 刷新请求列表');
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_REQUESTS' });
    currentRequests = response.requests || [];
    
    console.log('[API捕获器] 获取到请求数量:', currentRequests.length);
    renderRequestsList();
  } catch (error) {
    console.error('[API捕获器] 获取请求失败:', error);
  }
}

// 更新状态
async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LISTENING_STATUS' });
    
    isListening = response.isListening || false;
    currentActiveTabId = response.activeTabId;
    
    // 更新UI状态
    if (isListening) {
      statusDot.classList.add('listening');
      statusText.textContent = '自动监听中';
    } else {
      statusDot.classList.remove('listening');
      statusText.textContent = '未监听';
    }
    
    // 更新活动标签页信息
    if (currentActiveTabId) {
      try {
        const tab = await chrome.tabs.get(currentActiveTabId);
        const tabInfo = `${tab.id} - ${tab.title?.substring(0, 20) || 'Unknown'}`;
        activeTab.textContent = tabInfo;
      } catch (e) {
        activeTab.textContent = `${currentActiveTabId} - (已关闭)`;
      }
    } else {
      activeTab.textContent = '-';
    }
    
    console.log('[API捕获器] 状态更新完成:', { isListening, currentActiveTabId });
  } catch (error) {
    console.error('[API捕获器] 更新状态失败:', error);
  }
}

// 渲染请求列表
function renderRequestsList() {
  requestCount.textContent = currentRequests.length;
  
  if (currentRequests.length === 0) {
          requestsList.innerHTML = `
        <div class="empty-state">
          <p>暂无POST请求</p>
          <p class="hint">窗口已自动开启监听，在网页上触发POST请求即可捕获</p>
        </div>
      `;
    return;
  }
  
  // 按时间倒序排列，只显示最新的10个
  const sortedRequests = [...currentRequests]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
  
  requestsList.innerHTML = sortedRequests.map(request => {
    const url = request.url || '未知URL';
    const time = request.capturedAt || new Date(request.timestamp).toLocaleTimeString();
    
    // 格式化请求体数据
    let bodyContent = '';
    if (request.requestBody) {
      try {
        if (typeof request.requestBody === 'string') {
          // 尝试格式化JSON
          try {
            const parsed = JSON.parse(request.requestBody);
            bodyContent = JSON.stringify(parsed, null, 2);
          } catch (e) {
            bodyContent = request.requestBody;
          }
        } else if (typeof request.requestBody === 'object') {
          bodyContent = JSON.stringify(request.requestBody, null, 2);
        } else {
          bodyContent = String(request.requestBody);
        }
      } catch (e) {
        bodyContent = String(request.requestBody);
      }
    }
    
    if (!bodyContent) {
      bodyContent = '无请求体数据';
    }
    
    return `
      <div class="request-item">
        <div class="request-header">
          <div class="request-url" title="${request.url || url}">${url}</div>
          <div class="request-time">${time}</div>
        </div>
        <div class="request-body" style="position: relative;">
          <button class="copy-btn" onclick="copyToClipboard(this, ${JSON.stringify(bodyContent).replace(/"/g, '&quot;')})">复制</button>
          ${bodyContent === '无请求体数据' ? 
            `<span class="no-data">${bodyContent}</span>` : 
            bodyContent
          }
        </div>
      </div>
    `;
  }).join('');
}

// 复制到剪贴板
async function copyToClipboard(button, content) {
  try {
    await navigator.clipboard.writeText(content);
    
    const originalText = button.textContent;
    button.textContent = '已复制!';
    button.style.background = '#28a745';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '#17a2b8';
    }, 1500);
    
    console.log('[API捕获器] 数据已复制到剪贴板');
  } catch (error) {
    console.error('[API捕获器] 复制失败:', error);
    alert('复制失败: ' + error.message);
  }
}

// 将函数暴露到全局作用域供HTML调用
window.copyToClipboard = copyToClipboard;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init); 