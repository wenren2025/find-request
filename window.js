console.log('[API捕获器] 窗口已加载');

// DOM元素
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const requestsListElement = document.getElementById('requestsList');

// 状态管理
let isListening = false;
let currentRequests = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('[API捕获器] DOM加载完成');
  
  // 绑定事件
  startBtn.addEventListener('click', startListening);
  stopBtn.addEventListener('click', stopListening);
  clearBtn.addEventListener('click', clearRequests);
  
  // 初始化数据和状态
  initializeWindow();
  
  // 自动刷新
  setInterval(refreshRequests, 2000);
});

// 初始化窗口状态
function initializeWindow() {
  console.log('[API捕获器] 初始化窗口状态');
  
  chrome.runtime.sendMessage({
    type: 'GET_LISTENING_STATUS'
  }).then(response => {
    if (response) {
      isListening = response.isListening;
      console.log('[API捕获器] 获取到监听状态:', isListening);
    }
    updateUI();
    refreshRequests();
  }).catch(err => {
    console.error('[API捕获器] 获取监听状态失败:', err);
    updateUI();
    refreshRequests();
  });
}

// 开始监听
function startListening() {
  console.log('[API捕获器] 开始监听');
  
  chrome.runtime.sendMessage({
    type: 'START_LISTENING_ALL_TABS'
  }).then(response => {
    if (response && response.success) {
      isListening = true;
      updateUI();
      console.log('[API捕获器] 监听已启动');
    } else {
      console.error('[API捕获器] 启动监听失败');
    }
  }).catch(err => {
    console.error('[API捕获器] 启动监听失败:', err);
  });
}

// 停止监听
function stopListening() {
  console.log('[API捕获器] 停止监听');
  
  chrome.runtime.sendMessage({
    type: 'STOP_LISTENING_ALL_TABS'
  }).then(response => {
    if (response && response.success) {
      isListening = false;
      updateUI();
      console.log('[API捕获器] 监听已停止');
    } else {
      console.error('[API捕获器] 停止监听失败');
    }
  }).catch(err => {
    console.error('[API捕获器] 停止监听失败:', err);
  });
}

// 清空请求
function clearRequests() {
  console.log('[API捕获器] 清空请求记录');
  
  chrome.runtime.sendMessage({
    type: 'CLEAR_ALL_REQUESTS'
  }).then(response => {
    if (response && response.success) {
      currentRequests = [];
      updateRequestsList();
      console.log('[API捕获器] 请求记录已清空');
    } else {
      console.error('[API捕获器] 清空失败:', response?.error);
    }
  }).catch(err => {
    console.error('[API捕获器] 清空请求失败:', err);
  });
}

// 刷新请求列表
function refreshRequests() {
  console.log('[API捕获器] 🔄 开始刷新请求列表');
  chrome.runtime.sendMessage({
    type: 'GET_ALL_REQUESTS'
  }).then(response => {
    console.log('[API捕获器] 📨 收到响应:', response);
    if (response && response.requests) {
      console.log('[API捕获器] 📋 请求数量:', response.requests.length);
      currentRequests = response.requests;
      updateRequestsList();
    } else {
      console.log('[API捕获器] ⚠️ 响应格式异常:', response);
    }
  }).catch(err => {
    console.error('[API捕获器] ❌ 获取请求数据失败:', err);
  });
}

// 更新UI状态
function updateUI() {
  console.log('[API捕获器] 更新UI状态:', isListening);
  
  if (isListening) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// 更新请求列表
function updateRequestsList() {
  console.log('[API捕获器] 🎨 更新请求列表，当前请求数量:', currentRequests.length);
  
  if (currentRequests.length === 0) {
    console.log('[API捕获器] 📭 没有请求，显示空状态');
    requestsListElement.innerHTML = `
      <div class="empty-state">
        <p>暂无捕获的请求</p>
      </div>
    `;
    return;
  }
  
  // 按时间倒序排列
  const sortedRequests = [...currentRequests].sort((a, b) => b.timestamp - a.timestamp);
  console.log('[API捕获器] 📊 排序后的请求:', sortedRequests.map(r => ({ url: r.url, timestamp: r.timestamp })));
  
  requestsListElement.innerHTML = sortedRequests.map(request => {
    const urlPath = getUrlPath(request.url);
    const params = formatParams(request);
    
    console.log('[API捕获器] 🎯 处理请求:', { url: request.url, urlPath, hasParams: !!params });
    
    return `
      <div class="request-item">
        <div class="request-path">${urlPath}</div>
        <div class="request-params">${params}</div>
      </div>
    `;
  }).join('');
  
  console.log('[API捕获器] ✅ 请求列表HTML已更新');
}

// 提取URL路径（不含域名）
function getUrlPath(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  } catch (e) {
    // 如果URL解析失败，返回原始URL
    return url || '未知URL';
  }
}

// 格式化请求参数
function formatParams(request) {
  let params = '';
  
  // 优先使用解析后的数据
  if (request.parsedData) {
    try {
      params = JSON.stringify(request.parsedData, null, 2);
    } catch (e) {
      params = String(request.parsedData);
    }
  } else if (request.data) {
    try {
      if (typeof request.data === 'string') {
        // 尝试解析JSON
        const parsed = JSON.parse(request.data);
        params = JSON.stringify(parsed, null, 2);
      } else {
        params = JSON.stringify(request.data, null, 2);
      }
    } catch (e) {
      params = String(request.data);
    }
  } else {
    params = '无请求参数';
  }
  
  return params;
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[API捕获器] 窗口收到消息:', message);
  
  switch (message.type) {
    case 'REQUEST_UPDATED':
      refreshRequests();
      break;
      
    case 'LISTENING_STATUS_CHANGED':
      isListening = message.isListening;
      updateUI();
      break;
  }
}); 