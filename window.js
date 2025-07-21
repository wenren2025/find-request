console.log('[API捕获器] 🚀 Window Script已加载');

// DOM元素
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const requestCount = document.getElementById('requestCount');
const activeTab = document.getElementById('activeTab');
const requestsList = document.getElementById('requestsList');

// 模态框元素
const requestModal = document.getElementById('requestModal');
const closeModal = document.getElementById('closeModal');
const modalMethod = document.getElementById('modalMethod');
const modalUrl = document.getElementById('modalUrl');
const modalTime = document.getElementById('modalTime');
const modalElement = document.getElementById('modalElement');
const modalDelay = document.getElementById('modalDelay');
const modalData = document.getElementById('modalData');
const copyDataBtn = document.getElementById('copyDataBtn');

// 状态变量
let currentRequests = [];
let isListening = false;
let currentActiveTabId = null;

// 初始化
async function init() {
  console.log('[API捕获器] 初始化Window界面');
  
  // 绑定事件
  startBtn.addEventListener('click', startListening);
  stopBtn.addEventListener('click', stopListening);
  clearBtn.addEventListener('click', clearRequests);
  refreshBtn.addEventListener('click', refreshRequests);
  
  // 模态框事件
  closeModal.addEventListener('click', hideModal);
  copyDataBtn.addEventListener('click', copyRequestData);
  
  // 点击模态框外部关闭
  window.addEventListener('click', (event) => {
    if (event.target === requestModal) {
      hideModal();
    }
  });
  
  // 监听来自Background的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[API捕获器] Window收到消息:', message);
    
    switch (message.type) {
      case 'REQUEST_UPDATED':
        refreshRequests();
        break;
    }
  });
  
  // 初始加载
  await updateStatus();
  await refreshRequests();
  
  // 定期更新状态
  setInterval(updateStatus, 5000);
  
  console.log('[API捕获器] Window界面初始化完成');
}

// 开始监听
async function startListening() {
  console.log('[API捕获器] 开始监听');
  startBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'START_LISTENING_ALL_TABS' });
    
    if (response.success) {
      console.log('[API捕获器] 监听已启动，活动标签页:', response.activeTabId);
      currentActiveTabId = response.activeTabId;
      
      // 如果有警告信息，显示给用户
      if (response.warning) {
        console.warn('[API捕获器] 警告:', response.warning);
        const warningMsg = response.mode === 'webRequest' 
          ? '注意: Content Script不可用，使用WebRequest模式。某些功能可能受限。'
          : response.warning;
        
        // 显示警告但不阻止用户
        setTimeout(() => {
          alert('监听已启动，但有以下提示:\n' + warningMsg);
        }, 500);
      }
      
      await updateStatus();
    } else {
      console.error('[API捕获器] 启动监听失败:', response.error);
      alert('启动监听失败: ' + response.error);
    }
  } catch (error) {
    console.error('[API捕获器] 启动监听异常:', error);
    alert('启动监听异常: ' + error.message);
  }
  
  startBtn.disabled = false;
}

// 停止监听
async function stopListening() {
  console.log('[API捕获器] 停止监听');
  stopBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'STOP_LISTENING_ALL_TABS' });
    
    if (response.success) {
      console.log('[API捕获器] 监听已停止');
      currentActiveTabId = null;
      await updateStatus();
    } else {
      console.error('[API捕获器] 停止监听失败:', response.error);
      alert('停止监听失败: ' + response.error);
    }
  } catch (error) {
    console.error('[API捕获器] 停止监听异常:', error);
    alert('停止监听异常: ' + error.message);
  }
  
  stopBtn.disabled = false;
}

// 清空请求
async function clearRequests() {
  if (!confirm('确定要清空所有捕获的请求吗？')) {
    return;
  }
  
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
      statusText.textContent = '正在监听';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      statusDot.classList.remove('listening');
      statusText.textContent = '未监听';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
    
    // 更新活动标签页信息
    if (currentActiveTabId) {
      try {
        const tab = await chrome.tabs.get(currentActiveTabId);
        const tabInfo = `${tab.id} - ${tab.title?.substring(0, 30) || 'Unknown'}`;
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
        <p>暂无捕获的请求</p>
        <p class="hint">点击"开始监听"后，在网页上点击按钮即可捕获API请求</p>
      </div>
    `;
    return;
  }
  
  // 按时间倒序排列
  const sortedRequests = [...currentRequests].sort((a, b) => b.timestamp - a.timestamp);
  
  requestsList.innerHTML = sortedRequests.map(request => {
    const method = request.method || 'GET';
    const url = request.urlPath || request.url || 'Unknown URL';
    const time = new Date(request.timestamp).toLocaleTimeString();
    const element = request.clickInfo?.element?.tagName || 'Unknown';
    const delay = request.clickInfo?.timeSinceClick || 0;
    
    return `
      <div class="request-item" data-request-id="${request.id}">
        <div class="request-header">
          <span class="method ${method.toLowerCase()}">${method}</span>
          <span class="url" title="${request.url || 'Unknown URL'}">${url}</span>
          <span class="time">${time}</span>
        </div>
        <div class="request-meta">
          <span class="element-info">${element}</span>
          <span class="delay-info">${delay}ms</span>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定点击事件
  requestsList.querySelectorAll('.request-item').forEach(item => {
    item.addEventListener('click', () => {
      const requestId = item.dataset.requestId;
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
  
  modalMethod.textContent = request.method || 'GET';
  modalUrl.textContent = request.url || 'Unknown URL';
  modalTime.textContent = new Date(request.timestamp).toLocaleString();
  
  // 元素信息
  if (request.clickInfo?.element) {
    const element = request.clickInfo.element;
    const elementText = `${element.tagName}${element.className ? '.' + element.className : ''}${element.id ? '#' + element.id : ''}`;
    modalElement.textContent = elementText;
  } else {
    modalElement.textContent = 'Unknown';
  }
  
  modalDelay.textContent = `${request.clickInfo?.timeSinceClick || 0}ms`;
  
  // 请求数据
  let dataText = '';
  if (request.parsedData || request.requestBody) {
    try {
      const data = request.parsedData || request.requestBody;
      dataText = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch (e) {
      dataText = String(request.parsedData || request.requestBody || '无数据');
    }
  } else {
    dataText = '无请求参数';
  }
  
  modalData.textContent = dataText;
  
  // 显示模态框
  requestModal.style.display = 'block';
}

// 隐藏模态框
function hideModal() {
  requestModal.style.display = 'none';
}

// 复制请求数据
async function copyRequestData() {
  try {
    const dataText = modalData.textContent;
    await navigator.clipboard.writeText(dataText);
    
    const originalText = copyDataBtn.textContent;
    copyDataBtn.textContent = '已复制!';
    copyDataBtn.style.background = '#28a745';
    
    setTimeout(() => {
      copyDataBtn.textContent = originalText;
      copyDataBtn.style.background = '#17a2b8';
    }, 1500);
    
    console.log('[API捕获器] 数据已复制到剪贴板');
  } catch (error) {
    console.error('[API捕获器] 复制失败:', error);
    alert('复制失败: ' + error.message);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init); 