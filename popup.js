console.log('[API捕获器] Popup script 已加载');

// DOM元素
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const refreshBtn = document.getElementById('refreshBtn');
const togglePanelBtn = document.getElementById('togglePanelBtn');
const statusElement = document.getElementById('status');
const requestCountElement = document.getElementById('requestCount');
const requestsListElement = document.getElementById('requestsList');
const requestModal = document.getElementById('requestModal');
const closeModalBtn = document.getElementById('closeModal');
const copyDataBtn = document.getElementById('copyDataBtn');

// 状态管理
let isListening = false;
let currentRequests = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('[API捕获器] Popup DOM加载完成');
  
  // 绑定事件
  startBtn.addEventListener('click', startListening);
  stopBtn.addEventListener('click', stopListening);
  clearBtn.addEventListener('click', clearRequests);
  refreshBtn.addEventListener('click', refreshRequests);
  togglePanelBtn.addEventListener('click', toggleFloatingPanel);
  closeModalBtn.addEventListener('click', closeModal);
  copyDataBtn.addEventListener('click', copyRequestData);
  
  // 点击模态框外部关闭
  requestModal.addEventListener('click', function(e) {
    if (e.target === requestModal) {
      closeModal();
    }
  });
  
  // 初始化数据和状态
  initializePopup();
});

// 初始化popup状态
function initializePopup() {
  console.log('[API捕获器] 初始化popup状态');
  
  // 从storage加载监听状态
  chrome.storage.local.get(['isListening']).then(result => {
    if (result.isListening !== undefined) {
      isListening = result.isListening;
      console.log('[API捕获器] 从storage加载监听状态:', isListening);
    } else {
      console.log('[API捕获器] storage中没有监听状态，默认为false');
      isListening = false;
    }
    
    // 更新UI状态
    updateUI();
    
    // 刷新请求列表
    refreshRequests();
  }).catch(err => {
    console.error('[API捕获器] 加载监听状态失败:', err);
    isListening = false;
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
    if (response.success) {
      isListening = true;
      updateUI();
      console.log('[API捕获器] 监听已启动');
      
      // 同步更新storage中的状态
      chrome.storage.local.set({ isListening: true }).then(() => {
        console.log('[API捕获器] Popup已同步监听状态到storage');
      }).catch(err => {
        console.error('[API捕获器] 同步监听状态失败:', err);
      });
    } else {
      console.error('[API捕获器] 启动监听失败:', response.error);
      alert('启动监听失败: ' + (response.error || '未知错误'));
    }
  }).catch(err => {
    console.error('[API捕获器] 启动监听失败:', err);
    alert('启动监听失败，请检查控制台');
  });
}

// 停止监听
function stopListening() {
  console.log('[API捕获器] 停止监听');
  
  chrome.runtime.sendMessage({
    type: 'STOP_LISTENING_ALL_TABS'
  }).then(response => {
    if (response.success) {
      isListening = false;
      updateUI();
      console.log('[API捕获器] 监听已停止');
      
      // 同步更新storage中的状态
      chrome.storage.local.set({ isListening: false }).then(() => {
        console.log('[API捕获器] Popup已同步监听状态到storage');
      }).catch(err => {
        console.error('[API捕获器] 同步监听状态失败:', err);
      });
    } else {
      console.error('[API捕获器] 停止监听失败:', response.error);
      alert('停止监听失败: ' + (response.error || '未知错误'));
    }
  }).catch(err => {
    console.error('[API捕获器] 停止监听失败:', err);
    alert('停止监听失败，请检查控制台');
  });
}

// 清空请求记录
function clearRequests() {
  console.log('[API捕获器] 清空请求记录');
  
  if (!confirm('确定要清空所有请求记录吗？')) {
    return;
  }
  
  chrome.runtime.sendMessage({
    type: 'CLEAR_ALL_REQUESTS'
  }).then(response => {
    if (response.success) {
      currentRequests = [];
      updateRequestsList();
      console.log('[API捕获器] 请求记录已清空');
    }
  }).catch(err => {
    console.error('[API捕获器] 清空失败:', err);
    alert('清空失败，请检查控制台');
  });
}

// 刷新请求列表
function refreshRequests() {
  console.log('[API捕获器] 刷新请求列表');
  
  chrome.runtime.sendMessage({
    type: 'GET_ALL_REQUESTS'
  }).then(response => {
    if (response.requests) {
      currentRequests = response.requests;
      updateRequestsList();
      console.log('[API捕获器] 请求列表已刷新:', currentRequests.length);
    }
  }).catch(err => {
    console.error('[API捕获器] 刷新失败:', err);
  });
}

// 更新UI状态
function updateUI() {
  console.log('[API捕获器] 更新UI状态:', isListening);
  
  if (isListening) {
    statusElement.className = 'status listening';
    statusElement.querySelector('.status-text').textContent = '正在监听';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    console.log('[API捕获器] UI已更新为监听状态');
  } else {
    statusElement.className = 'status';
    statusElement.querySelector('.status-text').textContent = '未监听';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    console.log('[API捕获器] UI已更新为未监听状态');
  }
}

