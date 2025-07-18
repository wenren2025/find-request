(function() {
  'use strict';
  
  console.log('[API捕获器] Content script 已加载');
  
  // 状态管理
  let isListening = false;
  let lastClickTime = 0;
  let lastClickElement = null;
  let debugMode = false; // 调试模式：捕获所有请求
  
  // 存储捕获的请求
  let capturedRequests = [];
  
  // 浮动面板相关
  let floatingPanel = null;
  let isPanelVisible = false;
  
  // 原始的XMLHttpRequest和fetch方法
  const originalXHR = window.XMLHttpRequest;
  const originalFetch = window.fetch;
  
  // 重写XMLHttpRequest
  function interceptXHR() {
    console.log('[API捕获器] 开始拦截XMLHttpRequest');
    
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      
      let method, url, requestData;
      
      xhr.open = function(m, u, async, user, password) {
        method = m;
        url = u;
        console.log(`[API捕获器] XHR Open: ${method} ${url}`);
        return originalOpen.apply(this, arguments);
      };
      
      xhr.send = function(data) {
        requestData = data;
        console.log(`[API捕获器] XHR Send: ${method} ${url}`, data);
        
        // 如果正在监听且在点击后的时间窗口内，或者处于调试模式
        if (isListening && (debugMode || Date.now() - lastClickTime < 10000)) {
          console.log('[API捕获器] 捕获到XHR请求');
          captureRequest({
            type: 'XMLHttpRequest',
            method: method,
            url: url,
            data: data,
            headers: getAllRequestHeaders(xhr),
            timestamp: Date.now(),
            clickElement: getElementInfo(lastClickElement)
          });
        } else if (isListening) {
          console.log('[API捕获器] XHR请求超出时间窗口:', Date.now() - lastClickTime, 'ms');
        } else {
          console.log('[API捕获器] 未处于监听状态，跳过XHR请求');
        }
        
        return originalSend.apply(this, arguments);
      };
      
      return xhr;
    };
  }
  
  // 重写fetch
  function interceptFetch() {
    console.log('[API捕获器] 开始拦截fetch');
    
    window.fetch = function(input, init = {}) {
      const url = typeof input === 'string' ? input : input.url;
      const method = init.method || 'GET';
      const body = init.body;
      
      console.log(`[API捕获器] Fetch: ${method} ${url}`, body);
      
      // 如果正在监听且在点击后的时间窗口内，或者处于调试模式
      if (isListening && (debugMode || Date.now() - lastClickTime < 10000)) {
        console.log('[API捕获器] 捕获到fetch请求');
        captureRequest({
          type: 'fetch',
          method: method,
          url: url,
          data: body,
          headers: init.headers || {},
          timestamp: Date.now(),
          clickElement: getElementInfo(lastClickElement)
        });
      } else if (isListening) {
        console.log('[API捕获器] Fetch请求超出时间窗口:', Date.now() - lastClickTime, 'ms');
      } else {
        console.log('[API捕获器] 未处于监听状态，跳过Fetch请求');
      }
      
      return originalFetch.apply(this, arguments);
    };
  }
  
  // 获取所有请求头（XMLHttpRequest）
  function getAllRequestHeaders(xhr) {
    // 由于安全限制，我们无法获取所有请求头，返回空对象
    return {};
  }
  
  // 获取元素信息
  function getElementInfo(element) {
    if (!element) return null;
    
    return {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      textContent: element.textContent?.substring(0, 50) || '',
      outerHTML: element.outerHTML?.substring(0, 200) || ''
    };
  }
  
  // 捕获请求
  function captureRequest(requestInfo) {
    console.log('[API捕获器] 请求已捕获:', requestInfo);
    
    // 尝试解析请求数据
    let parsedData = null;
    if (requestInfo.data) {
      try {
        if (typeof requestInfo.data === 'string') {
          // 尝试解析JSON
          parsedData = JSON.parse(requestInfo.data);
        } else if (requestInfo.data instanceof FormData) {
          // 处理FormData
          parsedData = {};
          for (let [key, value] of requestInfo.data.entries()) {
            parsedData[key] = value;
          }
        } else {
          parsedData = requestInfo.data;
        }
      } catch (e) {
        console.log('[API捕获器] 数据解析失败:', e);
        parsedData = requestInfo.data;
      }
    }
    
    const capturedRequest = {
      ...requestInfo,
      parsedData: parsedData,
      id: Date.now() + Math.random()
    };
    
    capturedRequests.push(capturedRequest);
    
    // 发送消息到background script
    chrome.runtime.sendMessage({
      type: 'REQUEST_CAPTURED',
      request: capturedRequest
    }).catch(err => {
      console.log('[API捕获器] 发送消息失败:', err);
    });
    
    // 更新浮动面板
    updateFloatingPanel();
    
    // 限制存储的请求数量
    if (capturedRequests.length > 50) {
      capturedRequests = capturedRequests.slice(-50);
    }
  }
  
  // 监听按钮点击
  function setupClickListener() {
    console.log('[API捕获器] 设置点击监听器');
    
    document.addEventListener('click', function(event) {
      if (!isListening) return;
      
      const element = event.target;
      console.log('[API捕获器] 检测到点击:', element);
      
      // 判断是否为按钮或可点击元素
      if (isClickableElement(element)) {
        console.log('[API捕获器] 点击了可监听元素:', element);
        lastClickTime = Date.now();
        lastClickElement = element;
        
        // 发送点击事件到background
        chrome.runtime.sendMessage({
          type: 'BUTTON_CLICKED',
          element: getElementInfo(element),
          timestamp: lastClickTime
        }).catch(err => {
          console.log('[API捕获器] 发送点击消息失败:', err);
        });
      }
    }, true);
  }
  
  // 判断是否为可点击元素
  function isClickableElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();
    
    // 明确的按钮元素
    if (tagName === 'button' || 
        (tagName === 'input' && ['button', 'submit'].includes(type)) ||
        element.getAttribute('role') === 'button') {
      return true;
    }
    
    // 具有点击事件的元素
    if (element.onclick || 
        element.getAttribute('onclick') ||
        element.style.cursor === 'pointer') {
      return true;
    }
    
    // 常见的可点击class名称
    const className = element.className?.toLowerCase() || '';
    if (className.includes('btn') || 
        className.includes('button') ||
        className.includes('click') ||
        className.includes('submit')) {
      return true;
    }
    
    return false;
  }
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[API捕获器] 收到消息:', message);
    
    switch (message.type) {
      case 'START_LISTENING':
        isListening = true;
        console.log('[API捕获器] Content Script开始监听');
        updateFloatingPanel();
        sendResponse({ success: true });
        return true; // 表示异步响应
        
      case 'STOP_LISTENING':
        isListening = false;
        console.log('[API捕获器] Content Script停止监听');
        updateFloatingPanel();
        sendResponse({ success: true });
        return true; // 表示异步响应
        
      case 'GET_CAPTURED_REQUESTS':
        console.log('[API捕获器] 返回捕获的请求:', capturedRequests.length);
        sendResponse({ requests: capturedRequests });
        return true; // 表示异步响应
        
      case 'CLEAR_REQUESTS':
        capturedRequests = [];
        console.log('[API捕获器] 清空请求记录');
        sendResponse({ success: true });
        return true; // 表示异步响应
        
      case 'TOGGLE_DEBUG_MODE':
        debugMode = !debugMode;
        console.log('[API捕获器] 调试模式:', debugMode ? '开启' : '关闭');
        sendResponse({ success: true, debugMode: debugMode });
        return true; // 表示异步响应
        
      case 'TOGGLE_FLOATING_PANEL':
        toggleFloatingPanel();
        sendResponse({ success: true, visible: isPanelVisible });
        return true; // 表示异步响应
        
      case 'UPDATE_PANEL_REQUESTS':
        updateFloatingPanel();
        sendResponse({ success: true });
        return true; // 表示异步响应
        
      default:
        // 对于未知消息类型，不返回true
        console.log('[API捕获器] 未知消息类型:', message.type);
        return false;
    }
  });
  
  // 创建浮动面板
  function createFloatingPanel() {
    if (floatingPanel) return;
    
    console.log('[API捕获器] 创建浮动面板');
    
    floatingPanel = document.createElement('div');
    floatingPanel.id = 'api-catcher-panel';
    floatingPanel.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">API捕获器</span>
        <div class="panel-controls">
          <button id="panel-toggle-btn" class="panel-btn">开始监听</button>
          <button id="panel-clear-btn" class="panel-btn">清空</button>
          <button id="panel-debug-btn" class="panel-btn">调试</button>
          <button id="panel-close-btn" class="panel-btn">×</button>
        </div>
      </div>
      <div class="panel-content">
        <div class="panel-status">状态: <span id="panel-status-text">未监听</span></div>
        <div class="panel-count">请求数: <span id="panel-count-text">0</span></div>
        <div class="panel-requests" id="panel-requests-list">
          <div class="no-requests">暂无请求</div>
        </div>
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #api-catcher-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        max-height: 500px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        overflow: hidden;
      }
      
      .panel-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .panel-title {
        font-weight: 600;
        font-size: 16px;
      }
      
      .panel-controls {
        display: flex;
        gap: 8px;
      }
      
      .panel-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.2s;
      }
      
      .panel-btn:hover {
        background: rgba(255,255,255,0.3);
      }
      
      .panel-content {
        padding: 12px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      .panel-status, .panel-count {
        margin-bottom: 8px;
        font-size: 13px;
      }
      
      .panel-requests {
        max-height: 300px;
        overflow-y: auto;
      }
      
      .request-item {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        font-size: 12px;
      }
      
      .request-item:hover {
        background: #e9ecef;
      }
      
      .request-method {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        color: white;
        margin-right: 8px;
      }
      
      .method-get { background: #28a745; }
      .method-post { background: #007bff; }
      .method-put { background: #ffc107; color: #333; }
      .method-delete { background: #dc3545; }
      
      .request-url {
        word-break: break-all;
        font-family: monospace;
        font-size: 11px;
        color: #666;
      }
      
      .no-requests {
        text-align: center;
        color: #666;
        font-style: italic;
        padding: 20px;
      }
      
      .listening {
        color: #28a745;
        font-weight: 600;
      }
      
      .not-listening {
        color: #dc3545;
        font-weight: 600;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(floatingPanel);
    
    // 绑定事件
    document.getElementById('panel-toggle-btn').addEventListener('click', function() {
      if (isListening) {
        chrome.runtime.sendMessage({ type: 'STOP_LISTENING_ALL_TABS' });
      } else {
        chrome.runtime.sendMessage({ type: 'START_LISTENING_ALL_TABS' });
      }
    });
    
    document.getElementById('panel-clear-btn').addEventListener('click', function() {
      capturedRequests = [];
      updateFloatingPanel();
      chrome.runtime.sendMessage({ type: 'CLEAR_ALL_REQUESTS' });
    });
    
    document.getElementById('panel-debug-btn').addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'TOGGLE_DEBUG_MODE' });
    });
    
    document.getElementById('panel-close-btn').addEventListener('click', function() {
      hideFloatingPanel();
    });
    
    updateFloatingPanel();
  }
  
  // 切换浮动面板显示/隐藏
  function toggleFloatingPanel() {
    if (isPanelVisible) {
      hideFloatingPanel();
    } else {
      showFloatingPanel();
    }
  }
  
  // 显示浮动面板
  function showFloatingPanel() {
    if (!floatingPanel) {
      createFloatingPanel();
    }
    floatingPanel.style.display = 'block';
    isPanelVisible = true;
    console.log('[API捕获器] 显示浮动面板');
  }
  
  // 隐藏浮动面板
  function hideFloatingPanel() {
    if (floatingPanel) {
      floatingPanel.style.display = 'none';
    }
    isPanelVisible = false;
    console.log('[API捕获器] 隐藏浮动面板');
  }
  
  // 更新浮动面板
  function updateFloatingPanel() {
    if (!floatingPanel || !isPanelVisible) return;
    
    const statusText = document.getElementById('panel-status-text');
    const countText = document.getElementById('panel-count-text');
    const requestsList = document.getElementById('panel-requests-list');
    const toggleBtn = document.getElementById('panel-toggle-btn');
    
    if (statusText) {
      statusText.textContent = isListening ? '正在监听' : '未监听';
      statusText.className = isListening ? 'listening' : 'not-listening';
    }
    
    if (countText) {
      countText.textContent = capturedRequests.length;
    }
    
    if (toggleBtn) {
      toggleBtn.textContent = isListening ? '停止监听' : '开始监听';
    }
    
    if (requestsList) {
      if (capturedRequests.length === 0) {
        requestsList.innerHTML = '<div class="no-requests">暂无请求</div>';
      } else {
        const recentRequests = capturedRequests.slice(-5); // 只显示最近5个
        requestsList.innerHTML = recentRequests.map((req, index) => `
          <div class="request-item" onclick="showRequestDetails(${index})">
            <span class="request-method method-${req.method?.toLowerCase() || 'get'}">${req.method || 'GET'}</span>
            <div class="request-url">${req.url || '未知URL'}</div>
          </div>
        `).join('');
        
        // 添加全局函数来显示请求详情
        window.showRequestDetails = function(index) {
          const req = capturedRequests.slice(-5)[index];
          if (req) {
            console.log('[API捕获器] 请求详情:', req);
            console.log('[API捕获器] 请求参数:', req.parsedData || req.data);
          }
        };
      }
    }
  }
  
  // 初始化
  function init() {
    console.log('[API捕获器] 初始化开始');
    
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        console.log('[API捕获器] DOM加载完成');
        setupClickListener();
      });
    } else {
      console.log('[API捕获器] DOM已经加载完成');
      setupClickListener();
    }
    
    // 拦截网络请求
    interceptXHR();
    interceptFetch();
    
    console.log('[API捕获器] 初始化完成');
  }
  
  // 启动
  init();
})(); 