// 更新请求列表
function updateRequestsList() {
  requestCountElement.textContent = currentRequests.length;
  
  if (currentRequests.length === 0) {
    requestsListElement.innerHTML = `
      <div class="empty-state">
        <p>暂无捕获的请求</p>
        <p class="hint">点击"开始监听"后，在网页上点击按钮即可捕获API请求</p>
      </div>
    `;
    return;
  }
  
  // 按时间倒序排列
  const sortedRequests = [...currentRequests].sort((a, b) => b.timestamp - a.timestamp);
  
  requestsListElement.innerHTML = sortedRequests.map(request => `
    <div class="request-item" data-request-id="${request.id}">
      <div class="request-header">
        <span class="method ${request.method?.toLowerCase()}">${request.method || 'GET'}</span>
        <span class="url">${truncateUrl(request.url)}</span>
        <span class="time">${formatTime(request.timestamp)}</span>
      </div>
      <div class="request-meta">
        <span class="type">${request.type}</span>
        ${request.clickElement ? `<span class="element">${getElementDescription(request.clickElement)}</span>` : ''}
      </div>
    </div>
  `).join('');
  
  // 绑定点击事件
  requestsListElement.querySelectorAll('.request-item').forEach(item => {
    item.addEventListener('click', function() {
      const requestId = this.dataset.requestId;
      const request = currentRequests.find(r => r.id == requestId);
      if (request) {
        showRequestDetails(request);
      }
    });
  });
}

// 显示请求详情
function showRequestDetails(request) {
  console.log('[API捕获器] 显示请求详情:', request);
  
  document.getElementById('modalType').textContent = request.type;
  document.getElementById('modalMethod').textContent = request.method || 'GET';
  document.getElementById('modalUrl').textContent = request.url;
  document.getElementById('modalTime').textContent = formatFullTime(request.timestamp);
  document.getElementById('modalElement').textContent = getElementDescription(request.clickElement);
  
  // 格式化请求数据
  let dataText = '';
  if (request.parsedData) {
    try {
      dataText = JSON.stringify(request.parsedData, null, 2);
    } catch (e) {
      dataText = String(request.parsedData);
    }
  } else if (request.data) {
    try {
      if (typeof request.data === 'string') {
        // 尝试解析JSON
        const parsed = JSON.parse(request.data);
        dataText = JSON.stringify(parsed, null, 2);
      } else {
        dataText = JSON.stringify(request.data, null, 2);
      }
    } catch (e) {
      dataText = String(request.data);
    }
  } else {
    dataText = '无请求数据';
  }
  
  document.getElementById('modalData').textContent = dataText;
  
  // 存储当前请求数据供复制使用
  copyDataBtn.dataset.requestData = dataText;
  
  // 显示模态框
  requestModal.style.display = 'block';
}

// 关闭模态框
function closeModal() {
  requestModal.style.display = 'none';
}

// 复制请求数据
function copyRequestData() {
  const data = copyDataBtn.dataset.requestData;
  if (!data) {
    alert('没有可复制的数据');
    return;
  }
  
  navigator.clipboard.writeText(data).then(() => {
    console.log('[API捕获器] 数据已复制到剪贴板');
    
    // 显示复制成功提示
    const originalText = copyDataBtn.textContent;
    copyDataBtn.textContent = '已复制!';
    copyDataBtn.style.backgroundColor = '#28a745';
    
    setTimeout(() => {
      copyDataBtn.textContent = originalText;
      copyDataBtn.style.backgroundColor = '';
    }, 2000);
  }).catch(err => {
    console.error('[API捕获器] 复制失败:', err);
    alert('复制失败，请手动复制');
  });
}

// 切换浮动面板
function toggleFloatingPanel() {
  console.log('[API捕获器] 切换浮动面板');
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('[API捕获器] 没有找到活动标签页');
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'TOGGLE_FLOATING_PANEL'
    }).then(response => {
      if (response && response.success) {
        togglePanelBtn.textContent = response.visible ? '隐藏浮动面板' : '显示浮动面板';
        console.log('[API捕获器] 浮动面板状态:', response.visible);
      } else {
        console.error('[API捕获器] 切换浮动面板失败: 无效响应');
      }
    }).catch(err => {
      console.error('[API捕获器] 切换浮动面板失败:', err);
      // 可能是content script还没有加载，提示用户
      alert('请先刷新页面，然后再试');
    });
  });
}

// 工具函数
function truncateUrl(url) {
  if (!url) return '';
  if (url.length <= 50) return url;
  return url.substring(0, 47) + '...';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function formatFullTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function getElementDescription(element) {
  if (!element) return '未知元素';
  
  let desc = element.tagName?.toLowerCase() || '';
  
  if (element.id) {
    desc += `#${element.id}`;
  }
  
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      desc += `.${classes.slice(0, 2).join('.')}`;
    }
  }
  
  if (element.textContent) {
    desc += ` "${element.textContent.substring(0, 20)}"`;
  }
  
  return desc || '未知元素';
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[API捕获器] Popup收到消息:', message);
  
  if (message.type === 'REQUEST_UPDATED') {
    // 自动刷新请求列表
    refreshRequests();
  } else if (message.type === 'STATUS_CHANGED') {
    // 状态变化通知
    console.log('[API捕获器] 收到状态变化通知:', message.isListening);
    if (isListening !== message.isListening) {
      isListening = message.isListening;
      updateUI();
      console.log('[API捕获器] 已同步状态变化:', isListening);
    }
  }
});

// 监听storage变化，实现状态同步
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('[API捕获器] Storage变化:', changes);
  
  if (namespace === 'local' && changes.isListening) {
    const newStatus = changes.isListening.newValue;
    console.log('[API捕获器] 监听状态变化:', changes.isListening.oldValue, '->', newStatus);
    
    // 只有当状态确实改变时才更新UI
    if (isListening !== newStatus) {
      isListening = newStatus;
      updateUI();
      console.log('[API捕获器] 已同步监听状态:', isListening);
    }
  }
}); 